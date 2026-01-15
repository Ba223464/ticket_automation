import os
import re

import requests
from django.contrib.auth import get_user_model
from django.contrib.postgres.aggregates import StringAgg
from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector
from django.db.utils import OperationalError, ProgrammingError
from django.db.models import Q, TextField, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from accounts.models import UserProfile
from accounts.utils import get_user_role
from tickets.models import Attachment, Ticket, TicketMessage
from tickets.permissions import IsAgentOrAdmin
from tickets.realtime import broadcast_ticket_event
from tickets.serializers import TicketMessageSerializer, TicketSerializer
from tickets.tasks import assign_ticket, recompute_agent_availability, send_ticket_email

User = get_user_model()


class AIDraftThrottle(UserRateThrottle):
    scope = "ai_draft"


def _redact_pii(text: str) -> str:
    if not text:
        return text
    text = re.sub(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", "[redacted-email]", text, flags=re.IGNORECASE)
    text = re.sub(r"\b\+?\d[\d\s\-()]{7,}\b", "[redacted-phone]", text)
    return text


def _gemini_list_models(api_key: str) -> list[str]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
    res = requests.get(url, timeout=15)
    if not res.ok:
        return []
    data = res.json() if res.content else {}
    models = data.get("models") or []
    out = []
    for m in models:
        name = (m.get("name") or "").strip()
        if not name.startswith("models/"):
            continue
        supported = set(m.get("supportedGenerationMethods") or [])
        if "generateContent" not in supported:
            continue
        out.append(name[len("models/") :])
    return out


def _gemini_generate(prompt: str) -> str:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    preferred = [
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
        "gemini-1.5-pro",
        "gemini-1.5-pro-latest",
        "gemini-1.0-pro",
    ]

    discovered = []
    try:
        discovered = _gemini_list_models(api_key)
    except Exception:
        discovered = []

    if discovered:
        model_candidates = [m for m in preferred if m in set(discovered)]
        if not model_candidates:
            model_candidates = discovered
    else:
        model_candidates = preferred

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 300,
        },
    }

    last_res = None
    for model in model_candidates:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        res = requests.post(url, json=payload, timeout=20)
        last_res = res
        if res.ok:
            data = res.json() if res.content else {}
            candidates = data.get("candidates") or []
            if not candidates:
                return ""
            content = (candidates[0].get("content") or {}).get("parts") or []
            text = "".join([p.get("text", "") for p in content if isinstance(p, dict)])
            return (text or "").strip()

        if res.status_code not in {404, 403}:
            break

    status_code = getattr(last_res, "status_code", "unknown")
    body = (getattr(last_res, "text", "") or "").strip()
    body = body[:1000]
    raise RuntimeError(
        f"Gemini API error: HTTP {status_code} {body} (tried models: {', '.join(model_candidates[:8])})"
    )


class TicketViewSet(viewsets.ModelViewSet):
    serializer_class = TicketSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        role = get_user_role(self.request.user)
        qs = Ticket.objects.all().order_by("-created_at")

        status_filter = (self.request.query_params.get("status") or "").strip()
        priority_filter = (self.request.query_params.get("priority") or "").strip()
        assigned_agent_filter = (self.request.query_params.get("assigned_agent") or "").strip()
        created_from = (self.request.query_params.get("created_from") or "").strip()
        created_to = (self.request.query_params.get("created_to") or "").strip()

        if status_filter:
            qs = qs.filter(status=status_filter)
        if priority_filter:
            qs = qs.filter(priority=priority_filter)
        if assigned_agent_filter:
            if assigned_agent_filter.isdigit():
                qs = qs.filter(assigned_agent_id=int(assigned_agent_filter))
            else:
                user_match = User.objects.filter(
                    Q(username__iexact=assigned_agent_filter) | Q(email__iexact=assigned_agent_filter)
                ).first()
                if user_match is not None:
                    qs = qs.filter(assigned_agent_id=user_match.id)

        if created_from:
            try:
                qs = qs.filter(created_at__date__gte=created_from)
            except Exception:
                pass
        if created_to:
            try:
                qs = qs.filter(created_at__date__lte=created_to)
            except Exception:
                pass

        if role == UserProfile.Role.CUSTOMER:
            return qs.filter(customer=self.request.user)

        if role == UserProfile.Role.AGENT:
            return qs.filter(assigned_agent=self.request.user)

        return qs

    def perform_create(self, serializer):
        ticket = serializer.save(customer=self.request.user)
        assign_ticket.delay(ticket.id)

    @action(detail=False, methods=["get"], url_path="search", permission_classes=[IsAuthenticated])
    def search(self, request):
        q = (request.query_params.get("q") or "").strip()
        if not q:
            return Response({"detail": "q is required"}, status=status.HTTP_400_BAD_REQUEST)

        role = get_user_role(request.user)
        qs = self.get_queryset()

        status_filter = (request.query_params.get("status") or "").strip()
        priority_filter = (request.query_params.get("priority") or "").strip()
        assigned_agent_filter = (request.query_params.get("assigned_agent") or "").strip()

        if status_filter:
            qs = qs.filter(status=status_filter)
        if priority_filter:
            qs = qs.filter(priority=priority_filter)
        if assigned_agent_filter:
            if assigned_agent_filter.isdigit():
                qs = qs.filter(assigned_agent_id=int(assigned_agent_filter))
            else:
                user_match = User.objects.filter(
                    Q(username__iexact=assigned_agent_filter) | Q(email__iexact=assigned_agent_filter)
                ).first()
                if user_match is not None:
                    qs = qs.filter(assigned_agent_id=user_match.id)

        msg_filter = Q(messages__is_internal=False)
        if role in {UserProfile.Role.AGENT, UserProfile.Role.ADMIN}:
            msg_filter = Q()

        qs = qs.annotate(
            messages_text=Coalesce(
                StringAgg(
                    "messages__body",
                    delimiter=" ",
                    filter=msg_filter,
                    distinct=True,
                    output_field=TextField(),
                ),
                Value("", output_field=TextField()),
                output_field=TextField(),
            )
        )

        vector = (
            SearchVector("subject", weight="A")
            + SearchVector("description", weight="B")
            + SearchVector("messages_text", weight="C")
        )
        query = SearchQuery(q)

        qs = qs.annotate(rank=SearchRank(vector, query)).filter(rank__gt=0.0).order_by("-rank", "-created_at")

        return Response(TicketSerializer(qs[:50], many=True).data)

    @action(
        detail=True,
        methods=["get", "post"],
        url_path="messages",
        permission_classes=[IsAuthenticated],
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def messages(self, request, pk=None):
        ticket = self.get_object()
        role = get_user_role(request.user)
        if request.method.lower() == "get":
            qs = TicketMessage.objects.filter(ticket=ticket).order_by("created_at")
            if role == UserProfile.Role.CUSTOMER:
                qs = qs.filter(is_internal=False)
            return Response(TicketMessageSerializer(qs, many=True).data)

        raw_internal = request.data.get("is_internal", False)
        if isinstance(raw_internal, str):
            raw_internal = raw_internal.strip().lower() in {"1", "true", "yes", "y", "on"}
        is_internal = bool(raw_internal)

        serializer = TicketMessageSerializer(
            data={
                "body": request.data.get("body", ""),
                "is_internal": is_internal,
            }
        )
        serializer.is_valid(raise_exception=True)
        if is_internal and role == UserProfile.Role.CUSTOMER:
            return Response({"detail": "Customers cannot create internal messages"}, status=status.HTTP_403_FORBIDDEN)

        msg = serializer.save(ticket=ticket, author=request.user, is_internal=is_internal)

        files = []
        try:
            files = request.FILES.getlist("files")
        except Exception:
            files = []

        for f in files:
            try:
                Attachment.objects.create(
                    ticket=ticket,
                    message=msg,
                    uploader=request.user,
                    file=f,
                    filename=getattr(f, "name", "") or "",
                    content_type=getattr(f, "content_type", "") or "",
                    size=int(getattr(f, "size", 0) or 0),
                )
            except (ProgrammingError, OperationalError):
                # Attachments table may not be migrated yet; keep message send working.
                break

        ticket.last_message_at = timezone.now()
        ticket.save(update_fields=["last_message_at", "updated_at"])

        broadcast_ticket_event(
            ticket.id,
            {
                "type": "ticket.message_created",
                "ticket_id": ticket.id,
                "message": TicketMessageSerializer(msg).data,
            },
        )

        send_ticket_email.delay(
            "ticket.message_created",
            ticket.id,
            msg.id,
            None,
        )

        return Response(TicketMessageSerializer(msg).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="set-status", permission_classes=[IsAgentOrAdmin])
    def set_status(self, request, pk=None):
        ticket = self.get_object()
        new_status = request.data.get("status")
        valid = {c[0] for c in Ticket.Status.choices}
        if new_status not in valid:
            return Response(
                {"detail": "Invalid status", "valid": sorted(valid)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ticket.status = new_status
        if new_status == Ticket.Status.CLOSED:
            ticket.closed_at = timezone.now()
        ticket.save(update_fields=["status", "closed_at", "updated_at"])

        broadcast_ticket_event(
            ticket.id,
            {
                "type": "ticket.status_changed",
                "ticket_id": ticket.id,
                "status": ticket.status,
            },
        )

        send_ticket_email.delay(
            "ticket.status_changed",
            ticket.id,
            None,
            ticket.status,
        )

        if ticket.assigned_agent_id is not None and new_status in {Ticket.Status.RESOLVED, Ticket.Status.CLOSED}:
            recompute_agent_availability.delay(int(ticket.assigned_agent_id))

        return Response(TicketSerializer(ticket).data)

    @action(detail=True, methods=["post"], url_path="assign", permission_classes=[IsAgentOrAdmin])
    def assign(self, request, pk=None):
        ticket = self.get_object()
        agent_id = request.data.get("assigned_agent")
        if not agent_id:
            return Response({"detail": "assigned_agent is required"}, status=status.HTTP_400_BAD_REQUEST)

        ticket.assigned_agent_id = agent_id
        if ticket.status == Ticket.Status.OPEN:
            ticket.status = Ticket.Status.ASSIGNED
        ticket.save(update_fields=["assigned_agent", "status", "updated_at"])

        broadcast_ticket_event(
            ticket.id,
            {
                "type": "ticket.assigned",
                "ticket_id": ticket.id,
                "assigned_agent": ticket.assigned_agent_id,
                "status": ticket.status,
            },
        )

        send_ticket_email.delay(
            "ticket.assigned",
            ticket.id,
            None,
            ticket.status,
        )
        return Response(TicketSerializer(ticket).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="ai-draft",
        permission_classes=[IsAgentOrAdmin],
        throttle_classes=[AIDraftThrottle],
    )
    def ai_draft(self, request, pk=None):
        ticket = self.get_object()

        msgs = TicketMessage.objects.filter(ticket=ticket, is_internal=False).order_by("-created_at")[:10]
        msgs = list(reversed(list(msgs)))

        history_lines = []
        for m in msgs:
            author = getattr(m.author, "username", None) or "unknown"
            history_lines.append(f"{author}: {_redact_pii(m.body)}")

        prompt = "\n".join(
            [
                "You are a helpful customer support agent.",
                "Write a short, friendly, and actionable reply.",
                "Do not include private data. If you need more info, ask concise questions.",
                "",
                f"Ticket subject: {_redact_pii(ticket.subject)}",
                f"Ticket description: {_redact_pii(ticket.description)}",
                "",
                "Conversation:",
                *history_lines,
                "",
                "Draft reply:",
            ]
        )

        try:
            draft = _gemini_generate(prompt)
        except RuntimeError as e:
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception:
            return Response({"detail": "Failed to generate draft"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({"ticket_id": ticket.id, "draft": draft})

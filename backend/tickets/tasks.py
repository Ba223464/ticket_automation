from celery import shared_task
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Count, Q

from accounts.models import UserProfile
from tickets.models import Ticket, TicketMessage
from tickets.realtime import broadcast_ticket_event

User = get_user_model()


def _dedupe_emails(emails):
    out = []
    seen = set()
    for e in emails:
        e = (e or "").strip()
        if not e:
            continue
        key = e.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(e)
    return out


@shared_task
def send_ticket_email(event_type: str, ticket_id: int, message_id: int | None = None, new_status: str | None = None):
    try:
        ticket = Ticket.objects.select_related("customer", "assigned_agent").get(id=ticket_id)
    except Ticket.DoesNotExist:
        return False

    message = None
    if message_id is not None:
        try:
            message = TicketMessage.objects.select_related("author").get(id=message_id)
        except TicketMessage.DoesNotExist:
            message = None

    customer_email = getattr(ticket.customer, "email", "") if ticket.customer_id else ""
    agent_email = getattr(ticket.assigned_agent, "email", "") if ticket.assigned_agent_id else ""

    to_emails = []
    if event_type == "ticket.message_created":
        if message is None:
            return False
        if message.is_internal:
            to_emails = [agent_email]
        else:
            to_emails = [customer_email, agent_email]
    elif event_type == "ticket.status_changed":
        to_emails = [customer_email, agent_email]
    elif event_type == "ticket.assigned":
        to_emails = [customer_email, agent_email]
    else:
        to_emails = [customer_email, agent_email]

    to_emails = _dedupe_emails(to_emails)
    if not to_emails:
        return True

    subject = f"[Ticket #{ticket.id}] {ticket.subject}"

    lines = [
        f"Ticket #{ticket.id}",
        f"Subject: {ticket.subject}",
        f"Status: {new_status or ticket.status}",
        f"Priority: {ticket.priority}",
        f"Event: {event_type}",
        "",
    ]

    if message is not None:
        author = getattr(message.author, "username", None) or "unknown"
        lines += [
            f"Message from: {author}",
            f"Internal: {message.is_internal}",
            "",
            message.body,
            "",
        ]

    body = "\n".join(lines)
    send_mail(subject, body, None, to_emails, fail_silently=True)
    return True


@shared_task
def assign_ticket(ticket_id: int) -> bool:
    try:
        ticket = Ticket.objects.get(id=ticket_id)
    except Ticket.DoesNotExist:
        return False

    if ticket.assigned_agent_id is not None:
        return True

    with transaction.atomic():
        ticket = Ticket.objects.select_for_update().get(id=ticket_id)
        if ticket.assigned_agent_id is not None:
            return True

        # Count active assigned tickets per agent (exclude resolved/closed)
        active_statuses = [
            Ticket.Status.OPEN,
            Ticket.Status.ASSIGNED,
            Ticket.Status.IN_PROGRESS,
            Ticket.Status.WAITING_ON_CUSTOMER,
        ]

        agent_qs = (
            User.objects.filter(profile__role=UserProfile.Role.AGENT, profile__is_available=True)
            .annotate(
                active_count=Count(
                    "assigned_tickets",
                    filter=Q(assigned_tickets__status__in=active_statuses),
                    distinct=True,
                )
            )
            .order_by("active_count", "id")
        )

        selected = None
        for agent in agent_qs:
            cap = getattr(getattr(agent, "profile", None), "capacity", 0) or 0
            if agent.active_count < cap:
                selected = agent
                break

        if selected is None:
            return False

        ticket.assigned_agent = selected
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

    return True

from django.contrib.auth import get_user_model
from django.db.models import Count
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import UserProfile
from accounts.permissions import IsAdmin
from accounts.serializers import UserProfileSerializer, UserSerializer
from accounts.utils import get_user_role
from tickets.tasks import assign_ticket


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class AvailabilityView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = get_user_role(request.user)
        if role not in {UserProfile.Role.AGENT, UserProfile.Role.ADMIN}:
            return Response({"detail": "Only agents/admins can view availability"}, status=status.HTTP_403_FORBIDDEN)

        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        from tickets.models import Ticket

        active_statuses = [
            Ticket.Status.OPEN,
            Ticket.Status.ASSIGNED,
            Ticket.Status.IN_PROGRESS,
            Ticket.Status.WAITING_ON_CUSTOMER,
        ]
        active_count = Ticket.objects.filter(assigned_agent=request.user, status__in=active_statuses).count()

        data = UserProfileSerializer(profile).data
        data["active_assigned_count"] = active_count
        return Response(data)

    def patch(self, request):
        role = get_user_role(request.user)
        if role not in {UserProfile.Role.AGENT, UserProfile.Role.ADMIN}:
            return Response({"detail": "Only agents/admins can set availability"}, status=status.HTTP_403_FORBIDDEN)

        profile, _ = UserProfile.objects.get_or_create(user=request.user)

        before_available = bool(profile.is_available)

        if "is_available" in request.data:
            profile.is_available = bool(request.data.get("is_available"))

        if "capacity" in request.data:
            try:
                profile.capacity = int(request.data.get("capacity"))
            except Exception:
                return Response({"detail": "capacity must be an integer"}, status=status.HTTP_400_BAD_REQUEST)

        profile.save(update_fields=["is_available", "capacity"])

        if role == UserProfile.Role.AGENT and (not before_available) and profile.is_available:
            from tickets.models import Ticket

            unassigned = (
                Ticket.objects.filter(status=Ticket.Status.OPEN, assigned_agent__isnull=True)
                .order_by("created_at")
                .values_list("id", flat=True)[:50]
            )
            for tid in unassigned:
                assign_ticket.delay(int(tid))

        from tickets.models import Ticket

        active_statuses = [
            Ticket.Status.OPEN,
            Ticket.Status.ASSIGNED,
            Ticket.Status.IN_PROGRESS,
            Ticket.Status.WAITING_ON_CUSTOMER,
        ]
        active_count = Ticket.objects.filter(assigned_agent=request.user, status__in=active_statuses).count()

        data = UserProfileSerializer(profile).data
        data["active_assigned_count"] = active_count
        return Response(data)


class AdminAgentsPresenceView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        User = get_user_model()
        agents = (
            User.objects.filter(profile__role=UserProfile.Role.AGENT, is_active=True)
            .select_related("profile")
            .order_by("username")
        )

        from tickets.models import Ticket

        active_statuses = [
            Ticket.Status.OPEN,
            Ticket.Status.ASSIGNED,
            Ticket.Status.IN_PROGRESS,
            Ticket.Status.WAITING_ON_CUSTOMER,
        ]

        counts = (
            Ticket.objects.filter(
                assigned_agent_id__in=agents.values_list("id", flat=True),
                status__in=active_statuses,
            )
            .values("assigned_agent_id")
            .annotate(c=Count("id"))
        )
        count_map = {row["assigned_agent_id"]: row["c"] for row in counts}

        out = []
        for u in agents:
            p = getattr(u, "profile", None)
            out.append(
                {
                    "id": u.id,
                    "username": u.username,
                    "email": u.email,
                    "is_available": bool(getattr(p, "is_available", False)),
                    "capacity": int(getattr(p, "capacity", 0) or 0),
                    "active_assigned_count": int(count_map.get(u.id, 0)),
                }
            )

        out.sort(key=lambda r: (not r["is_available"], r["username"].lower()))
        return Response({"agents": out})

from datetime import timedelta

from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F
from django.db.models.functions import TruncDate
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from accounts.permissions import IsAdmin
from tickets.models import Ticket


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok"})


@api_view(["GET"])
@permission_classes([IsAdmin])
def analytics_summary(request):
    qs = Ticket.objects.all()
    by_status = dict(qs.values_list("status").annotate(c=Count("id")))
    total = qs.count()
    open_like = qs.exclude(status__in=[Ticket.Status.RESOLVED, Ticket.Status.CLOSED]).count()
    return Response(
        {
            "total": total,
            "open_like": open_like,
            "by_status": by_status,
        }
    )


@api_view(["GET"])
@permission_classes([IsAdmin])
def analytics_volume(request):
    try:
        days = int(request.query_params.get("days", "30"))
    except ValueError:
        return Response({"detail": "days must be an integer"}, status=400)

    if days <= 0:
        return Response({"detail": "days must be > 0"}, status=400)

    # use timezone-aware filtering via Django
    from django.utils import timezone

    start = timezone.now() - timedelta(days=days)
    qs = (
        Ticket.objects.filter(created_at__gte=start)
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(count=Count("id"))
        .order_by("day")
    )

    series = [{"day": str(r["day"]), "count": r["count"]} for r in qs]
    return Response({"days": days, "series": series})


@api_view(["GET"])
@permission_classes([IsAdmin])
def analytics_resolution(request):
    qs = Ticket.objects.filter(closed_at__isnull=False)
    duration = ExpressionWrapper(F("closed_at") - F("created_at"), output_field=DurationField())
    agg = qs.aggregate(avg_resolution=Avg(duration), resolved_count=Count("id"))

    avg = agg.get("avg_resolution")
    avg_seconds = int(avg.total_seconds()) if avg else None

    return Response(
        {
            "resolved_count": agg.get("resolved_count", 0),
            "avg_resolution_seconds": avg_seconds,
        }
    )

from rest_framework.routers import DefaultRouter

from tickets.views import TicketViewSet

router = DefaultRouter()
router.register(r"tickets", TicketViewSet, basename="ticket")

urlpatterns = router.urls

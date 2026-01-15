from django.urls import re_path

from tickets.consumers import TicketConsumer

websocket_urlpatterns = [
    re_path(r"^ws/tickets/(?P<ticket_id>\d+)/$", TicketConsumer.as_asgi()),
]

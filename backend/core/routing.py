from django.urls import re_path

from core.consumers import EchoConsumer
from tickets.routing import websocket_urlpatterns as ticket_websocket_urlpatterns

websocket_urlpatterns = [
    re_path(r"^ws/echo/$", EchoConsumer.as_asgi()),
]

websocket_urlpatterns += ticket_websocket_urlpatterns

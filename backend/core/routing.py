from django.urls import re_path

from core.consumers import EchoConsumer

websocket_urlpatterns = [
    re_path(r"^ws/echo/$", EchoConsumer.as_asgi()),
]

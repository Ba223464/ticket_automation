import json

from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.db.models import Q

from accounts.models import UserProfile
from accounts.utils import get_user_role
from tickets.models import Ticket


class TicketConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or isinstance(user, AnonymousUser) or not user.is_authenticated:
            await self.close(code=4401)
            return

        ticket_id = self.scope["url_route"]["kwargs"].get("ticket_id")
        if ticket_id is None:
            await self.close(code=4400)
            return

        try:
            ticket_id = int(ticket_id)
        except Exception:
            await self.close(code=4400)
            return

        role = await self._get_role(user)

        allowed = False
        if role == UserProfile.Role.ADMIN:
            allowed = True
        elif role == UserProfile.Role.AGENT:
            allowed = await self._ticket_exists(Q(id=ticket_id, assigned_agent_id=user.id))
        else:
            allowed = await self._ticket_exists(Q(id=ticket_id, customer_id=user.id))

        if not allowed:
            await self.close(code=4403)
            return

        self.ticket_id = ticket_id
        self.group_name = f"ticket_{ticket_id}"

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        group = getattr(self, "group_name", None)
        if group:
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        # read-only socket for now
        return

    async def ticket_event(self, event):
        await self.send(text_data=json.dumps(event.get("payload", {})))

    @database_sync_to_async
    def _get_role(self, user):
        return get_user_role(user)

    @database_sync_to_async
    def _ticket_exists(self, q):
        return Ticket.objects.filter(q).exists()

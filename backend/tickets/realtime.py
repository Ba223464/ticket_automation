from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def broadcast_ticket_event(ticket_id: int, payload: dict):
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"ticket_{ticket_id}",
        {
            "type": "ticket.event",
            "payload": payload,
        },
    )

import json

from channels.generic.websocket import AsyncWebsocketConsumer


class EchoConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()

    async def receive(self, text_data=None, bytes_data=None):
        if text_data is None:
            return
        await self.send(text_data=json.dumps({"echo": text_data}))

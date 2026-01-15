from rest_framework import serializers

from tickets.models import Ticket, TicketMessage


class TicketSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        fields = [
            "id",
            "customer",
            "assigned_agent",
            "subject",
            "description",
            "status",
            "priority",
            "created_at",
            "updated_at",
            "last_message_at",
            "closed_at",
        ]
        read_only_fields = [
            "id",
            "customer",
            "assigned_agent",
            "created_at",
            "updated_at",
            "last_message_at",
            "closed_at",
        ]


class TicketMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketMessage
        fields = [
            "id",
            "ticket",
            "author",
            "body",
            "is_internal",
            "created_at",
        ]
        read_only_fields = ["id", "ticket", "author", "created_at"]

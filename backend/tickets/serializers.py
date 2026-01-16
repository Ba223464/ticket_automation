from rest_framework import serializers

from tickets.models import Attachment, Ticket, TicketMessage


class TicketSerializer(serializers.ModelSerializer):
    assigned_agent_username = serializers.SerializerMethodField()
    customer_username = serializers.SerializerMethodField()

    def get_assigned_agent_username(self, obj):
        try:
            u = getattr(obj, "assigned_agent", None)
            return getattr(u, "username", None)
        except Exception:
            return None

    def get_customer_username(self, obj):
        try:
            u = getattr(obj, "customer", None)
            return getattr(u, "username", None)
        except Exception:
            return None

    class Meta:
        model = Ticket
        fields = [
            "id",
            "customer",
            "customer_username",
            "assigned_agent",
            "assigned_agent_username",
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
            "customer_username",
            "assigned_agent_username",
            "created_at",
            "updated_at",
            "last_message_at",
            "closed_at",
        ]


class TicketMessageSerializer(serializers.ModelSerializer):
    attachments = serializers.SerializerMethodField()

    def get_attachments(self, obj):
        qs = getattr(obj, "attachments", None)
        if qs is None:
            return []
        return AttachmentSerializer(qs.all().order_by("id"), many=True, context=self.context).data

    class Meta:
        model = TicketMessage
        fields = [
            "id",
            "ticket",
            "author",
            "body",
            "is_internal",
            "created_at",
            "attachments",
        ]
        read_only_fields = ["id", "ticket", "author", "created_at"]


class AttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    def get_url(self, obj):
        try:
            return obj.file.url
        except Exception:
            return ""

    class Meta:
        model = Attachment
        fields = ["id", "filename", "content_type", "size", "created_at", "url"]
        read_only_fields = fields

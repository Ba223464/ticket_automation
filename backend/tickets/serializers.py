from rest_framework import serializers

from tickets.models import Attachment, Ticket, TicketMessage


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

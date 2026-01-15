from django.conf import settings
from django.db import models


class UserProfile(models.Model):
    class Role(models.TextChoices):
        CUSTOMER = "customer", "Customer"
        AGENT = "agent", "Agent"
        ADMIN = "admin", "Admin"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.CUSTOMER)

    is_available = models.BooleanField(default=False)
    capacity = models.PositiveIntegerField(default=5)

    def __str__(self) -> str:
        return f"UserProfile(user_id={self.user_id}, role={self.role})"

from django.contrib import admin

from accounts.models import UserProfile


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "role", "is_available", "capacity")
    list_filter = ("role", "is_available")
    search_fields = ("user__email", "user__username")

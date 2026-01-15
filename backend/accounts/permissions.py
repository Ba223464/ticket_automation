from rest_framework.permissions import BasePermission

from accounts.models import UserProfile
from accounts.utils import get_user_role


class IsSelfAgentOrAdmin(BasePermission):
    def has_permission(self, request, view):
        role = get_user_role(request.user)
        if role == UserProfile.Role.ADMIN:
            return True
        if role == UserProfile.Role.AGENT:
            return True
        return False

    def has_object_permission(self, request, view, obj):
        role = get_user_role(request.user)
        if role == UserProfile.Role.ADMIN:
            return True
        return getattr(obj, "user_id", None) == getattr(request.user, "id", None)


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        role = get_user_role(request.user)
        return role == UserProfile.Role.ADMIN

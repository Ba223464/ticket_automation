from rest_framework.permissions import BasePermission

from accounts.models import UserProfile
from accounts.utils import get_user_role


class IsAgentOrAdmin(BasePermission):
    def has_permission(self, request, view):
        role = get_user_role(request.user)
        return role in {UserProfile.Role.AGENT, UserProfile.Role.ADMIN}

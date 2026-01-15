from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import UserProfile
from accounts.serializers import UserProfileSerializer, UserSerializer
from accounts.utils import get_user_role


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class AvailabilityView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = get_user_role(request.user)
        if role not in {UserProfile.Role.AGENT, UserProfile.Role.ADMIN}:
            return Response({"detail": "Only agents/admins can view availability"}, status=status.HTTP_403_FORBIDDEN)

        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        return Response(UserProfileSerializer(profile).data)

    def patch(self, request):
        role = get_user_role(request.user)
        if role not in {UserProfile.Role.AGENT, UserProfile.Role.ADMIN}:
            return Response({"detail": "Only agents/admins can set availability"}, status=status.HTTP_403_FORBIDDEN)

        profile, _ = UserProfile.objects.get_or_create(user=request.user)

        if "is_available" in request.data:
            profile.is_available = bool(request.data.get("is_available"))

        if "capacity" in request.data:
            try:
                profile.capacity = int(request.data.get("capacity"))
            except Exception:
                return Response({"detail": "capacity must be an integer"}, status=status.HTTP_400_BAD_REQUEST)

        profile.save(update_fields=["is_available", "capacity"])
        return Response(UserProfileSerializer(profile).data)

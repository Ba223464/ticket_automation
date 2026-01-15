import os

from django.contrib.auth import get_user_model
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import UserProfile
from accounts.permissions import IsAdmin
from accounts.serializers import UserSerializer

User = get_user_model()


class GoogleLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get("id_token")
        if not token:
            return Response({"detail": "id_token is required"}, status=status.HTTP_400_BAD_REQUEST)

        client_id = os.getenv("GOOGLE_CLIENT_ID")
        if not client_id:
            return Response({"detail": "GOOGLE_CLIENT_ID is not configured"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            info = google_id_token.verify_oauth2_token(token, google_requests.Request(), audience=client_id)
        except Exception:
            return Response({"detail": "Invalid Google token"}, status=status.HTTP_401_UNAUTHORIZED)

        email = info.get("email")
        if not email:
            return Response({"detail": "Google token missing email"}, status=status.HTTP_400_BAD_REQUEST)

        user, _ = User.objects.get_or_create(
            email=email,
            defaults={
                "username": email,
                "first_name": info.get("given_name", ""),
                "last_name": info.get("family_name", ""),
            },
        )

        refresh = RefreshToken.for_user(user)

        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": UserSerializer(user).data,
            }
        )


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        email = (request.data.get("email") or "").strip()
        password = request.data.get("password")

        if not username:
            return Response({"detail": "username is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not password:
            return Response({"detail": "password is required"}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(username=username).exists():
            return Response({"detail": "username already exists"}, status=status.HTTP_400_BAD_REQUEST)
        if email and User.objects.filter(email=email).exists():
            return Response({"detail": "email already exists"}, status=status.HTTP_400_BAD_REQUEST)

        user = User(username=username, email=email)
        user.set_password(password)
        user.save()

        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = UserProfile.Role.CUSTOMER
        profile.save(update_fields=["role"])

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )


class AdminCreateUserView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        email = (request.data.get("email") or "").strip()
        password = request.data.get("password")
        role = (request.data.get("role") or UserProfile.Role.AGENT).strip()

        valid_roles = {c[0] for c in UserProfile.Role.choices}
        if role not in valid_roles:
            return Response(
                {"detail": "Invalid role", "valid": sorted(valid_roles)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not username:
            return Response({"detail": "username is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not password:
            return Response({"detail": "password is required"}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(username=username).exists():
            return Response({"detail": "username already exists"}, status=status.HTTP_400_BAD_REQUEST)
        if email and User.objects.filter(email=email).exists():
            return Response({"detail": "email already exists"}, status=status.HTTP_400_BAD_REQUEST)

        user = User(username=username, email=email)
        user.set_password(password)
        user.save()

        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = role
        profile.save(update_fields=["role"])

        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)

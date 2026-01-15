import os
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import EmailOTP, EmailVerificationToken, UserProfile
from accounts.permissions import IsAdmin
from accounts.serializers import UserSerializer

User = get_user_model()


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _generate_otp_code() -> str:
    import random

    return f"{random.randint(0, 999999):06d}"


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
        verification_token = request.data.get("verification_token")

        if not username:
            return Response({"detail": "username is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not password:
            return Response({"detail": "password is required"}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(username=username).exists():
            return Response({"detail": "username already exists"}, status=status.HTTP_400_BAD_REQUEST)
        if email and User.objects.filter(email=email).exists():
            return Response({"detail": "email already exists"}, status=status.HTTP_400_BAD_REQUEST)

        if email:
            norm_email = _normalize_email(email)
            if not verification_token:
                return Response({"detail": "Email verification required", "code": "email_not_verified"}, status=status.HTTP_400_BAD_REQUEST)

            try:
                vt = EmailVerificationToken.objects.get(token=verification_token)
            except Exception:
                return Response({"detail": "Invalid verification token", "code": "invalid_verification_token"}, status=status.HTTP_400_BAD_REQUEST)

            if _normalize_email(vt.email) != norm_email:
                return Response({"detail": "Verification token email mismatch", "code": "verification_email_mismatch"}, status=status.HTTP_400_BAD_REQUEST)
            if vt.is_used() or vt.is_expired():
                return Response({"detail": "Verification token expired", "code": "verification_token_expired"}, status=status.HTTP_400_BAD_REQUEST)

            vt.used_at = timezone.now()
            vt.save(update_fields=["used_at"])

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


class RequestEmailOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = _normalize_email(request.data.get("email"))
        if not email:
            return Response({"detail": "email is required"}, status=status.HTTP_400_BAD_REQUEST)

        code = _generate_otp_code()
        now = timezone.now()
        EmailOTP.objects.create(
            email=email,
            code_hash=make_password(code),
            expires_at=now + timedelta(minutes=10),
        )

        subject = "Your verification code"
        body = "\n".join(
            [
                "Your Ticket Automation verification code is:",
                "",
                code,
                "",
                "This code expires in 10 minutes.",
            ]
        )
        from tickets.tasks import send_email

        send_email.delay(subject, body, [email])

        return Response({"detail": "OTP sent", "expires_in_seconds": 600})


class VerifyEmailOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = _normalize_email(request.data.get("email"))
        code = (request.data.get("code") or "").strip()
        if not email:
            return Response({"detail": "email is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not code:
            return Response({"detail": "code is required"}, status=status.HTTP_400_BAD_REQUEST)

        otp = (
            EmailOTP.objects.filter(email=email, used_at__isnull=True, expires_at__gt=timezone.now())
            .order_by("-created_at")
            .first()
        )
        if otp is None:
            return Response({"detail": "OTP expired", "code": "otp_expired"}, status=status.HTTP_400_BAD_REQUEST)

        if not check_password(code, otp.code_hash):
            return Response({"detail": "Invalid code", "code": "invalid_otp"}, status=status.HTTP_400_BAD_REQUEST)

        otp.used_at = timezone.now()
        otp.save(update_fields=["used_at"])

        vt = EmailVerificationToken.objects.create(
            email=email,
            expires_at=timezone.now() + timedelta(minutes=30),
        )

        return Response({"detail": "verified", "verification_token": str(vt.token), "expires_in_seconds": 1800})


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

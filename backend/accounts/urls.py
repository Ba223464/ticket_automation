from django.urls import path

from accounts.views import (
    AdminCreateUserView,
    GoogleLoginView,
    RegisterView,
    RequestEmailOTPView,
    VerifyEmailOTPView,
)
from accounts.me import AvailabilityView, MeView

urlpatterns = [
    path("auth/google/", GoogleLoginView.as_view(), name="google_login"),
    path("auth/request-otp/", RequestEmailOTPView.as_view(), name="request_email_otp"),
    path("auth/verify-otp/", VerifyEmailOTPView.as_view(), name="verify_email_otp"),
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("admin/users/", AdminCreateUserView.as_view(), name="admin_create_user"),
    path("me/", MeView.as_view(), name="me"),
    path("me/availability/", AvailabilityView.as_view(), name="availability"),
]

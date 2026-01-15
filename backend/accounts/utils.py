from accounts.models import UserProfile


def get_user_role(user) -> str:
    if user is None or not getattr(user, "is_authenticated", False):
        return UserProfile.Role.CUSTOMER

    profile, _ = UserProfile.objects.get_or_create(user=user)
    return profile.role

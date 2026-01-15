from django.urls import path

from core import views

urlpatterns = [
    path("health/", views.health, name="health"),
    path("analytics/summary/", views.analytics_summary, name="analytics_summary"),
    path("analytics/volume/", views.analytics_volume, name="analytics_volume"),
    path("analytics/resolution/", views.analytics_resolution, name="analytics_resolution"),
]

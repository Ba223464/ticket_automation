# Smart Customer Support & Ticket Automation System

A real-time, AI-assisted customer support platform (Zendesk-style UI) built with:

- **Backend**: Django + Django REST Framework, Channels (WebSockets), Celery + Redis, Postgres
- **Frontend**: React (Vite)
- **Auth**: JWT (SimpleJWT), optional Google sign-in endpoint, Email OTP verification for signup
- **AI**: Gemini draft reply generation (agent/admin)

## Quick start (Docker)

### 1) Configure environment

Edit `backend/.env` (example keys you may need):

- `DJANGO_SECRET_KEY`
- `DATABASE_URL`
- `REDIS_URL`
- `GEMINI_API_KEY` (for AI drafts)
- `EMAIL_BACKEND` / SMTP vars (for real emails)

### 2) Run

```bash
docker-compose up -d --build
```

### 3) Migrate

```bash
docker-compose exec backend python manage.py migrate
```

### 4) Open the app

- Frontend: http://localhost:3000
- Backend API: http://localhost:8001/api/health/

## Core features

- Customer ticket creation and lifecycle workflow
- Agent assignment (availability + capacity)
- Real-time updates via WebSockets
- Email notifications on ticket activity
- AI-generated draft replies (Gemini) for agents/admins
- Full-text search (Postgres)
- Admin-only analytics dashboard

## Documentation

See `docs/PROJECT_DOCUMENTATION.md` for:

- File-by-file overview
- Step-by-step implementation guide
- API endpoints and system architecture

# Project Documentation

## 1) What each file does (high-level map)

This section lists the key files and directories and their responsibilities.

### Repository root

- **`docker-compose.yml`**
  - Defines dev stack: Postgres, Redis, Django backend (ASGI), Celery worker, and React frontend.
  - Backend runs with an ASGI server (supports WebSockets).

- **`README.md`**
  - Quick start guide and pointers to this documentation.

- **`docs/PROJECT_DOCUMENTATION.md`**
  - This document.

---

## Backend (`/backend`)

### Backend entry / configuration

- **`backend/manage.py`**
  - Django management entrypoint (migrate, createsuperuser, etc.).

- **`backend/config/settings.py`**
  - Django settings.
  - Key configuration:
    - **DRF + JWT** authentication
    - **Channels** (Redis channel layer)
    - **Celery** broker/result (Redis)
    - **Postgres full-text search enablement** (`django.contrib.postgres`)
    - **Email backend config** (console by default, SMTP via env vars)

- **`backend/config/urls.py`**
  - Main URL router.
  - Includes API routes (accounts, tickets, analytics, auth endpoints).

- **`backend/config/asgi.py`**
  - ASGI application config.
  - Routes HTTP + WebSocket protocols.

- **`backend/core/jwt_ws_auth.py`**
  - Custom WebSocket auth middleware.
  - Reads JWT token from query params and injects authenticated user into the WS scope.

### Core app (`backend/core`)

- **`backend/core/urls.py`**
  - Core endpoints routing (analytics endpoints).

- **`backend/core/views.py`**
  - **Admin-only analytics** endpoints:
    - Summary counts
    - Volume over time
    - Avg resolution

### Accounts app (`backend/accounts`)

- **`backend/accounts/models.py`**
  - `UserProfile`: role (`customer/agent/admin`), availability and capacity.
  - `EmailOTP`: stores hashed OTP + expiry + used timestamp.
  - `EmailVerificationToken`: token returned after successful OTP verification.

- **`backend/accounts/serializers.py`**
  - Serializers for user/profile returned to frontend.
  - Includes `is_available` and `capacity` so UI can show availability.

- **`backend/accounts/permissions.py`**
  - `IsAdmin` permission class (restrict admin endpoints).

- **`backend/accounts/views.py`**
  - Auth-related endpoints:
    - `GoogleLoginView` (Google token based login)
    - `RegisterView` (customer signup; requires `verification_token` if email provided)
    - `RequestEmailOTPView` (send OTP)
    - `VerifyEmailOTPView` (verify OTP → returns `verification_token`)
    - `AdminCreateUserView` (admin creates agent/admin/customer)

- **`backend/accounts/me.py`**
  - `MeView`: returns current authenticated user.
  - `AvailabilityView`: agents/admins set and get `is_available` + `capacity`.
  - When an agent goes online, it triggers assignment for existing unassigned open tickets.

- **`backend/accounts/urls.py`**
  - Routes all accounts endpoints under `/api/...`.

- **`backend/accounts/migrations/*`**
  - DB schema changes for accounts models.

### Tickets app (`backend/tickets`)

- **`backend/tickets/models.py`**
  - `Ticket`: core ticket data model (status, priority, customer, assigned_agent, timestamps).
  - `TicketMessage`: conversation messages on a ticket, includes `is_internal`.

- **`backend/tickets/serializers.py`**
  - DRF serializers for Ticket and TicketMessage.

- **`backend/tickets/views.py`**
  - Main REST API:
    - CRUD for tickets
    - Create messages
    - Status changes
    - Manual assignment
    - AI draft generation endpoint (Gemini)
    - Postgres full-text search endpoint
  - Also enforces access rules:
    - Admin: all tickets
    - Agent: only assigned tickets
    - Customer: only own tickets

- **`backend/tickets/tasks.py`**
  - Celery tasks:
    - `assign_ticket(ticket_id)`
      - Auto-assign to best available agent.
      - Based on availability + capacity + current active load.
    - `send_ticket_email(...)`
      - Email notifications on ticket activity.

- **`backend/tickets/realtime.py`**
  - Broadcast helper for pushing events over WebSockets.

- **`backend/tickets/consumers.py`**
  - WebSocket consumer for `/ws/tickets/<id>/...`
  - Permission rules aligned with REST:
    - Admin: can connect any ticket
    - Agent: only assigned tickets
    - Customer: only their own tickets

---

## Frontend (`/frontend`)

- **`frontend/src/App.jsx`**
  - Single-page React app.
  - Implements:
    - Login + OTP-assisted signup
    - Ticket list/search and ticket detail
    - Live updates via WebSocket
    - Agent presence toggle
    - Admin user creation + analytics view
    - AI draft generation + send
  - Zendesk-like 3-pane layout:
    - Sidebar views
    - Ticket list panel
    - Ticket detail panel

- **`frontend/vite.config.*` / `frontend/package.json`**
  - Vite build/dev server configuration and dependencies.

---

## 2) Step-by-step implementation guide

This section describes how the system was implemented and how each feature fits together.

### Step 1: Project scaffolding

- Created a Django backend with DRF.
- Created a React (Vite) frontend.
- Added Docker Compose stack:
  - Postgres
  - Redis
  - Django backend
  - Celery worker
  - Frontend dev server

### Step 2: Authentication

- Implemented JWT auth using SimpleJWT:
  - `/api/auth/token/` (login)
  - `/api/auth/token/refresh/` (refresh)
- Implemented `/api/me/` for the frontend to learn the current user + role.

### Step 3: Roles and permissions

- Introduced `UserProfile.role` with roles:
  - `customer`
  - `agent`
  - `admin`
- Enforced authorization rules in tickets queries:
  - Admin sees all
  - Agent sees assigned only
  - Customer sees own

### Step 4: Ticket management & workflow

- Implemented Ticket CRUD and message posting.
- Implemented status transitions (Open → Assigned → In Progress → Waiting on Customer → Resolved → Closed).

### Step 5: Real-time updates (WebSockets)

- Added Channels and a Redis channel layer.
- Created a WebSocket consumer per-ticket.
- Broadcasted events on:
  - Message created
  - Status changed
  - Assignment

### Step 6: Automatic assignment

- Created an assignment task: `assign_ticket(ticket_id)`.
- Logic:
  - considers only agents with `is_available=True`
  - computes each agent’s `active_count` (tickets in OPEN/ASSIGNED/IN_PROGRESS/WAITING_ON_CUSTOMER)
  - selects the agent with least load and under capacity
- Triggered assignment:
  - when tickets are created
  - when an agent switches from offline → online (to pick up existing unassigned tickets)

### Step 7: Email notifications

- Added Celery task `send_ticket_email`.
- Trigger points:
  - message created
  - status changed
  - assignment
- Default email backend prints to logs; SMTP settings switch to real email delivery.

### Step 8: AI draft generation (Gemini)

- Implemented endpoint: `/api/tickets/<id>/ai-draft/` (agent/admin).
- Calls Gemini API using `GEMINI_API_KEY`.
- Frontend panel allows:
  - generate draft
  - edit
  - send as message

### Step 9: Search

- Implemented Postgres full-text search:
  - Ticket fields + aggregated messages
  - Filters by status/priority/assignee
  - Access-safe results (respect user role)

### Step 10: Analytics

- Implemented admin-only endpoints for:
  - status distribution
  - ticket volume
  - avg resolution

### Step 11: UI evolution (Zendesk-style)

- Built the UI to support:
  - login/signup
  - ticket list + detail
  - conversation view
  - agent tools
  - admin tools
- Refactored into a 3-pane layout to match Zendesk-style workflow.

---

## 3) Key API endpoints (reference)

### Auth

- `POST /api/auth/token/`
- `POST /api/auth/token/refresh/`
- `GET /api/me/`

### Email OTP

- `POST /api/auth/request-otp/`
- `POST /api/auth/verify-otp/`
- `POST /api/auth/register/`

### Tickets

- `GET /api/tickets/`
- `POST /api/tickets/`
- `GET /api/tickets/<id>/`
- `POST /api/tickets/<id>/messages/`
- `POST /api/tickets/<id>/set-status/`
- `POST /api/tickets/<id>/assign/`
- `POST /api/tickets/<id>/ai-draft/`
- `GET /api/tickets/search/?q=...`

### Analytics (admin-only)

- `GET /api/analytics/summary/`
- `GET /api/analytics/volume/?days=30`
- `GET /api/analytics/resolution/`

---

## 4) Notes and operational tips

- For Gmail SMTP:
  - use a Gmail **App Password** (requires 2FA)
  - set SMTP env vars in `backend/.env`
  - restart `backend` and `celery`

- For OTP verification:
  - OTP is emailed (same SMTP system)
  - OTP is hashed in DB
  - verification token expires after 30 minutes

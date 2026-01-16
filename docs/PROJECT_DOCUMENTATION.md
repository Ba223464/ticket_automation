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

### Common payloads (examples)

Note: exact fields can vary by environment; this shows the typical shape used by the frontend.

#### Create ticket

- `POST /api/tickets/`

Example body:

```json
{
  "subject": "Printer not working",
  "description": "It shows error code 123.",
  "priority": "MEDIUM"
}
```

#### Add message to ticket

- `POST /api/tickets/<id>/messages/`

Example body:

```json
{
  "body": "Can you share a photo of the error?",
  "is_internal": false
}
```

#### Status change

- `POST /api/tickets/<id>/set-status/`

Example body:

```json
{
  "status": "IN_PROGRESS"
}
```

#### Manual assignment

- `POST /api/tickets/<id>/assign/`

Example body:

```json
{
  "assigned_agent": 12
}
```

### Analytics (admin-only)

- `GET /api/analytics/summary/`
- `GET /api/analytics/volume/?days=30`
- `GET /api/analytics/resolution/`

---

## 4) Notes and operational tips

---

## 4) Runbook / deployment guide

This section is a practical runbook for running the project locally (dev) and the key environment variables.

### Running with Docker Compose (recommended)

From the repo root:

- Bring the stack up:
  - `docker compose up --build`

- Services typically include:
  - `postgres` (DB)
  - `redis` (broker/channel layer)
  - `backend` (Django ASGI via Daphne)
  - `celery` (Celery worker)
  - `frontend` (Vite dev server)

### Database migrations (Docker)

When schema changes:

- `docker compose exec backend python manage.py migrate`

### Creating an admin user (Docker)

- `docker compose exec backend python manage.py createsuperuser`

### Running without Docker (advanced)

If you want to run services locally:

- Backend (typical):
  - `pip install -r backend/requirements.txt`
  - `python backend/manage.py migrate`
  - Run an ASGI server (project uses Daphne in Docker).

- Frontend:
  - `npm install`
  - `npm run dev`

### Environment variables

Backend:

- `backend/.env` (and `backend/.env.example`)
- Key categories:
  - **Django settings** (secret key, debug, allowed hosts)
  - **Database** (Postgres connection)
  - **Redis** (Celery broker/channel layer)
  - **Email** (SMTP)
  - **AI** (`GEMINI_API_KEY`)

Frontend:

- `frontend/.env` (and `frontend/.env.example`)
- Key variables:
  - `VITE_API_BASE_URL`
  - `VITE_WS_BASE_URL`

### Operational notes

- Backend is served via **Daphne (ASGI)** in Docker; changes often require a container restart if hot reload isn’t enabled.
- Email sending is performed by **Celery**; if emails aren’t arriving, verify:
  - `celery` container is running
  - SMTP env vars are correct
  - Gmail App Password is used (if Gmail)

---

## 5) Data model & workflows

### Core entities

- **User** (Django auth user)
  - Extended by **UserProfile**
  - Roles: `customer`, `agent`, `admin`
  - Agent operational fields: `is_available`, `capacity`

- **Ticket**
  - Owned by a `customer`
  - Optionally assigned to an `assigned_agent`
  - Has `status`, `priority`, timestamps

- **TicketMessage**
  - Belongs to a `ticket`
  - Authored by a user
  - `is_internal` distinguishes:
    - `false`: customer-visible replies
    - `true`: internal agent/admin notes (not emailed to customer)

- **Attachment**
  - File attachment(s) associated with a ticket message

### Ticket lifecycle (typical)

1. **Customer creates ticket**
2. Ticket is **auto-assigned** (if available agents exist) or stays unassigned
3. **Agent replies** (public) or adds **internal note**
4. Agent updates status:
   - `OPEN` → `ASSIGNED` → `IN_PROGRESS` → `WAITING_ON_CUSTOMER` → `RESOLVED` (and possibly `CLOSED` depending on workflow)
5. Emails and WebSocket events notify participants

### Auto-assignment workflow

- Implemented as a Celery task (`assign_ticket(ticket_id)`)
- Uses agent availability + capacity + current active load (open/in progress/waiting)
- Triggered on:
  - ticket creation
  - agent toggling to online (to pick up older unassigned tickets)

### Email notification workflow

- Implemented in `send_ticket_email(...)`
- Triggered on:
  - message created
  - status changed
  - assignment
- Recipient logic:
  - Internal message: agent only
  - Public message: customer + agent

### Real-time workflow (WebSockets)

- Ticket detail screen subscribes to ticket events
- Typical pushed events:
  - message created
  - status changed
  - assignment updated

---

- For Gmail SMTP:
  - use a Gmail **App Password** (requires 2FA)
  - set SMTP env vars in `backend/.env`
  - restart `backend` and `celery`

- For OTP verification:
  - OTP is emailed (same SMTP system)
  - OTP is hashed in DB
  - verification token expires after 30 minutes

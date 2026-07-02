# ITR Operations Management System — PRD

## Original Problem Statement
Build a cloud-based, real-time Income Tax Return Operations Management System (Version 1) for managing ~1000 ITRs annually for a CA/tax firm. The system focuses on return tracking, workflow management, query management, SLA monitoring, escalation management, team monitoring, MIS reporting, and audit trail. Excludes billing, document management, email/WhatsApp management, physical file tracking.

## User Personas
- **Admin (managing partner / ops lead)** — full control over masters, returns, SLAs, escalations, audit, dashboards.
- **User (return preparer / executive)** — sees assigned returns, manages queries, updates query status & remarks, views restricted dashboard.

## Core Requirements (Static)
1. Client Master (file no., group, client name, category)
2. Workflow Stage Master — central control: stage name, sequence, next action, dashboard colour, SLA days, escalation days, escalation emails, active flag. Initial 15 stages.
3. User Directory (name, email, active flag, role).
4. Return Master — primary operational module with auto-derived next action, ageing & last updated.
5. Query Management (multiple per return; editable statuses: Open / Awaiting Client / Follow-up Required / Closed).
6. Audit Trail (date, user, module, action, old/new values).
7. Live Dashboard: 7 KPI cards, dynamic workflow funnel, ageing heat map (0-3/4-7/8-15/15+), SLA monitoring, query dashboard, team workload.
8. Escalation engine driven by Workflow Stage Master.
9. Role-based access (Admin vs User), JWT auth.
10. Export Excel/CSV/PDF; import CSV/Excel.

## Implemented (Iteration 1 — Feb 2026)
### Backend (FastAPI + MongoDB + JWT + APScheduler)
- Modular routers under `/api`: `routes_auth`, `routes_masters` (users/clients/stages/options), `routes_returns` (returns/queries + import/export), `routes_dashboard` (kpis/funnel/ageing/sla/queries/team/audit/escalations).
- Bcrypt-hashed passwords; admin + 3 demo users seeded.
- 15 workflow stages, 10 demo clients, ~15 sample returns seeded.
- Auto-next-action derived from current stage; stage_entered_at tracked for ageing.
- Audit trail with old/new values for all writes (stage changes, reassign, query lifecycle, master CRUD).
- Escalation scheduler (APScheduler) runs every 30 min + at startup; writes to `escalation_log` collection.
- Excel/CSV/PDF exports (openpyxl + reportlab); CSV/XLSX bulk imports.
- 409 Conflict handling for duplicate return inward no. and email.

### Frontend (React + Shadcn UI + Tailwind)
- JWT login (Bearer header + httpOnly cookie support) — auto-refresh dashboard every 30s.
- Sidebar console layout, admin section gated by role.
- Pages: Login, Dashboard, Return Master (filter/search/import/export/new), Return Detail (workflow timeline, queries CRUD, activity log), Queries (with filters + export), Client Master, Workflow Stages (reorder, colour picker, toggle), User Directory, Dropdown Options (return_type + query_status), Audit Trail, Escalations.

### Tech & Integrations
- JWT + bcrypt custom auth (no external integration).
- Email escalation **mocked**: writes records to `escalation_log` with `email_status="pending"`. To activate real emails, add `RESEND_API_KEY` to `backend/.env` (not yet implemented in code).

## Test Credentials (also at /app/memory/test_credentials.md)
- Admin: `admin@taxops.com` / `Admin@123`
- Users (role=user, pwd `User@123`): `priya.sharma@taxops.com`, `rahul.mehta@taxops.com`, `anita.desai@taxops.com`

## Testing Status
- Backend pytest: 28/28 pass (auth, masters, returns, queries, dashboard, escalations, exports, imports, role enforcement, reorder, dup key handling).
- Frontend manual + automated: login, dashboard funnel/heat/sla, returns CRUD, return detail (stage change, reassign, query lifecycle, activity log), masters CRUD, audit trail, escalations, role-based hiding all verified.

## Backlog (Prioritized)
### P0
- Wire real email dispatch via Resend (or SendGrid) once API key provided.
### P1
- File-level activity timestamp on Return Detail by date grouping.
- Saved filters / bookmarked views on Return Master.
- Bulk reassign and bulk stage move from list view.
- "My Queue" filter for non-admin users.
### P2
- Daily MongoDB backup automation (cron + S3).
- Webhook notifications (Slack/Teams) on SLA breach.
- Two-factor authentication for Admin role.
- Stage SLA trend report (last 30/60 days).
- Custom report builder over Return + Query data.

## Next Action Items
1. Provide Resend / SendGrid API key to enable real escalation emails.
2. Validate end-to-end flow with a small batch of real client data before scaling to 1000 ITRs.
3. Configure escalation email recipients per stage in Workflow Stage Master.

# QRS Booking API

Backend API for restaurant booking without UI.  
Two Flask services are provided:

- `user_app.py` (port `8000`) for client flow.
- `admin_app.py` (port `8001`) for admin flow.

## Run

```bash
docker compose up --build
```

Services:

- User API: `http://localhost:8000`
- Admin API: `http://localhost:8001`
- DB Adminer: `http://localhost:8088`

## Booking Rules Implemented

- Client enters `date + guests`, API returns available time slots.
- Automatic table assignment uses:
  - single table or combined tables (up to `MAX_COMBINED_TABLES`, default `3`);
  - minimal overflow over requested guests;
  - max overflow controlled by `MAX_EXTRA_SEATS` (default `2`).
- Admin can create reservation with custom tables.
- Admin can force creation/edit even with capacity/conflict problems (`force=true`).
- Admin can block table for time range.
- Reservation edit requires explicit confirmation flag (`confirm_call_notice=true`) to mirror modal flow.
- Client cancellation endpoint is intentionally absent (cancel only by phone / admin action).
- Confirmation supported via `confirmation_code`.
- Analytics with filters and JSON/CSV export.
- List of successful (confirmed) reservations with filters.

## User API (`:8000`)

### `GET /health`

### `GET /api/v1/availability?date=YYYY-MM-DD&guests=2`
Returns slot list with availability and suggested tables.

### `POST /api/v1/reservations`
Create reservation with automatic table assignment.

Request JSON:
```json
{
  "customer_name": "Ivan",
  "reservation_time": "2026-03-27T18:30:00",
  "guests": 4,
  "email": "ivan@example.com",
  "phone": "+375..."
}
```

### `GET /api/v1/reservations/{id}`
Get reservation details.

### `POST /api/v1/reservations/{id}/confirm`
Confirm reservation by code.

Request JSON:
```json
{
  "confirmation_code": "AB12CD34"
}
```

## Admin API (`:8001`)

### `GET /health`

### Tables
- `GET /api/v1/tables`
- `POST /api/v1/tables`

### Table blocks
- `POST /api/v1/table-blocks`
- `DELETE /api/v1/table-blocks/{id}`

### Reservations
- `GET /api/v1/reservations?status=&from=&to=&q=`
- `POST /api/v1/reservations` (optional `table_ids`, optional `force=true`)
- `PATCH /api/v1/reservations/{id}` (requires `confirm_call_notice=true`, optional `force=true`)
- `POST /api/v1/reservations/{id}/cancel`
- `GET /api/v1/reservations/successful?from=&to=&q=`

### Analytics
- `GET /api/v1/analytics/reservations?from=&to=&status=&q=&format=json|csv`

## Environment Variables

- `SLOT_MINUTES` (default `60`)
- `AVAILABILITY_STEP_MINUTES` (default `30`)
- `OPEN_HOUR` (default `10`)
- `CLOSE_HOUR` (default `22`)
- `MAX_COMBINED_TABLES` (default `3`)
- `MAX_EXTRA_SEATS` (default `2`)
- `SMTP_HOST`
- `SMTP_PORT` (default `587`)
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME` (default `QRS Booking`)
- `SMTP_USE_TLS` (default `true`)
- `SMTP_USE_SSL` (default `false`)

## Email Notifications

If SMTP is configured, the backend sends emails to the guest address when:

- a reservation becomes confirmed
- a reservation is edited by admin
- a reservation is cancelled
import logging
from datetime import datetime, timezone

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS

from booking_service import (
    MAX_PARTY_SIZE,
    build_customer_name,
    combine_date_time,
    create_reservation,
    get_reservation,
    get_slots_for_day,
    confirm_reservation,
    split_customer_name,
)

logger = logging.getLogger(__name__)
from phone_utils import normalize_phone
from phone_verification_service import (
    booking_phone_verified,
    phone_already_confirmed,
    send_phone_verification_code,
    verify_phone_code,
)
from reservation_sms_service import send_reservation_sms
from visitor_service import upsert_visitor
from request_context import get_restaurant_id, set_restaurant_id
from restaurants import (
    get_restaurant_by_slug,
    get_restaurant_id_by_slug,
    list_restaurants_public,
    resolved_menu_file_path,
)
from email_service import send_reservation_email
from telegram_service import notify_pending_reservation

app = Flask(__name__)
CORS(app)


@app.before_request
def _user_set_restaurant():
    if request.method == "OPTIONS":
        return None
    path = request.path
    if not path.startswith("/api/"):
        return None
    if path in ("/api/v1/restaurants",):
        return None
    if path.startswith("/api/v1/menus/"):
        return None
    if path == "/api/v1/iiko/webhook":
        return None
    if path == "/health":
        return None
    slug = None
    if request.method == "GET" and path == "/api/v1/availability":
        slug = request.args.get("restaurant")
    elif request.method == "POST" and path in (
        "/api/v1/reservations",
        "/api/v1/phone/send-code",
        "/api/v1/phone/verify",
        "/api/v1/phone/status",
    ):
        body = request.get_json(silent=True) or {}
        slug = body.get("restaurant")
    elif request.method == "GET" and path.startswith("/api/v1/reservations/"):
        slug = request.args.get("restaurant")
    elif request.method == "POST" and path.endswith("/confirm"):
        body = request.get_json(silent=True) or {}
        slug = body.get("restaurant") or request.args.get("restaurant")
    if not slug:
        return (
            jsonify(
                {
                    "error": "Parameter restaurant (slug) is required — use ?restaurant=... or JSON field restaurant",
                }
            ),
            400,
        )
    rid = get_restaurant_id_by_slug(slug)
    if not rid:
        return jsonify({"error": "Unknown restaurant"}), 404
    set_restaurant_id(rid)
    return None


@app.get("/api/v1/restaurants")
def public_restaurants():
    return jsonify(list_restaurants_public())


@app.get("/api/v1/menus/<slug>")
def serve_public_menu_pdf(slug):
    row = get_restaurant_by_slug(slug)
    if not row or not row.get("menu_pdf_storage_name"):
        return jsonify({"error": "Menu not found"}), 404
    path = resolved_menu_file_path(row["menu_pdf_storage_name"])
    if not path:
        return jsonify({"error": "Menu not found"}), 404
    return send_file(
        path,
        mimetype="application/pdf",
        as_attachment=False,
        download_name="menu.pdf",
    )


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/api/v1/availability")
def availability():
    date_value = request.args.get("date")
    guests = request.args.get("guests", type=int)
    if not date_value or not guests or guests <= 0 or guests > MAX_PARTY_SIZE:
        return jsonify(
            {"error": f"date (YYYY-MM-DD) and guests (1–{MAX_PARTY_SIZE}) are required"}
        ), 400

    result = get_slots_for_day(date_value, guests)
    return jsonify(
        {
            "date": date_value,
            "guests": guests,
            "schedule": result["schedule"],
            "slots": result["slots"],
        }
    )


@app.post("/api/v1/phone/status")
def phone_status():
    body = request.get_json(silent=True) or {}
    phone = body.get("phone")
    if not phone:
        return jsonify({"error": "phone is required"}), 400
    try:
        status = phone_already_confirmed(get_restaurant_id(), phone)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not normalize_phone(phone):
        return jsonify({"error": "Некорректный номер телефона"}), 400
    return jsonify(status)


@app.post("/api/v1/phone/send-code")
def phone_send_code():
    body = request.get_json(silent=True) or {}
    phone = body.get("phone")
    if not phone:
        return jsonify({"error": "phone is required"}), 400
    try:
        result = send_phone_verification_code(get_restaurant_id(), phone)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 502
    return jsonify(result)


@app.post("/api/v1/phone/verify")
def phone_verify_code():
    body = request.get_json(silent=True) or {}
    phone = body.get("phone")
    code = body.get("code")
    if not phone or not code:
        return jsonify({"error": "phone and code are required"}), 400
    try:
        result = verify_phone_code(get_restaurant_id(), phone, code)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result)


@app.post("/api/v1/reservations")
def create_booking():
    body = request.get_json(silent=True) or {}
    reservation_time = body.get("reservation_time")
    if not reservation_time and body.get("date") and body.get("time"):
        reservation_time = combine_date_time(body["date"], body["time"])

    phone = (body.get("phone") or "").strip()
    verification_token = (body.get("phoneVerificationToken") or "").strip()

    missing = []
    if not reservation_time:
        missing.append("reservation_time or date+time")
    if "guests" not in body:
        missing.append("guests")
    if not phone:
        missing.append("phone")
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    if not normalize_phone(phone):
        return jsonify({"error": "Некорректный номер телефона"}), 400
    if not booking_phone_verified(
        get_restaurant_id(),
        phone,
        verification_token or None,
    ):
        return jsonify({"error": "Подтвердите телефон кодом из SMS"}), 400

    if not body.get("offerAccepted"):
        return (
            jsonify(
                {
                    "error": "Необходимо принять условия публичной оферты и дать согласие на обработку персональных данных.",
                }
            ),
            400,
        )

    marketing_consent = bool(body.get("marketingConsent"))
    offer_document = (body.get("offerDocument") or "oferta_mise_v3.pdf").strip()

    phone_status = phone_already_confirmed(get_restaurant_id(), phone)
    names_locked = bool(phone_status.get("namesLocked"))
    if names_locked:
        customer_name = build_customer_name(
            first_name=phone_status.get("firstName"),
            last_name=phone_status.get("lastName"),
        )
    else:
        customer_name = build_customer_name(
            first_name=body.get("firstName"),
            last_name=body.get("lastName"),
            customer_name=body.get("customer_name"),
        )
    if not customer_name:
        return jsonify({"error": "firstName and lastName are required for this phone"}), 400

    try:
        reservation = create_reservation(
            customer_name=customer_name,
            guests=int(body["guests"]),
            reservation_time=reservation_time,
            email=None,
            phone=phone,
            sets=int(body.get("sets", 1)),
            note=body.get("note"),
            offer_accepted_at=datetime.now(timezone.utc),
            offer_document=offer_document or "oferta_mise_v3.pdf",
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    first_name, last_name = split_customer_name(customer_name)
    upsert_visitor(
        get_restaurant_id(),
        phone,
        first_name=first_name,
        last_name=last_name,
        marketing_consent=marketing_consent,
    )

    full_reservation = get_reservation(reservation["id"])
    if full_reservation and full_reservation["status"] == "pending":
        notify_pending_reservation(full_reservation)

    return (
        jsonify(
            {
                "message": "Reservation created. Save reservation details or make a screenshot.",
                "reservation": full_reservation,
                "note": "Customer cancellation is available only by calling the restaurant.",
            }
        ),
        201,
    )


@app.get("/api/v1/reservations/<int:reservation_id>")
def reservation_details(reservation_id):
    reservation = get_reservation(reservation_id, restaurant_id=get_restaurant_id())
    if not reservation:
        return jsonify({"error": "Reservation not found"}), 404
    return jsonify(reservation)


@app.post("/api/v1/reservations/<int:reservation_id>/confirm")
def confirm_booking(reservation_id):
    body = request.get_json(silent=True) or {}
    code = body.get("confirmation_code")
    if not code:
        return jsonify({"error": "confirmation_code is required"}), 400

    if not confirm_reservation(reservation_id, code):
        return jsonify({"error": "Invalid confirmation code or reservation unavailable"}), 400
    reservation = get_reservation(reservation_id, restaurant_id=get_restaurant_id())
    if reservation:
        send_reservation_email("confirmed", reservation)
        send_reservation_sms("confirmed", reservation)
    return jsonify({"message": "Reservation confirmed", "reservation": reservation})


# ── iiko webhook receiver ────────────────────────────────────────────────


@app.post("/api/v1/iiko/webhook")
def iiko_webhook():
    """Receive webhook events from iiko Cloud API.

    iiko sends a flat list of event objects. Each has an eventType field.
    We handle reserve-related events to keep local status in sync.
    """
    from db import execute, query_one

    body = request.get_json(silent=True) or {}
    logger.info("iiko webhook received: %s", {k: v for k, v in body.items() if k != "eventInfo"})

    for event_info in body.get("eventInfo", []):
        event_type = event_info.get("eventType") or body.get("eventType", "")
        iiko_reserve_id = event_info.get("id") or event_info.get("reserveId")
        if not iiko_reserve_id:
            continue

        row = query_one(
            "SELECT id, status FROM reservations WHERE iiko_reserve_id = %s::uuid",
            (iiko_reserve_id,),
        )
        if not row:
            logger.info("iiko webhook: unknown reserve %s (may be synced later)", iiko_reserve_id)
            continue

        status = event_info.get("status")

        # Reserve cancelled at POS
        if status in ("Cancelled", "Deleted") and row["status"] == "confirmed":
            execute(
                """
                UPDATE reservations
                SET status = 'cancelled',
                    cancelled_at = NOW(),
                    iiko_creation_status = %s,
                    admin_note = COALESCE(admin_note, '') || ' [cancelled in iiko]',
                    updated_at = NOW()
                WHERE id = %s
                """,
                (status, row["id"]),
            )
            logger.info("iiko webhook: reservation %s cancelled (iiko status: %s)", row["id"], status)

        # Reserve creation status update (InProgress -> Success/Error)
        elif status and status != row.get("status"):
            execute(
                "UPDATE reservations SET iiko_creation_status = %s, updated_at = NOW() WHERE id = %s",
                (status, row["id"]),
            )
            logger.info("iiko webhook: reservation %s iiko_status -> %s", row["id"], status)

    return jsonify({"ok": True})

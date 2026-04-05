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
)
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
    if path == "/health":
        return None
    slug = None
    if request.method == "GET" and path == "/api/v1/availability":
        slug = request.args.get("restaurant")
    elif request.method == "POST" and path == "/api/v1/reservations":
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


@app.post("/api/v1/reservations")
def create_booking():
    body = request.get_json(silent=True) or {}
    customer_name = build_customer_name(
        first_name=body.get("firstName"),
        last_name=body.get("lastName"),
        customer_name=body.get("customer_name"),
    )
    reservation_time = body.get("reservation_time")
    if not reservation_time and body.get("date") and body.get("time"):
        reservation_time = combine_date_time(body["date"], body["time"])

    missing = []
    if not customer_name:
        missing.append("firstName/lastName or customer_name")
    if not reservation_time:
        missing.append("reservation_time or date+time")
    if "guests" not in body:
        missing.append("guests")
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    try:
        reservation = create_reservation(
            customer_name=customer_name,
            guests=int(body["guests"]),
            reservation_time=reservation_time,
            email=body.get("email"),
            phone=body.get("phone"),
            sets=int(body.get("sets", 1)),
            note=body.get("note"),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    full_reservation = get_reservation(reservation["id"])
    if full_reservation:
        send_reservation_email("created", full_reservation)
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
    return jsonify({"message": "Reservation confirmed", "reservation": reservation})

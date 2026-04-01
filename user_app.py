from flask import Flask, jsonify, request
from flask_cors import CORS

from booking_service import (
    build_customer_name,
    combine_date_time,
    create_reservation,
    get_reservation,
    get_slots_for_day,
    confirm_reservation,
)
from email_service import send_reservation_email
from telegram_service import notify_pending_reservation

app = Flask(__name__)
CORS(app)


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/api/v1/availability")
def availability():
    date_value = request.args.get("date")
    guests = request.args.get("guests", type=int)
    if not date_value or not guests or guests <= 0:
        return jsonify({"error": "date (YYYY-MM-DD) and guests (>0) are required"}), 400

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
    reservation = get_reservation(reservation_id)
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
    reservation = get_reservation(reservation_id)
    if reservation:
        send_reservation_email("confirmed", reservation)
    return jsonify({"message": "Reservation confirmed", "reservation": reservation})

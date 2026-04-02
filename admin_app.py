from flask import Flask, Response, jsonify, request
from flask_cors import CORS

from booking_service import (
    admin_confirm_reservation,
    analytics_to_csv,
    clients_database_to_xlsx,
    delete_cancelled_reservation,
    build_customer_name,
    cancel_reservation,
    combine_date_time,
    create_reservation,
    get_reservation,
    list_active_tables,
    list_reservations,
    list_table_blocks,
    parse_iso_dt,
    reservations_analytics,
    restore_cancelled_reservation,
    serialize_table,
    serialize_table_block,
    list_weekly_schedule,
    update_reservation,
    update_schedule_day,
    validate_table_selection,
)
from db import execute, execute_returning, query_all
from email_service import send_reservation_email
from telegram_service import (
    add_telegram_recipient,
    delete_reservation_notifications,
    delete_telegram_recipient,
    list_telegram_recipients,
    notify_pending_reservation,
)

app = Flask(__name__)
CORS(app)


def sync_unite_pair(table_id, can_unite, unite_with_table_id):
    if not can_unite or not unite_with_table_id:
        execute(
            """
            UPDATE tables
            SET unite_with_table_id = NULL
            WHERE unite_with_table_id = %s
            """,
            (table_id,),
        )
        return None

    partner_id = int(unite_with_table_id)
    if partner_id == table_id:
        raise ValueError("Table cannot be united with itself")

    partner = query_all("SELECT id FROM tables WHERE id = %s", (partner_id,))
    if not partner:
        raise ValueError("Partner table not found")

    # Clear previous one-to-one links that conflict with the new pair.
    execute(
        """
        UPDATE tables
        SET unite_with_table_id = NULL
        WHERE id IN (%s, %s)
           OR unite_with_table_id IN (%s, %s)
        """,
        (table_id, partner_id, table_id, partner_id),
    )

    execute(
        """
        UPDATE tables
        SET can_unite = TRUE,
            unite_with_table_id = CASE
                WHEN id = %s THEN %s
                WHEN id = %s THEN %s
            END
        WHERE id IN (%s, %s)
        """,
        (table_id, partner_id, partner_id, table_id, table_id, partner_id),
    )
    return partner_id


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/api/v1/tables")
def list_tables():
    date_value = request.args.get("date")
    block_rows = list_table_blocks(date_value=date_value)
    blocks_by_table = {}
    for row in block_rows:
        blocks_by_table.setdefault(row["table_id"], []).append(row)
    rows = query_all("SELECT * FROM tables ORDER BY LOWER(name), id")
    return jsonify([serialize_table(row, blocks_by_table.get(row["id"], [])) for row in rows])


@app.get("/api/v1/settings/schedule")
def get_schedule():
    return jsonify(list_weekly_schedule())


@app.patch("/api/v1/settings/schedule/<int:weekday>")
def patch_schedule_day(weekday):
    body = request.get_json(silent=True) or {}
    try:
        row = update_schedule_day(
            weekday=weekday,
            is_open=bool(body.get("is_open", True)),
            open_time_value=body.get("open_time"),
            close_time_value=body.get("close_time"),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(row)


@app.get("/api/v1/settings/telegram-recipients")
def get_telegram_recipients():
    return jsonify(list_telegram_recipients())


@app.post("/api/v1/settings/telegram-recipients")
def create_telegram_recipient():
    body = request.get_json(silent=True) or {}
    try:
        recipient = add_telegram_recipient(
            chat_id=body.get("chat_id"),
            label=body.get("label"),
            is_active=body.get("is_active", True),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(recipient), 201


@app.delete("/api/v1/settings/telegram-recipients/<int:recipient_id>")
def remove_telegram_recipient(recipient_id):
    row = delete_telegram_recipient(recipient_id)
    if not row:
        return jsonify({"error": "Recipient not found"}), 404
    return jsonify({"message": "Recipient deleted"})


@app.post("/api/v1/tables")
def create_table():
    body = request.get_json(silent=True) or {}
    if "capacity" not in body:
        return jsonify({"error": "capacity is required"}), 400
    can_unite = bool(body.get("can_unite", False))
    unite_with_table_id = body.get("unite_with_table_id")
    try:
        row = execute_returning(
        """
        INSERT INTO tables (name, capacity, is_active, can_unite, unite_with_table_id)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            body.get("name", ""),
            int(body["capacity"]),
            bool(body.get("is_active", True)),
            can_unite,
            None,
        ),
    )
        partner_id = sync_unite_pair(row["id"], can_unite, unite_with_table_id)
        if partner_id:
            row = query_all("SELECT * FROM tables WHERE id = %s", (row["id"],))[0]
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(serialize_table(row)), 201


@app.patch("/api/v1/tables/<int:table_id>")
def update_table(table_id):
    body = request.get_json(silent=True) or {}
    current = query_all("SELECT * FROM tables WHERE id = %s", (table_id,))
    if not current:
        return jsonify({"error": "Table not found"}), 404
    can_unite = bool(body.get("can_unite", current[0]["can_unite"]))
    unite_with_table_id = body.get("unite_with_table_id")
    try:
        row = execute_returning(
        """
        UPDATE tables
        SET name = %s,
            capacity = %s,
            is_active = %s,
            can_unite = %s,
            unite_with_table_id = %s
        WHERE id = %s
        RETURNING *
        """,
        (
            body.get("name", current[0]["name"]),
            int(body.get("capacity", current[0]["capacity"])),
            bool(body.get("is_active", current[0]["is_active"])),
            can_unite,
            None,
            table_id,
        ),
    )
        sync_unite_pair(table_id, can_unite, unite_with_table_id)
        row = query_all("SELECT * FROM tables WHERE id = %s", (table_id,))[0]
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(serialize_table(row))


@app.delete("/api/v1/tables/<int:table_id>")
def delete_table(table_id):
    table = query_all("SELECT * FROM tables WHERE id = %s", (table_id,))
    if not table:
        return jsonify({"error": "Table not found"}), 404

    linked_reservations = query_all(
        "SELECT reservation_id FROM reservation_tables WHERE table_id = %s LIMIT 1",
        (table_id,),
    )
    if linked_reservations:
        return jsonify({"error": "Cannot delete table that is used in reservations"}), 400

    execute("UPDATE tables SET unite_with_table_id = NULL WHERE unite_with_table_id = %s", (table_id,))
    execute("DELETE FROM table_blocks WHERE table_id = %s", (table_id,))
    execute("DELETE FROM tables WHERE id = %s", (table_id,))
    return jsonify({"message": "Table deleted"})


@app.post("/api/v1/table-blocks")
def create_table_block():
    body = request.get_json(silent=True) or {}
    required = ["table_id", "start_time", "end_time"]
    missing = [k for k in required if k not in body]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400
    row = execute_returning(
        """
        INSERT INTO table_blocks (table_id, start_time, end_time, reason)
        VALUES (%s, %s, %s, %s)
        RETURNING *
        """,
        (
            int(body["table_id"]),
            parse_iso_dt(body["start_time"]),
            parse_iso_dt(body["end_time"]),
            body.get("reason", ""),
        ),
    )
    return jsonify(serialize_table_block(row)), 201


@app.get("/api/v1/table-blocks")
def get_table_blocks():
    return jsonify([serialize_table_block(row) for row in list_table_blocks(request.args.get("date"))])


@app.get("/api/v1/reservations")
def reservations():
    rows = list_reservations(
        {
            "status": request.args.get("status"),
            "from": request.args.get("from"),
            "to": request.args.get("to"),
            "date": request.args.get("date"),
            "q": request.args.get("q"),
        }
    )
    return jsonify(rows)


@app.post("/api/v1/reservations")
def create_admin_reservation():
    body = request.get_json(silent=True) or {}
    customer_name = build_customer_name(
        first_name=body.get("firstName"),
        last_name=body.get("lastName"),
        customer_name=body.get("customer_name"),
    )
    reservation_time = body.get("reservation_time")
    if not reservation_time and body.get("date") and body.get("time"):
        reservation_time = combine_date_time(body["date"], body["time"])
    table_ids = body.get("table_ids") or ([body["tableId"]] if body.get("tableId") else None)

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
            table_ids=table_ids,
            created_by_admin=True,
            admin_note=body.get("admin_note"),
            force=bool(body.get("force", False)),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify(get_reservation(reservation["id"])), 201


@app.patch("/api/v1/reservations/<int:reservation_id>")
def edit_reservation(reservation_id):
    body = request.get_json(silent=True) or {}
    if not bool(body.get("confirm_call_notice", False)):
        return (
            jsonify(
                {
                    "error": "Set confirm_call_notice=true before saving changes",
                    "notice": "If you are sure about these changes, call +375... and notify restaurant staff.",
                }
            ),
            400,
        )

    try:
        updated = update_reservation(
            reservation_id,
            body,
            force=bool(body.get("force", False)),
            allow_insufficient_capacity=True,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if not updated:
        return jsonify({"error": "Reservation not found"}), 404
    send_reservation_email("edited", updated)
    return jsonify(updated)


@app.post("/api/v1/reservations/<int:reservation_id>/confirm")
def confirm_pending_reservation(reservation_id):
    row = admin_confirm_reservation(reservation_id)
    if not row:
        return jsonify({"error": "Pending reservation not found"}), 404
    delete_reservation_notifications(reservation_id)
    reservation = get_reservation(reservation_id)
    if reservation:
        send_reservation_email("confirmed", reservation)
    return jsonify({"message": "Reservation confirmed", "reservation": reservation})


@app.post("/api/v1/reservations/check-table")
def check_table():
    body = request.get_json(silent=True) or {}
    reservation_time = body.get("reservation_time")
    if not reservation_time and body.get("date") and body.get("time"):
        reservation_time = combine_date_time(body["date"], body["time"])
    table_ids = body.get("table_ids") or ([body["tableId"]] if body.get("tableId") else None)
    if not reservation_time or not table_ids or "guests" not in body:
        return jsonify({"error": "reservation_time/date+time, tableId/table_ids and guests are required"}), 400
    try:
        issues = validate_table_selection(
            table_ids,
            int(body["guests"]),
            reservation_time,
            exclude_reservation_id=body.get("exclude_reservation_id"),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    conflict = issues["conflict"]
    return jsonify(
        {
            "ok": not (issues["capacity_issue"] or issues["conflict"] or issues["block"]),
            "capacity_issue": issues["capacity_issue"],
            "unite_issue": issues["unite_issue"],
            "conflict": {
                "id": str(conflict["id"]),
                "customer_name": conflict["customer_name"],
                "phone": conflict["phone"],
                "reservation_time": conflict["reservation_time"].isoformat(),
            }
            if conflict
            else None,
            "block": serialize_table_block(issues["block"]) if issues["block"] else None,
            "capacity": issues["capacity"],
        }
    )


@app.post("/api/v1/reservations/<int:reservation_id>/cancel")
def cancel(reservation_id):
    row = cancel_reservation(reservation_id, reason=(request.get_json(silent=True) or {}).get("reason"))
    if not row:
        return jsonify({"error": "Reservation not found"}), 404
    reservation = get_reservation(reservation_id)
    if reservation:
        send_reservation_email("cancelled", reservation)
    return jsonify({"message": "Reservation cancelled", "reservation": reservation})


@app.post("/api/v1/reservations/<int:reservation_id>/restore")
def restore(reservation_id):
    row = restore_cancelled_reservation(reservation_id)
    if not row:
        return jsonify({"error": "Cancelled reservation not found"}), 404
    reservation = get_reservation(reservation_id)
    if reservation and reservation["status"] == "pending":
        notify_pending_reservation(reservation)
    return jsonify({"message": "Reservation restored", "reservation": reservation})


@app.delete("/api/v1/reservations/<int:reservation_id>")
def delete_reservation(reservation_id):
    row = delete_cancelled_reservation(reservation_id)
    if not row:
        return jsonify({"error": "Only cancelled reservations can be deleted"}), 400
    return jsonify({"message": "Reservation deleted"})


@app.get("/api/v1/analytics/reservations")
def reservation_analytics():
    filters = {
        "status": request.args.get("status"),
        "from": request.args.get("from"),
        "to": request.args.get("to"),
        "q": request.args.get("q"),
    }
    fmt = request.args.get("format", "json").lower()
    data = reservations_analytics(filters)
    if fmt == "csv":
        csv_data = analytics_to_csv(data)
        return Response(
            csv_data,
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=reservations-analytics.csv"},
        )
    return jsonify(data)


@app.get("/api/v1/analytics/clients.xlsx")
def clients_database_export():
    workbook_data = clients_database_to_xlsx()
    return Response(
        workbook_data,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=clients-database.xlsx"},
    )


@app.get("/api/v1/reservations/successful")
def successful_reservations():
    rows = list_reservations(
        {
            "status": "confirmed",
            "from": request.args.get("from"),
            "to": request.args.get("to"),
            "q": request.args.get("q"),
        }
    )
    return jsonify(rows)


@app.delete("/api/v1/table-blocks/<int:block_id>")
def remove_table_block(block_id):
    execute("DELETE FROM table_blocks WHERE id = %s", (block_id,))
    return jsonify({"message": "Deleted"})

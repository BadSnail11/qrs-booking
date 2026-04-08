import os
import secrets

from flask import Flask, Response, g, jsonify, request
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
    create_sets_choice_interval,
    delete_schedule_date_override,
    delete_sets_choice_interval,
    get_reservation,
    list_active_tables,
    list_reservations,
    list_schedule_date_overrides,
    list_sets_choice_intervals_for_restaurant,
    list_table_blocks,
    parse_iso_dt,
    reservations_analytics,
    restore_cancelled_reservation,
    serialize_table,
    serialize_table_block,
    list_weekly_schedule,
    update_reservation,
    update_schedule_day,
    upsert_schedule_date_override,
    validate_table_selection,
)
from db import execute, execute_returning, query_all
from request_context import get_restaurant_id, set_restaurant_id
from restaurants import (
    create_restaurant,
    get_restaurant_by_id,
    get_menu_pdf_storage_name,
    guest_contact_public_dict,
    list_restaurants_all,
    menu_upload_dir,
    normalize_guest_contact_field,
    resolved_menu_file_path,
    set_menu_pdf_storage_name,
    set_public_guest_contact,
    update_restaurant,
    verify_restaurant_login,
)
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

# Menu PDF upload (and other large bodies) — must stay in sync with booking_Harats next.config
# experimental.proxyClientMaxBodySize when traffic goes through the Next admin proxy.
app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("MAX_MENU_UPLOAD_BYTES", str(50 * 1024 * 1024)))

SUPERADMIN_LOGIN = (os.getenv("SUPERADMIN_LOGIN") or "superadmin").strip().lower()
SUPERADMIN_PASSWORD = (os.getenv("SUPERADMIN_PASSWORD") or "").strip()


@app.before_request
def _require_tenant_headers():
    if request.method == "OPTIONS":
        return None
    path = request.path
    if not path.startswith("/api/"):
        return None
    if path == "/api/v1/auth/login":
        return None
    if path.startswith("/api/v1/super/"):
        flag = (request.headers.get("X-Superadmin") or "").lower()
        if flag not in ("1", "true", "yes"):
            return jsonify({"error": "Superadmin access required"}), 401
        g.superadmin = True
        set_restaurant_id(1)
        return None
    g.superadmin = False
    raw = request.headers.get("X-Restaurant-Id")
    if not raw or not str(raw).isdigit():
        return jsonify({"error": "Missing or invalid X-Restaurant-Id header"}), 401
    set_restaurant_id(int(raw))
    return None


@app.post("/api/v1/auth/login")
def auth_login():
    body = request.get_json(silent=True) or {}
    login = (body.get("login") or body.get("restaurant") or "").strip().lower()
    password = body.get("password") or ""
    if not login or not password:
        return jsonify({"error": "login and password are required"}), 400
    if SUPERADMIN_PASSWORD and login == SUPERADMIN_LOGIN:
        if password != SUPERADMIN_PASSWORD:
            return jsonify({"error": "Неверный логин или пароль"}), 401
        return jsonify(
            {
                "role": "superadmin",
                "restaurantId": None,
                "slug": None,
                "displayName": "Superadmin",
            }
        )
    row = verify_restaurant_login(login, password)
    if not row:
        return jsonify({"error": "Неверный логин или пароль"}), 401
    return jsonify(
        {
            "role": "restaurant",
            "restaurantId": row["id"],
            "slug": row["slug"],
            "displayName": row["display_name"],
        }
    )


@app.get("/api/v1/super/restaurants")
def super_list_restaurants():
    return jsonify(list_restaurants_all())


@app.post("/api/v1/super/restaurants")
def super_create_restaurant():
    body = request.get_json(silent=True) or {}
    try:
        created = create_restaurant(
            body.get("slug", ""),
            body.get("displayName") or body.get("display_name", ""),
            body.get("password", ""),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(created), 201


@app.patch("/api/v1/super/restaurants/<int:restaurant_id>")
def super_patch_restaurant(restaurant_id):
    body = request.get_json(silent=True) or {}
    slug_kw = None
    if "slug" in body:
        slug_kw = body.get("slug", "")
    display_kw = None
    if "displayName" in body:
        display_kw = body.get("displayName", "")
    elif "display_name" in body:
        display_kw = body.get("display_name", "")
    password_kw = None
    if body.get("password"):
        password_kw = body["password"]
    try:
        updated = update_restaurant(
            restaurant_id,
            slug=slug_kw,
            display_name=display_kw,
            password=password_kw,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not updated:
        return jsonify({"error": "Restaurant not found"}), 404
    return jsonify(updated)


def sync_unite_pair(table_id, can_unite, unite_with_table_id):
    rid = get_restaurant_id()
    if not can_unite or not unite_with_table_id:
        execute(
            """
            UPDATE tables
            SET unite_with_table_id = NULL
            WHERE unite_with_table_id = %s AND restaurant_id = %s
            """,
            (table_id, rid),
        )
        return None

    partner_id = int(unite_with_table_id)
    if partner_id == table_id:
        raise ValueError("Table cannot be united with itself")

    partner = query_all(
        "SELECT id FROM tables WHERE id = %s AND restaurant_id = %s",
        (partner_id, rid),
    )
    if not partner:
        raise ValueError("Partner table not found")

    # Clear previous one-to-one links that conflict with the new pair.
    execute(
        """
        UPDATE tables
        SET unite_with_table_id = NULL
        WHERE restaurant_id = %s
          AND (id IN (%s, %s) OR unite_with_table_id IN (%s, %s))
        """,
        (rid, table_id, partner_id, table_id, partner_id),
    )

    execute(
        """
        UPDATE tables
        SET can_unite = TRUE,
            unite_with_table_id = CASE
                WHEN id = %s THEN %s
                WHEN id = %s THEN %s
            END
        WHERE restaurant_id = %s AND id IN (%s, %s)
        """,
        (table_id, partner_id, partner_id, table_id, rid, table_id, partner_id),
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
    rows = query_all(
        "SELECT * FROM tables WHERE restaurant_id = %s ORDER BY LOWER(name), id",
        (get_restaurant_id(),),
    )
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


@app.get("/api/v1/settings/schedule-overrides")
def get_schedule_overrides():
    from_d = request.args.get("from")
    to_d = request.args.get("to")
    return jsonify(list_schedule_date_overrides(from_d, to_d))


@app.put("/api/v1/settings/schedule-overrides/<date_str>")
def put_schedule_override(date_str):
    body = request.get_json(silent=True) or {}
    try:
        row = upsert_schedule_date_override(
            date_str,
            bool(body.get("is_open", True)),
            body.get("open_time"),
            body.get("close_time"),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(row)


@app.delete("/api/v1/settings/schedule-overrides/<date_str>")
def remove_schedule_override(date_str):
    try:
        row = delete_schedule_date_override(date_str)
    except ValueError:
        return jsonify({"error": "Invalid date"}), 400
    if not row:
        return jsonify({"error": "Override not found"}), 404
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


@app.get("/api/v1/settings/menu")
def get_menu_settings():
    rid = get_restaurant_id()
    row = get_restaurant_by_id(rid)
    if not row:
        return jsonify({"error": "Restaurant not found"}), 404
    has = bool(row.get("menu_pdf_storage_name"))
    slug = row["slug"]
    return jsonify({"hasMenu": has, "menuUrl": f"/v1/menus/{slug}" if has else None})


@app.post("/api/v1/settings/menu")
def upload_menu_pdf():
    if "file" not in request.files:
        return jsonify({"error": "file field is required"}), 400
    f = request.files["file"]
    if not f or f.filename == "":
        return jsonify({"error": "empty file"}), 400
    if not f.filename.lower().endswith(".pdf"):
        return jsonify({"error": "only PDF files are allowed"}), 400

    rid = get_restaurant_id()
    row = get_restaurant_by_id(rid)
    if not row:
        return jsonify({"error": "Restaurant not found"}), 404

    upload_base = menu_upload_dir()
    os.makedirs(upload_base, exist_ok=True)

    old_storage = get_menu_pdf_storage_name(rid)
    new_name = f"{rid}_{secrets.token_hex(8)}.pdf"
    dest = os.path.join(upload_base, new_name)
    f.save(dest)

    if old_storage and old_storage != new_name:
        old_path = resolved_menu_file_path(old_storage)
        if old_path:
            try:
                os.remove(old_path)
            except OSError:
                pass

    set_menu_pdf_storage_name(rid, new_name)
    slug = row["slug"]
    return jsonify({"menuUrl": f"/v1/menus/{slug}", "hasMenu": True})


@app.delete("/api/v1/settings/menu")
def delete_menu_pdf():
    rid = get_restaurant_id()
    old_storage = get_menu_pdf_storage_name(rid)
    if old_storage:
        old_path = resolved_menu_file_path(old_storage)
        if old_path:
            try:
                os.remove(old_path)
            except OSError:
                pass
    set_menu_pdf_storage_name(rid, None)
    return jsonify({"hasMenu": False})


@app.get("/api/v1/settings/sets-choice-intervals")
def get_sets_choice_intervals():
    return jsonify(list_sets_choice_intervals_for_restaurant())


@app.post("/api/v1/settings/sets-choice-intervals")
def post_sets_choice_interval():
    body = request.get_json(silent=True) or {}
    try:
        row = create_sets_choice_interval(
            body.get("dateStart") or body.get("date_start", ""),
            body.get("dateEnd") or body.get("date_end", ""),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(row), 201


@app.delete("/api/v1/settings/sets-choice-intervals/<int:interval_id>")
def remove_sets_choice_interval(interval_id):
    if not delete_sets_choice_interval(interval_id):
        return jsonify({"error": "Interval not found"}), 404
    return jsonify({"message": "deleted"})


@app.get("/api/v1/settings/public-guest-contact")
def get_public_guest_contact():
    row = get_restaurant_by_id(get_restaurant_id())
    if not row:
        return jsonify({"error": "Restaurant not found"}), 404
    return jsonify(guest_contact_public_dict(row))


@app.patch("/api/v1/settings/public-guest-contact")
def patch_public_guest_contact():
    body = request.get_json(silent=True) or {}
    row = get_restaurant_by_id(get_restaurant_id())
    if not row:
        return jsonify({"error": "Restaurant not found"}), 404
    current = guest_contact_public_dict(row)
    address, phone, hours = current["address"], current["phone"], current["hours"]
    try:
        if "address" in body:
            address = normalize_guest_contact_field(body.get("address"))
        if "phone" in body:
            phone = normalize_guest_contact_field(body.get("phone"))
        if "hours" in body:
            hours = normalize_guest_contact_field(body.get("hours"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    set_public_guest_contact(get_restaurant_id(), address, phone, hours)
    row = get_restaurant_by_id(get_restaurant_id())
    return jsonify(guest_contact_public_dict(row))


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
            INSERT INTO tables (restaurant_id, name, capacity, is_active, can_unite, unite_with_table_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                get_restaurant_id(),
                body.get("name", ""),
                int(body["capacity"]),
                bool(body.get("is_active", True)),
                can_unite,
                None,
            ),
        )
        partner_id = sync_unite_pair(row["id"], can_unite, unite_with_table_id)
        if partner_id:
            row = query_all(
                "SELECT * FROM tables WHERE id = %s AND restaurant_id = %s",
                (row["id"], get_restaurant_id()),
            )[0]
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(serialize_table(row)), 201


@app.patch("/api/v1/tables/<int:table_id>")
def update_table(table_id):
    body = request.get_json(silent=True) or {}
    current = query_all(
        "SELECT * FROM tables WHERE id = %s AND restaurant_id = %s",
        (table_id, get_restaurant_id()),
    )
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
        WHERE id = %s AND restaurant_id = %s
        RETURNING *
        """,
        (
            body.get("name", current[0]["name"]),
            int(body.get("capacity", current[0]["capacity"])),
            bool(body.get("is_active", current[0]["is_active"])),
            can_unite,
            None,
            table_id,
            get_restaurant_id(),
        ),
    )
        sync_unite_pair(table_id, can_unite, unite_with_table_id)
        row = query_all(
            "SELECT * FROM tables WHERE id = %s AND restaurant_id = %s",
            (table_id, get_restaurant_id()),
        )[0]
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(serialize_table(row))


@app.delete("/api/v1/tables/<int:table_id>")
def delete_table(table_id):
    table = query_all(
        "SELECT * FROM tables WHERE id = %s AND restaurant_id = %s",
        (table_id, get_restaurant_id()),
    )
    if not table:
        return jsonify({"error": "Table not found"}), 404

    linked_reservations = query_all(
        "SELECT reservation_id FROM reservation_tables WHERE table_id = %s LIMIT 1",
        (table_id,),
    )
    if linked_reservations:
        return jsonify({"error": "Cannot delete table that is used in reservations"}), 400

    execute(
        "UPDATE tables SET unite_with_table_id = NULL WHERE unite_with_table_id = %s AND restaurant_id = %s",
        (table_id, get_restaurant_id()),
    )
    execute("DELETE FROM table_blocks WHERE table_id = %s", (table_id,))
    execute(
        "DELETE FROM tables WHERE id = %s AND restaurant_id = %s",
        (table_id, get_restaurant_id()),
    )
    return jsonify({"message": "Table deleted"})


@app.post("/api/v1/table-blocks")
def create_table_block():
    body = request.get_json(silent=True) or {}
    required = ["table_id", "start_time", "end_time"]
    missing = [k for k in required if k not in body]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400
    tid = int(body["table_id"])
    owns = query_all(
        "SELECT 1 FROM tables WHERE id = %s AND restaurant_id = %s",
        (tid, get_restaurant_id()),
    )
    if not owns:
        return jsonify({"error": "Table not found"}), 404
    row = execute_returning(
        """
        INSERT INTO table_blocks (table_id, start_time, end_time, reason)
        VALUES (%s, %s, %s, %s)
        RETURNING *
        """,
        (
            tid,
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

    return jsonify(get_reservation(reservation["id"], restaurant_id=get_restaurant_id())), 201


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
            admin_edit=True,
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
    reservation = get_reservation(reservation_id, restaurant_id=get_restaurant_id())
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
    reservation = get_reservation(reservation_id, restaurant_id=get_restaurant_id())
    if reservation:
        send_reservation_email("cancelled", reservation)
    return jsonify({"message": "Reservation cancelled", "reservation": reservation})


@app.post("/api/v1/reservations/<int:reservation_id>/restore")
def restore(reservation_id):
    row = restore_cancelled_reservation(reservation_id)
    if not row:
        return jsonify({"error": "Cancelled reservation not found"}), 404
    reservation = get_reservation(reservation_id, restaurant_id=get_restaurant_id())
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
    execute(
        """
        DELETE FROM table_blocks tb
        USING tables t
        WHERE tb.id = %s AND tb.table_id = t.id AND t.restaurant_id = %s
        """,
        (block_id, get_restaurant_id()),
    )
    return jsonify({"message": "Deleted"})

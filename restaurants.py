import hashlib
import os
import re
from db import execute, execute_returning, query_all, query_one

_MENU_STORAGE_RE = re.compile(r"^\d+_[a-f0-9]{16}\.pdf$")

_MAX_GUEST_CONTACT_FIELD = 4000

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")

PASSWORD_SALT = os.getenv("RESTAURANT_PASSWORD_SALT", "change-me-in-production").encode()


def hash_restaurant_password(password: str) -> str:
    return hashlib.sha256(PASSWORD_SALT + (password or "").encode()).hexdigest()


def verify_restaurant_password(row, password: str) -> bool:
    if not row or not password:
        return False
    return hash_restaurant_password(password) == (row.get("password_hash") or "")


def normalize_slug(slug: str) -> str:
    return (slug or "").strip().lower()


def validate_slug(slug: str) -> None:
    s = normalize_slug(slug)
    if not s or not _SLUG_RE.match(s):
        raise ValueError(
            "slug must be 2–63 chars: lowercase letters, digits, hyphen; must start with letter or digit"
        )
    if s in ("superadmin", "auth", "api", "health"):
        raise ValueError("reserved slug")


def menu_upload_dir() -> str:
    return os.path.abspath(
        os.getenv("MENU_UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "data", "menus"))
    )


def is_valid_menu_storage_name(name: str | None) -> bool:
    return bool(name and _MENU_STORAGE_RE.match(name))


def resolved_menu_file_path(storage_name: str) -> str | None:
    """Absolute path to PDF if file exists and name is safe; else None."""
    if not is_valid_menu_storage_name(storage_name):
        return None
    base = os.path.realpath(menu_upload_dir())
    path = os.path.realpath(os.path.join(base, storage_name))
    if not path.startswith(base + os.sep):
        return None
    return path if os.path.isfile(path) else None


def guest_contact_public_dict(row) -> dict:
    if not row:
        return {"address": None, "phone": None, "hours": None}

    def nz(key):
        v = row.get(key)
        if v is None:
            return None
        s = str(v).strip()
        return s if s else None

    return {
        "address": nz("public_guest_address"),
        "phone": nz("public_guest_phone"),
        "hours": nz("public_guest_hours"),
    }


def normalize_guest_contact_field(value) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    if len(s) > _MAX_GUEST_CONTACT_FIELD:
        raise ValueError(f"guest contact field must be at most {_MAX_GUEST_CONTACT_FIELD} characters")
    return s


def set_public_guest_contact(restaurant_id: int, address, phone, hours) -> None:
    execute(
        """
        UPDATE restaurants
        SET public_guest_address = %s,
            public_guest_phone = %s,
            public_guest_hours = %s
        WHERE id = %s
        """,
        (address, phone, hours, int(restaurant_id)),
    )


def get_restaurant_by_slug(slug: str):
    return query_one(
        """
        SELECT id, slug, display_name, password_hash, is_active, menu_pdf_storage_name, public_footer_text,
               public_guest_address, public_guest_phone, public_guest_hours
        FROM restaurants
        WHERE slug = %s AND is_active = TRUE
        """,
        (normalize_slug(slug),),
    )


def get_restaurant_id_by_slug(slug: str):
    row = get_restaurant_by_slug(slug)
    return int(row["id"]) if row else None


def list_restaurants_public():
    rows = query_all(
        """
        SELECT id, slug, display_name, menu_pdf_storage_name, public_footer_text,
               public_guest_address, public_guest_phone, public_guest_hours
        FROM restaurants
        WHERE is_active = TRUE
        ORDER BY display_name ASC, slug ASC
        """
    )
    ids = [int(r["id"]) for r in rows]
    interval_by_id = {i: [] for i in ids}
    if ids:
        iv_rows = query_all(
            """
            SELECT restaurant_id, date_start, date_end
            FROM sets_choice_intervals
            WHERE restaurant_id = ANY(%s)
            ORDER BY restaurant_id, date_start, id
            """,
            (ids,),
        )
        for iv in iv_rows:
            rid = int(iv["restaurant_id"])
            if rid in interval_by_id:
                interval_by_id[rid].append(
                    {
                        "dateStart": iv["date_start"].isoformat(),
                        "dateEnd": iv["date_end"].isoformat(),
                    }
                )
    out = []
    for row in rows:
        rid = int(row["id"])
        item = {"slug": row["slug"], "displayName": row["display_name"]}
        if row.get("menu_pdf_storage_name"):
            item["menuUrl"] = f"/v1/menus/{row['slug']}"
        else:
            item["menuUrl"] = None
        ft = row.get("public_footer_text")
        if ft and str(ft).strip():
            item["footerText"] = str(ft).strip()
        else:
            item["footerText"] = None
        item["setsChoiceIntervals"] = interval_by_id.get(rid, [])
        item["guestContact"] = guest_contact_public_dict(row)
        out.append(item)
    return out


def list_restaurants_all():
    rows = query_all(
        """
        SELECT id, slug, display_name, is_active, created_at, menu_pdf_storage_name, public_footer_text,
               public_guest_address, public_guest_phone, public_guest_hours
        FROM restaurants
        ORDER BY id ASC
        """
    )
    return [_serialize_restaurant_row(row) for row in rows]


def verify_restaurant_login(login: str, password: str):
    row = get_restaurant_by_slug(login)
    if not row or not verify_restaurant_password(row, password):
        return None
    return row


def _serialize_restaurant_row(row):
    gc = guest_contact_public_dict(row)
    return {
        "id": row["id"],
        "slug": row["slug"],
        "displayName": row["display_name"],
        "isActive": row["is_active"],
        "createdAt": row["created_at"].isoformat() if row.get("created_at") else None,
        "hasMenu": bool(row.get("menu_pdf_storage_name")),
        "hasCustomFooter": bool((row.get("public_footer_text") or "").strip()),
        "hasGuestContact": bool(gc["address"] or gc["phone"] or gc["hours"]),
    }


def get_restaurant_by_id(restaurant_id: int):
    return query_one(
        """
        SELECT id, slug, display_name, password_hash, is_active, created_at, menu_pdf_storage_name, public_footer_text,
               public_guest_address, public_guest_phone, public_guest_hours
        FROM restaurants
        WHERE id = %s
        """,
        (int(restaurant_id),),
    )


def normalize_public_footer_text(value) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    if len(s) > 4000:
        raise ValueError("footer text must be at most 4000 characters")
    return s


def set_public_footer_text(restaurant_id: int, text: str | None) -> None:
    execute(
        "UPDATE restaurants SET public_footer_text = %s WHERE id = %s",
        (text, int(restaurant_id)),
    )


def get_menu_pdf_storage_name(restaurant_id: int) -> str | None:
    row = query_one(
        "SELECT menu_pdf_storage_name FROM restaurants WHERE id = %s",
        (int(restaurant_id),),
    )
    if not row:
        return None
    return row.get("menu_pdf_storage_name") or None


def set_menu_pdf_storage_name(restaurant_id: int, storage_name: str | None) -> None:
    execute(
        "UPDATE restaurants SET menu_pdf_storage_name = %s WHERE id = %s",
        (storage_name, int(restaurant_id)),
    )


def update_restaurant(restaurant_id: int, slug=None, display_name=None, password=None):
    """
    Superadmin updates tenant. password: non-empty string changes hash; None or omit = keep.
    slug / display_name: pass new value to update; None = keep current.
    """
    current = get_restaurant_by_id(restaurant_id)
    if not current:
        return None

    new_slug = current["slug"]
    if slug is not None:
        new_slug = normalize_slug(slug)
        validate_slug(new_slug)
        clash = query_one(
            "SELECT id FROM restaurants WHERE slug = %s AND id <> %s",
            (new_slug, int(restaurant_id)),
        )
        if clash:
            raise ValueError("slug already in use")

    new_name = (current["display_name"] or "").strip()
    if display_name is not None:
        new_name = display_name.strip()
        if not new_name:
            raise ValueError("display_name is required")

    sets = []
    vals = []
    if slug is not None:
        sets.append("slug = %s")
        vals.append(new_slug)
    if display_name is not None:
        sets.append("display_name = %s")
        vals.append(new_name)

    pwd = password
    if pwd is not None and str(pwd).strip():
        if len(str(pwd)) < 6:
            raise ValueError("password must be at least 6 characters")
        sets.append("password_hash = %s")
        vals.append(hash_restaurant_password(str(pwd)))

    if not sets:
        return _serialize_restaurant_row(current)

    vals.append(int(restaurant_id))
    row = execute_returning(
        f"""
        UPDATE restaurants
        SET {", ".join(sets)}
        WHERE id = %s
        RETURNING id, slug, display_name, is_active, created_at, menu_pdf_storage_name, public_footer_text,
                  public_guest_address, public_guest_phone, public_guest_hours
        """,
        tuple(vals),
    )
    return _serialize_restaurant_row(row)


def create_restaurant(slug: str, display_name: str, password: str):
    validate_slug(slug)
    if not (display_name or "").strip():
        raise ValueError("display_name is required")
    if not password or len(password) < 6:
        raise ValueError("password must be at least 6 characters")
    ph = hash_restaurant_password(password)
    row = execute_returning(
        """
        INSERT INTO restaurants (slug, display_name, password_hash)
        VALUES (%s, %s, %s)
        RETURNING id, slug, display_name, is_active, created_at, menu_pdf_storage_name, public_footer_text,
                  public_guest_address, public_guest_phone, public_guest_hours
        """,
        (normalize_slug(slug), display_name.strip(), ph),
    )
    rid = int(row["id"])
    seed_weekly_schedule_for_new_restaurant(rid)
    return _serialize_restaurant_row(row)


def seed_weekly_schedule_for_new_restaurant(restaurant_id: int):
    """Copy weekly rows from restaurant 1, or insert a simple default week."""
    from datetime import time

    template = query_all(
        """
        SELECT weekday, day_name, is_open, open_time, close_time
        FROM weekly_schedule
        WHERE restaurant_id = 1
        ORDER BY weekday
        """
    )
    if len(template) >= 7:
        for row in template:
            execute(
                """
                INSERT INTO weekly_schedule (restaurant_id, weekday, day_name, is_open, open_time, close_time)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (restaurant_id, weekday) DO NOTHING
                """,
                (
                    restaurant_id,
                    row["weekday"],
                    row["day_name"],
                    row["is_open"],
                    row["open_time"],
                    row["close_time"],
                ),
            )
        return

    names = [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
    ]
    for weekday in range(7):
        execute(
            """
            INSERT INTO weekly_schedule (restaurant_id, weekday, day_name, is_open, open_time, close_time)
            VALUES (%s, %s, %s, TRUE, %s, %s)
            ON CONFLICT (restaurant_id, weekday) DO NOTHING
            """,
            (restaurant_id, weekday, names[weekday], time(16, 0), time(22, 30)),
        )

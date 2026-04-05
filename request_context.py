"""Per-request restaurant id (set by Flask before_request). Defaults to 1 if unset."""

from contextvars import ContextVar

_restaurant_id: ContextVar[int] = ContextVar("restaurant_id", default=1)


def set_restaurant_id(restaurant_id: int) -> None:
    _restaurant_id.set(int(restaurant_id))


def get_restaurant_id() -> int:
    return int(_restaurant_id.get())

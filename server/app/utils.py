from datetime import UTC, datetime

from bson import ObjectId
from fastapi import HTTPException


def now() -> datetime:
    return datetime.now(UTC)


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


def oid(value: str, what: str = "הפריט") -> ObjectId:
    """Parse an id; invalid ids are simply 'not found' (never leak existence)."""
    if not ObjectId.is_valid(value):
        raise HTTPException(404, f"{what} לא נמצא")
    return ObjectId(value)


def http_error(status: int, detail: str, code: str) -> HTTPException:
    """An error with a stable machine-readable code in the X-Error-Code header.
    The body stays {"detail": "..."}; clients branch on the code, never on the (Hebrew) text."""
    return HTTPException(status, detail, headers={"X-Error-Code": code})

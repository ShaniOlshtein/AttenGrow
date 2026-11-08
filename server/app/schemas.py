"""Shared request types and response shapes."""
from typing import Annotated

from pydantic import AfterValidator, Field

from .utils import iso


def _clean_name(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("שם התצוגה ריק")
    return v


DisplayName = Annotated[str, Field(min_length=1, max_length=50), AfterValidator(_clean_name)]
Password = Annotated[str, Field(min_length=8, max_length=128)]


def user_out(u: dict) -> dict:
    return {"id": str(u["_id"]), "email": u["email"], "display_name": u["display_name"],
            "created_at": iso(u["created_at"])}

"""Hebrew text for Pydantic validation errors (the default messages are English)."""
import re

FIELD_NAMES = {"email": "אימייל", "password": "סיסמה", "display_name": "שם תצוגה", "title": "כותרת",
               "source": "מקור", "type": "סוג", "score": "ציון", "position": "מיקום", "bed": "ערוגה",
               "new_password": "סיסמה חדשה", "current_password": "סיסמה נוכחית", "content_id": "תוכן",
               "attention": "משקלי קשב", "state": "מצב", "session_id": "סשן", "room_code": "קוד חדר"}

HEBREW = re.compile(r"[֐-׿]")


def _hebrew_message(err: dict, field: str) -> str:
    kind, ctx = err.get("type", ""), err.get("ctx") or {}
    if kind == "string_too_short":
        n = ctx.get("min_length")
        return "שדה חובה" if n == 1 else f"צריך להכיל לפחות {n} תווים"
    if kind == "string_too_long":
        return f"יכול להכיל עד {ctx.get('max_length')} תווים"
    if kind == "too_long":
        return f"יותר מדי ערכים (עד {ctx.get('max_length')})"
    if kind == "missing":
        return "שדה חובה"
    if kind == "greater_than_equal":
        return f"חייב להיות לפחות {ctx.get('ge')}"
    if kind == "less_than_equal":
        return f"חייב להיות לכל היותר {ctx.get('le')}"
    if kind == "literal_error":
        return "ערך לא חוקי"
    if kind == "json_invalid":
        return "גוף הבקשה אינו JSON תקין"
    if kind == "value_error":
        msg = str(err.get("msg", "")).removeprefix("Value error, ")
        if HEBREW.search(msg):  # our own validators already speak Hebrew
            return msg
        return "כתובת אימייל לא תקינה" if field == FIELD_NAMES["email"] else "ערך לא תקין"
    return "ערך לא תקין"


def validation_detail(errors: list[dict]) -> str:
    """One short Hebrew sentence for the first validation error: "<field>: <problem>"."""
    err = errors[0] if errors else {}
    loc = [str(x) for x in err.get("loc", []) if x not in ("body", "query", "path")]
    field = FIELD_NAMES.get(loc[-1], loc[-1]) if loc else ""
    msg = _hebrew_message(err, field)
    return f"{field}: {msg}" if field else msg

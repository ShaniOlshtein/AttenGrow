from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr, Field
from pymongo.errors import DuplicateKeyError

from .. import config
from ..db import db
from ..schemas import DisplayName, Password
from ..security import create_token, current_claims, hash_password, verify_password
from ..utils import now

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: Password
    display_name: DisplayName


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


@router.post("/register", status_code=201)
async def register(body: RegisterIn):
    doc = {"email": body.email.lower(), "password_hash": hash_password(body.password),
           "display_name": body.display_name, "created_at": now(), "token_version": 0}
    try:
        res = await db.users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(409, "כתובת האימייל כבר רשומה") from None
    return {"id": str(res.inserted_id), "email": doc["email"], "display_name": doc["display_name"]}


@router.post("/login")
async def login(body: LoginIn):
    email = body.email.lower()
    # counted per account, not per IP: X-Forwarded-For is client-controlled, so an IP key could be bypassed
    key = email
    if await db.login_failures.count_documents({"key": key}) >= config.LOGIN_MAX_FAILURES:
        minutes = config.LOGIN_WINDOW_SEC // 60
        raise HTTPException(429, f"יותר מדי ניסיונות התחברות שגויים. נסו שוב בעוד {minutes} דקות")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        await db.login_failures.insert_one({"key": key, "created_at": now()})
        raise HTTPException(401, "אימייל או סיסמה שגויים")
    await db.login_failures.delete_many({"key": key})
    token, exp = create_token(user)
    return {"access_token": token, "token_type": "bearer", "expires_in": exp}


@router.post("/logout", status_code=204)
async def logout(claims: dict = Depends(current_claims)):
    exp = datetime.fromtimestamp(claims["exp"], tz=UTC)
    await db.token_denylist.update_one({"jti": claims["jti"]},
                                       {"$setOnInsert": {"jti": claims["jti"], "expires_at": exp}}, upsert=True)
    return Response(status_code=204)

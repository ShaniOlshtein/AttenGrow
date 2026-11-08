from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

from . import config
from .utils import oid

client = AsyncIOMotorClient(config.MONGODB_URI, serverSelectionTimeoutMS=5000, tz_aware=True)
db = client[config.DB_NAME]


async def ensure_indexes() -> None:
    await db.users.create_index("email", unique=True)
    await db.content.create_index([("user_id", 1), ("created_at", -1)])
    await db.sessions.create_index([("user_id", 1), ("started_at", -1)])
    await db.readings.create_index([("session_id", 1), ("created_at", 1)])
    await db.readings.create_index([("user_id", 1), ("created_at", 1)])  # journal "best hour" + account deletion
    await db.token_denylist.create_index("expires_at", expireAfterSeconds=0)
    await db.token_denylist.create_index("jti", unique=True)
    await db.login_failures.create_index("created_at", expireAfterSeconds=config.LOGIN_WINDOW_SEC)
    await db.login_failures.create_index("key")
    await db.rooms.create_index("code", unique=True)
    await db.rooms.create_index("members.user_id")
    await db.rooms.create_index("last_activity", expireAfterSeconds=config.ROOM_TTL_HOURS * 3600)
    await db.shared_plants.create_index("user_ids")


async def find_owned(collection: str, item_id: str, user: dict, what: str) -> dict:
    """One document of `collection` owned by the user - missing, invalid id or someone else's are the same 404."""
    doc = await db[collection].find_one({"_id": oid(item_id, what), "user_id": user["_id"]})
    if not doc:
        raise HTTPException(404, f"{what} לא נמצא")
    return doc

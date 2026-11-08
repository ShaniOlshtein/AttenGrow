"""Study-room domain logic shared by several routers (rooms, sessions, insights).
All state lives in Mongo, so any number of stateless server instances can serve a room."""
from .. import config
from ..db import db
from ..growth import growth
from ..utils import iso, now


def norm(code: str) -> str:
    return code.strip().upper()[:12]


async def on_reading(session: dict, focused_seconds: float, score: float) -> None:
    """Called by the readings endpoint: the server (not the client) updates the member's plant in the room."""
    code = session.get("room_code")
    if not code:
        return
    g = growth(focused_seconds)
    t = now()
    upd = {"members.$.level": g["level"], "members.$.level_exact": g["level_exact"], "members.$.stage": g["stage"],
           "members.$.last_score": score, "members.$.updated_at": t, "members.$.presence": "active", "last_activity": t}
    bloomed = g["level"] >= config.BLOOM_LEVEL
    if bloomed:
        upd["members.$.bloomed"] = True
    await db.rooms.update_one({"code": code, "members.user_id": session["user_id"]}, {"$set": upd})
    if bloomed:
        await check_shared_bloom(code)


async def check_shared_bloom(code: str) -> None:
    room = await db.rooms.find_one({"code": code})
    if not room or room.get("shared_bloom"):
        return
    bloomed = [m for m in room["members"] if m.get("bloomed")]
    if len(bloomed) >= 2 and len(bloomed) == len(room["members"]):
        res = await db.rooms.update_one({"_id": room["_id"], "shared_bloom": {"$ne": True}}, {"$set": {"shared_bloom": True}})
        if res.modified_count:  # only one instance creates the joint plant
            ids = [m["user_id"] for m in bloomed]
            await db.shared_plants.insert_one({"room_code": code, "user_ids": ids,
                                               "names": [m["display_name"] for m in bloomed], "created_at": now()})
            await db.users.update_many({"_id": {"$in": ids}}, {"$set": {"shared_bloom": True}})


async def shared_plants_for(user: dict) -> list[dict]:
    return [{"room_code": p["room_code"], "names": p["names"], "created_at": iso(p["created_at"])}
            async for p in db.shared_plants.find({"user_ids": user["_id"]}).sort("created_at", -1).limit(50)]

"""Feedback endpoint — ratings, questions, ideas, bugs + admin user management."""
import re
from datetime import datetime, timezone

from core import db, get_current_user, require_admin, delete_all_user_data, logger
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

router = APIRouter()

# Safe projection for admin user listings — never pull password_hash or
# reset/verify token hashes into Python just to discard them in _safe_user.
_USER_LIST_PROJECTION = {
    "_id": 0, "id": 1, "email": 1, "name": 1, "created_at": 1,
    "email_verified": 1, "subscription_plan": 1, "subscription_status": 1,
}


def _tier_filter(tier: str) -> dict:
    """Server-side Mongo filter matching the same tier logic as _safe_user's
    `tier` field, so admin_user_list can filter in the DB instead of pulling
    every user into Python first."""
    if tier == "monthly":
        return {"subscription_status": "active", "subscription_plan": "monthly"}
    if tier == "yearly":
        return {"subscription_status": "active", "subscription_plan": "yearly"}
    if tier == "free":
        return {"$nor": [{"subscription_status": "active", "subscription_plan": {"$in": ["monthly", "yearly"]}}]}
    return {}


class FeedbackIn(BaseModel):
    category: str     # "rating" | "question" | "idea" | "bug"
    rating: int | None = None   # 1-5, only for category="rating"
    message: str


@router.post("/feedback")
async def submit_feedback(body: FeedbackIn, user=Depends(get_current_user)):
    doc = {
        "user_id":    user["id"],
        "user_email": user.get("email", ""),
        "category":   body.category,
        "rating":     body.rating,
        "message":    body.message.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read":       False,
    }
    await db.feedback.insert_one(doc)
    logger.info(f"Feedback [{body.category}] from {user.get('email')}: {body.message[:60]}")
    return {"ok": True}


@router.get("/feedback/unread-count")
async def unread_count(user=Depends(require_admin)):
    """Admin only -- count of unread feedback messages."""
    count = await db.feedback.count_documents({"read": {"$ne": True}})
    return {"count": count}


@router.patch("/feedback/mark-all-read")
async def mark_all_read(user=Depends(require_admin)):
    """Admin only -- mark all feedback as read."""
    await db.feedback.update_many({"read": {"$ne": True}}, {"$set": {"read": True}})
    return {"ok": True}


@router.get("/feedback")
async def list_feedback(user=Depends(require_admin)):
    """Admin only -- returns all feedback."""
    docs = await db.feedback.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


# -- Admin: User Management ----------------------------------------------------

def _safe_user(u: dict) -> dict:
    """Strip sensitive fields before sending to admin UI."""
    sub_plan   = u.get("subscription_plan")
    sub_status = u.get("subscription_status", "none")
    if sub_status == "active" and sub_plan:
        tier = sub_plan  # "monthly" or "yearly"
    else:
        tier = "free"
    return {
        "id":             u.get("id", ""),
        "email":          u.get("email", ""),
        "name":           u.get("name", ""),
        "tier":           tier,
        "created_at":     u.get("created_at", ""),
        "email_verified": u.get("email_verified", False),
    }


@router.get("/admin/users/stats")
async def admin_user_stats(user=Depends(require_admin)):
    """Admin only -- user counts + last 10 registrations. Counts come from a
    Mongo aggregation ($group) instead of loading every user document into
    Python, so this stays fast as the user base grows."""
    pipeline = [
        {"$group": {
            "_id": {
                "$cond": [
                    {"$and": [
                        {"$eq": ["$subscription_status", "active"]},
                        {"$in": ["$subscription_plan", ["monthly", "yearly"]]},
                    ]},
                    "$subscription_plan",
                    "free",
                ]
            },
            "count": {"$sum": 1},
        }},
    ]
    rows = await db.users.aggregate(pipeline).to_list(10)
    counts = {r["_id"]: r["count"] for r in rows}
    free, monthly, yearly = counts.get("free", 0), counts.get("monthly", 0), counts.get("yearly", 0)

    last10_docs = await db.users.find({}, _USER_LIST_PROJECTION).sort("created_at", -1).to_list(10)
    last10 = [_safe_user(u) for u in last10_docs]

    return {
        "total":   free + monthly + yearly,
        "free":    free,
        "monthly": monthly,
        "yearly":  yearly,
        "last10":  last10,
    }


@router.get("/admin/users/list")
async def admin_user_list(
    tier: str | None = Query(None, description="free|monthly|yearly; omit for all users"),
    user=Depends(require_admin),
):
    """Admin only -- full user list, optionally filtered by tier. Backs the
    clickable stat cards (Total/Free/Pro Mensal/Pro Anual) on the admin
    Users tab, as opposed to /admin/users/stats' last10 which is always
    unfiltered and capped at 10. The tier filter is applied in the Mongo
    query itself (see _tier_filter) rather than after loading every user."""
    query = _tier_filter(tier) if tier in ("free", "monthly", "yearly") else {}
    docs = await db.users.find(query, _USER_LIST_PROJECTION).sort("created_at", -1).to_list(10000)
    return [_safe_user(u) for u in docs]


@router.get("/admin/users/search")
async def admin_user_search(
    q: str = Query(..., min_length=1),
    user=Depends(require_admin),
):
    """Admin only -- search users by email or name (case-insensitive)."""
    pattern = re.compile(re.escape(q.strip()), re.IGNORECASE)
    results = await db.users.find(
        {"$or": [{"email": pattern}, {"name": pattern}]},
        _USER_LIST_PROJECTION,
    ).sort("created_at", -1).to_list(50)

    return [_safe_user(u) for u in results]


@router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, user=Depends(require_admin)):
    """Admin only -- permanently delete a user and all their data."""
    from core import ADMIN_EMAILS

    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.get("email") in ADMIN_EMAILS:
        raise HTTPException(status_code=400, detail="Cannot delete admin account")

    email = target.get("email", "")
    await delete_all_user_data(user_id)

    logger.warning(f"Admin deleted user {email} (id={user_id})")
    return {"ok": True, "deleted_email": email}

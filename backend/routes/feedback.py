"""Feedback endpoint — ratings, questions, ideas, bugs + admin user management."""
import logging
import re
from datetime import datetime, timezone

from core import db, get_current_user
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

ADMIN_EMAILS = {"entredonos@gmail.com"}


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
async def unread_count(user=Depends(get_current_user)):
    """Admin only -- count of unread feedback messages."""
    if user.get("email") not in ADMIN_EMAILS:
        return {"count": 0}
    count = await db.feedback.count_documents({"read": {"$ne": True}})
    return {"count": count}


@router.patch("/feedback/mark-all-read")
async def mark_all_read(user=Depends(get_current_user)):
    """Admin only -- mark all feedback as read."""
    if user.get("email") not in ADMIN_EMAILS:
        return {"ok": False}
    await db.feedback.update_many({"read": {"$ne": True}}, {"$set": {"read": True}})
    return {"ok": True}


@router.get("/feedback")
async def list_feedback(user=Depends(get_current_user)):
    """Admin only -- returns all feedback."""
    if user.get("email") not in ADMIN_EMAILS:
        return []
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
async def admin_user_stats(user=Depends(get_current_user)):
    """Admin only -- user counts + last 10 registrations."""
    if user.get("email") not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Forbidden")

    all_users = await db.users.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)

    total   = len(all_users)
    free    = 0
    monthly = 0
    yearly  = 0

    for u in all_users:
        sub_status = u.get("subscription_status", "none")
        sub_plan   = u.get("subscription_plan")
        if sub_status == "active" and sub_plan == "monthly":
            monthly += 1
        elif sub_status == "active" and sub_plan == "yearly":
            yearly += 1
        else:
            free += 1

    last10 = [_safe_user(u) for u in all_users[:10]]

    return {
        "total":   total,
        "free":    free,
        "monthly": monthly,
        "yearly":  yearly,
        "last10":  last10,
    }


@router.get("/admin/users/list")
async def admin_user_list(
    tier: str | None = Query(None, description="free|monthly|yearly; omit for all users"),
    user=Depends(get_current_user),
):
    """Admin only -- full user list, optionally filtered by tier. Backs the
    clickable stat cards (Total/Free/Pro Mensal/Pro Anual) on the admin
    Users tab, as opposed to /admin/users/stats' last10 which is always
    unfiltered and capped at 10."""
    if user.get("email") not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Forbidden")

    all_users = await db.users.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    safe = [_safe_user(u) for u in all_users]
    if tier in ("free", "monthly", "yearly"):
        safe = [u for u in safe if u["tier"] == tier]
    return safe


@router.get("/admin/users/search")
async def admin_user_search(
    q: str = Query(..., min_length=1),
    user=Depends(get_current_user),
):
    """Admin only -- search users by email or name (case-insensitive)."""
    if user.get("email") not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Forbidden")

    pattern = re.compile(re.escape(q.strip()), re.IGNORECASE)
    results = await db.users.find(
        {"$or": [{"email": pattern}, {"name": pattern}]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(50)

    return [_safe_user(u) for u in results]


@router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, user=Depends(get_current_user)):
    """Admin only -- permanently delete a user and all their data."""
    if user.get("email") not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Forbidden")

    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.get("email") in ADMIN_EMAILS:
        raise HTTPException(status_code=400, detail="Cannot delete admin account")

    email = target.get("email", "")

    await db.users.delete_one({"id": user_id})
    await db.transactions.delete_many({"user_id": user_id})
    await db.wallets.delete_many({"user_id": user_id})
    await db.snapshots.delete_many({"user_id": user_id})
    await db.alerts.delete_many({"user_id": user_id})
    await db.watchlists.delete_many({"user_id": user_id})
    await db.feedback.delete_many({"user_id": user_id})
    for col in ["preferences", "share_links", "broker_credentials", "audit_log"]:
        try:
            await getattr(db, col).delete_many({"user_id": user_id})
        except Exception:
            pass

    logger.warning(f"Admin deleted user {email} (id={user_id})")
    return {"ok": True, "deleted_email": email}

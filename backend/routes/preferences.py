"""User preferences (cross-device UI sync)."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from core import db, get_current_user
from models import UserPrefsUpdate

router = APIRouter()


@router.get("/preferences")
async def get_preferences(user=Depends(get_current_user)):
    doc = await db.user_prefs.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    return {
        "language": doc.get("language", "en"),
        "theme": doc.get("theme", "dark"),
        "currency": doc.get("currency", "USD"),
        "privacy_hidden": bool(doc.get("privacy_hidden", False)),
        "dash_cols": doc.get("dash_cols") or [],
        "watch_cols": doc.get("watch_cols") or [],
        "alert_emails": bool(doc.get("alert_emails", True)),
        "alert_push": bool(doc.get("alert_push", True)),
        "alert_telegram": bool(doc.get("alert_telegram", True)),
        "onboarding_completed": bool(doc.get("onboarding_completed", False)),
    }


@router.put("/preferences")
async def put_preferences(payload: UserPrefsUpdate, user=Depends(get_current_user)):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if not update:
        return {"ok": True}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.user_prefs.update_one(
        {"user_id": user["id"]},
        {"$set": dict(**update, user_id=user["id"])},
        upsert=True,
    )
    return {"ok": True}

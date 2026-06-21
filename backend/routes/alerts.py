"""Price alerts CRUD."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends

from core import db, get_current_user, require_active_subscription, _cache_get, _cache_set
from models import AlertCreate, AlertUpdate

router = APIRouter()


@router.get("/alerts")
async def list_alerts(user=Depends(require_active_subscription)):
    return await db.alerts.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/alerts")
async def create_alert(payload: AlertCreate, user=Depends(require_active_subscription)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "symbol": payload.symbol.upper().strip(),
        "asset_type": payload.asset_type,
        "coingecko_id": (payload.coingecko_id or "").lower().strip() or None,
        "name": payload.name or payload.symbol.upper(),
        "condition": payload.condition,
        "target_price_usd": payload.target_price_usd,
        "note": payload.note or "",
        "active": True,
        "triggered_at": None,
        "triggered_price_usd": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.alerts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/alerts/{alert_id}")
async def update_alert(alert_id: str, payload: AlertUpdate, user=Depends(require_active_subscription)):
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "active" in upd and upd["active"]:
        upd["triggered_at"] = None
        upd["triggered_price_usd"] = None
    if not upd:
        raise HTTPException(400, "Nothing to update")
    res = await db.alerts.update_one({"id": alert_id, "user_id": user["id"]}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Alert not found")
    return await db.alerts.find_one({"id": alert_id}, {"_id": 0})


@router.delete("/alerts/{alert_id}")
async def delete_alert(alert_id: str, user=Depends(require_active_subscription)):
    res = await db.alerts.delete_one({"id": alert_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Alert not found")
    return {"ok": True}

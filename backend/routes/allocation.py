"""Asset-class allocation targets + manual per-symbol reclassification.

"UPGRADE v1.0": lets a user define target percentages per asset class
(stock/crypto/etf/fund/cash — deliberately the same 5 classes already used
as asset_type elsewhere in the app, no new instrument types) and compare
them against the actual live allocation. The "actual %" side and the
buy/sell rebalancing math are NOT computed here — holdings already carry
wallet_id + asset_type per item and are already fetched client-side (by
Dashboard.jsx and Wallets.jsx), so that aggregation happens in the
frontend, reusing data that's already loaded instead of a redundant
server round-trip. This module only persists the two small pieces of user
configuration that need to survive across sessions/devices: the target
percentages, and any manual class overrides (e.g. a Bitcoin ETF that
should count as "crypto" instead of "etf").

Both are stored in a single per-user document in db.allocation_prefs, same
lightweight pattern as routes/preferences.py.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from core import db, get_current_user
from models import ALLOCATION_CLASSES, AllocationOverrideUpdate, AllocationTargetUpdate

router = APIRouter()

_TOLERANCE = 0.5  # allow the sum to land at 99.5–100.5 (rounding slack)


@router.get("/allocation")
async def get_allocation_prefs(user=Depends(get_current_user)):
    doc = await db.allocation_prefs.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    return {
        "targets": doc.get("targets") or {},
        "overrides": doc.get("overrides") or {},
    }


@router.put("/allocation/target")
async def put_allocation_target(payload: AllocationTargetUpdate, user=Depends(get_current_user)):
    targets = payload.targets
    # Empty dict = "disable target allocation" (the Dashboard dialog's
    # Desativar button). Skip the class/sum validation entirely in that
    # case — there's nothing to validate, we're just clearing it back to
    # the "no target configured" state.
    if targets:
        unknown = [k for k in targets if k not in ALLOCATION_CLASSES]
        if unknown:
            raise HTTPException(400, detail=f"Unknown class(es): {', '.join(unknown)}")
        total = sum(float(v) for v in targets.values())
        if abs(total - 100) > _TOLERANCE:
            raise HTTPException(400, detail={"reason": "sum_not_100", "sum": total})

    await db.allocation_prefs.update_one(
        {"user_id": user["id"]},
        {"$set": {
            "user_id": user["id"],
            "targets": {k: float(v) for k, v in targets.items()},
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True}


@router.put("/allocation/override")
async def put_allocation_override(payload: AllocationOverrideUpdate, user=Depends(get_current_user)):
    symbol = payload.symbol.upper().strip()
    if not symbol:
        raise HTTPException(400, detail="symbol required")

    if payload.override_class is None:
        # Clear the override — falls back to the asset's real asset_type.
        await db.allocation_prefs.update_one(
            {"user_id": user["id"]},
            {"$unset": {f"overrides.{symbol}": ""}},
            upsert=True,
        )
        return {"ok": True, "symbol": symbol, "class": None}

    if payload.override_class not in ALLOCATION_CLASSES:
        raise HTTPException(400, detail=f"Unknown class: {payload.override_class}")

    await db.allocation_prefs.update_one(
        {"user_id": user["id"]},
        {"$set": {
            "user_id": user["id"],
            f"overrides.{symbol}": payload.override_class,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True, "symbol": symbol, "class": payload.override_class}

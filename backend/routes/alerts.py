"""Price alerts CRUD."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends

from core import db, get_current_user, is_pro_user, _cache_get, _cache_set
from models import AlertCreate, AlertUpdate
from prices import get_crypto_prices, get_stock_prices

router = APIRouter()

FREE_ALERT_LIMIT = 3


@router.get("/alerts")
async def list_alerts(user=Depends(get_current_user)):
    alerts = await db.alerts.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Preço atual (17 jul 2026): antes o frontend só tinha preço para ativos EM
    # CARTEIRA (vindo de /portfolio), por isso um alerta num ativo que NÃO se
    # detém mostrava "Atual"/"Distância" a "—" — logo nos alertas, que servem
    # justamente para ativos que ainda não se têm. Buscamos aqui o preço com as
    # funções já cacheadas (get_crypto_prices 60s / get_stock_prices 120s), sem
    # pedidos extra às APIs além do que a app já faz noutras páginas.
    if alerts:
        crypto_ids = list({(a.get("coingecko_id") or a["symbol"].lower())
                           for a in alerts if a.get("asset_type") == "crypto"})
        stock_syms = list({a["symbol"].upper()
                           for a in alerts if a.get("asset_type") != "crypto"})
        crypto_prices = await get_crypto_prices(crypto_ids) if crypto_ids else {}
        stock_prices = await get_stock_prices(stock_syms) if stock_syms else {}
        for a in alerts:
            if a.get("asset_type") == "crypto":
                cg = a.get("coingecko_id") or a["symbol"].lower()
                price = (crypto_prices.get(cg) or {}).get("usd")
            else:
                price = (stock_prices.get(a["symbol"].upper()) or {}).get("usd")
            a["current_price_usd"] = float(price) if price else None
    return alerts


@router.post("/alerts")
async def create_alert(payload: AlertCreate, user=Depends(get_current_user)):
    if not is_pro_user(user):
        count = await db.alerts.count_documents({"user_id": user["id"]})
        if count >= FREE_ALERT_LIMIT:
            raise HTTPException(402, detail={"reason": "alert_limit", "limit": FREE_ALERT_LIMIT})
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
async def update_alert(alert_id: str, payload: AlertUpdate, user=Depends(get_current_user)):
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
async def delete_alert(alert_id: str, user=Depends(get_current_user)):
    res = await db.alerts.delete_one({"id": alert_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Alert not found")
    return {"ok": True}

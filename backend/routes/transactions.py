"""Transactions, holdings, and bulk import."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends

from core import db, get_current_user, require_active_subscription, _cache_get, _cache_set
from models import TransactionCreate, TransactionUpdate
from prices import compute_holdings_from_txns, migrate_legacy_assets, get_fx_rates

router = APIRouter()


@router.get("/transactions")
async def list_transactions(user=Depends(require_active_subscription)):
    return await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).sort("date", -1).to_list(5000)


@router.post("/transactions")
async def create_transaction(payload: TransactionCreate, user=Depends(require_active_subscription)):
    wallet = await db.wallets.find_one({"id": payload.wallet_id, "user_id": user["id"]})
    if not wallet:
        raise HTTPException(404, "Wallet not found")
    currency = payload.currency or wallet.get("currency") or "USD"
    fx_rates = await get_fx_rates()
    fx_to_usd = 1.0 / fx_rates.get(currency, 1.0)
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "wallet_id": payload.wallet_id,
        "asset_type": payload.asset_type,
        "symbol": payload.symbol.upper().strip(),
        "coingecko_id": (payload.coingecko_id or "").lower().strip() if payload.asset_type == "crypto" else None,
        "name": payload.name or payload.symbol.upper(),
        "type": payload.type,
        "date": payload.date,
        "quantity": payload.quantity,
        "price": payload.price,
        "fee": payload.fee,
        "currency": currency,
        "fx_to_usd": fx_to_usd,
        "notes": payload.notes or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.transactions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/transactions/{txn_id}")
async def update_transaction(txn_id: str, payload: TransactionUpdate, user=Depends(require_active_subscription)):
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(400, "Nothing to update")
    res = await db.transactions.update_one({"id": txn_id, "user_id": user["id"]}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Transaction not found")
    return await db.transactions.find_one({"id": txn_id}, {"_id": 0})


@router.delete("/transactions/{txn_id}")
async def delete_transaction(txn_id: str, user=Depends(require_active_subscription)):
    res = await db.transactions.delete_one({"id": txn_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Transaction not found")
    return {"ok": True}


@router.get("/holdings")
async def get_holdings(user=Depends(require_active_subscription)):
    await migrate_legacy_assets(user["id"])
    txns = await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).to_list(5000)
    return compute_holdings_from_txns(txns)


@router.post("/transactions/import")
async def import_transactions(payload: dict, user=Depends(get_current_user)):
    """Bulk-import transactions from a parsed file (frontend parses and sends JSON)."""
    wallet_id = payload.get("wallet_id")
    rows = payload.get("rows", [])
    if not wallet_id or not isinstance(rows, list) or not rows:
        raise HTTPException(400, "wallet_id and non-empty rows required")
    wallet = await db.wallets.find_one({"id": wallet_id, "user_id": user["id"]})
    if not wallet:
        raise HTTPException(404, "Wallet not found")
    wallet_currency = wallet.get("currency") or "USD"
    fx_rates = await get_fx_rates()

    docs = []
    errors = []
    for i, r in enumerate(rows):
        try:
            ttype = (r.get("type") or "BUY").upper()
            if ttype not in ("BUY", "SELL"):
                raise ValueError(f"invalid type: {ttype}")
            currency = (r.get("currency") or wallet_currency).upper()
            if currency not in ("USD", "EUR", "CHF"):
                currency = wallet_currency
            fx_to_usd = 1.0 / fx_rates.get(currency, 1.0)
            asset_type = (r.get("asset_type") or "crypto").lower()
            if asset_type not in ("crypto", "stock"):
                asset_type = "crypto"
            qty = float(r.get("quantity") or 0)
            price = float(r.get("price") or 0)
            if qty <= 0 or price < 0:
                raise ValueError("invalid quantity/price")
            docs.append({
                "id": str(uuid.uuid4()),
                "user_id": user["id"],
                "wallet_id": wallet_id,
                "asset_type": asset_type,
                "symbol": (r.get("symbol") or "").upper().strip(),
                "coingecko_id": (r.get("coingecko_id") or "").lower().strip() if asset_type == "crypto" else None,
                "name": r.get("name") or (r.get("symbol") or "").upper(),
                "type": ttype,
                "date": r.get("date") or datetime.now(timezone.utc).date().isoformat(),
                "quantity": qty,
                "price": price,
                "fee": float(r.get("fee") or 0),
                "currency": currency,
                "fx_to_usd": fx_to_usd,
                "notes": r.get("notes") or "CSV import",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "_imported": True,
            })
        except Exception as e:
            errors.append({"row": i + 1, "error": str(e), "data": r})
    if docs:
        await db.transactions.insert_many(docs)
    return {"imported": len(docs), "errors": errors}

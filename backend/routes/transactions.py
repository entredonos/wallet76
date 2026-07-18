"""Transactions, holdings, and bulk import."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends

from core import db, get_current_user, require_active_subscription, is_pro_user, _cache_get, _cache_set, invalidate_history_cache
from models import TransactionCreate, TransactionUpdate
from prices import compute_holdings_from_txns, migrate_legacy_assets, get_fx_rates, resolve_asset_type

router = APIRouter()


@router.get("/transactions")
async def list_transactions(user=Depends(get_current_user)):
    return await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).sort("date", -1).to_list(5000)


@router.post("/transactions")
async def create_transaction(payload: TransactionCreate, user=Depends(get_current_user)):
    if not is_pro_user(user):
        txns = await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).to_list(5000)
        holdings = compute_holdings_from_txns(txns)
        active_symbols = {h["symbol"] for h in holdings if h.get("quantity", 0) > 0}
        new_sym = payload.symbol.upper().strip()
        if new_sym not in active_symbols and len(active_symbols) >= 15:
            raise HTTPException(402, detail={"reason": "asset_limit", "limit": 15})
    wallet = await db.wallets.find_one({"id": payload.wallet_id, "user_id": user["id"]})
    if not wallet:
        raise HTTPException(404, "Wallet not found")
    currency = payload.currency or wallet.get("currency") or "USD"
    fx_rates = await get_fx_rates()
    fx_to_usd = 1.0 / fx_rates.get(currency, 1.0)
    # REIT (7 jul 2026) — a pesquisa do frontend já distingue ETF/fundo via
    # Yahoo, mas nunca produz "reit" (Yahoo classifica REITs como EQUITY
    # normal). Confirmamos aqui via industry antes de gravar.
    asset_type = payload.asset_type
    if asset_type == "stock":
        asset_type = await resolve_asset_type(payload.symbol.upper().strip(), "stock")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "wallet_id": payload.wallet_id,
        "asset_type": asset_type,
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
    invalidate_history_cache(user["id"])
    return doc


@router.patch("/transactions/{txn_id}")
async def update_transaction(txn_id: str, payload: TransactionUpdate, user=Depends(get_current_user)):
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(400, "Nothing to update")
    res = await db.transactions.update_one({"id": txn_id, "user_id": user["id"]}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Transaction not found")
    invalidate_history_cache(user["id"])
    return await db.transactions.find_one({"id": txn_id}, {"_id": 0})


@router.delete("/transactions/{txn_id}")
async def delete_transaction(txn_id: str, user=Depends(get_current_user)):
    res = await db.transactions.delete_one({"id": txn_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Transaction not found")
    invalidate_history_cache(user["id"])
    return {"ok": True}


@router.delete("/transactions/wallet/{wallet_id}")
async def clear_wallet_transactions(wallet_id: str, user=Depends(get_current_user)):
    """Delete all transactions for a specific wallet (keeps the wallet itself)."""
    wallet = await db.wallets.find_one({"id": wallet_id, "user_id": user["id"]})
    if not wallet:
        raise HTTPException(404, "Wallet not found")
    res = await db.transactions.delete_many({"wallet_id": wallet_id, "user_id": user["id"]})
    # Also clear snapshots so they don't skew portfolio history
    await db.snapshots.delete_many({"user_id": user["id"]})
    invalidate_history_cache(user["id"])
    return {"ok": True, "deleted": res.deleted_count}


@router.delete("/transactions/all")
async def clear_all_transactions(user=Depends(get_current_user)):
    """Delete ALL transactions for the current user (keeps wallets)."""
    res = await db.transactions.delete_many({"user_id": user["id"]})
    await db.snapshots.delete_many({"user_id": user["id"]})
    invalidate_history_cache(user["id"])
    return {"ok": True, "deleted": res.deleted_count}


@router.get("/holdings")
async def get_holdings(user=Depends(get_current_user)):
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
    if len(rows) > 5000:
        # This endpoint is normally fed by the frontend's file-parsing flow,
        # but nothing stops a client from POSTing an arbitrarily large `rows`
        # array directly — cap it so a request can't force an oversized
        # insert_many/memory spike (matches the to_list(5000) cap used
        # elsewhere in this file for reading transactions back).
        raise HTTPException(400, "Too many rows in a single import (max 5000)")
    wallet = await db.wallets.find_one({"id": wallet_id, "user_id": user["id"]})
    if not wallet:
        raise HTTPException(404, "Wallet not found")
    wallet_currency = wallet.get("currency") or "USD"
    if not is_pro_user(user):
        _existing = await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).to_list(5000)
        _existing_syms = {h["symbol"] for h in compute_holdings_from_txns(_existing) if h.get("quantity", 0) > 0}
        _new_syms = {(r.get("symbol") or "").upper().strip() for r in rows if (r.get("symbol") or "").strip()}
        if len(_existing_syms | _new_syms) > 15:
            raise HTTPException(402, detail={"reason": "asset_limit", "limit": 15})
    fx_rates = await get_fx_rates()

    docs = []
    errors = []
    for i, r in enumerate(rows):
        try:
            ttype = (r.get("type") or "BUY").upper()
            if ttype not in ("BUY", "SELL"):
                raise ValueError(f"invalid type: {ttype}")
            currency = (r.get("currency") or wallet_currency).upper()
            if currency not in ("USD", "EUR", "GBP", "CHF", "JPY", "BRL", "CAD", "AUD"):
                currency = wallet_currency
            fx_to_usd = 1.0 / fx_rates.get(currency, 1.0)
            asset_type = (r.get("asset_type") or "crypto").lower()
            if asset_type not in ("crypto", "stock", "etf", "fund", "bond", "cash", "reit"):
                asset_type = "stock"  # default for unknown equity types
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
            })
        except Exception as e:
            errors.append({"row": i, "error": str(e)})
            continue

    if docs:
        await db.transactions.insert_many(docs)
        invalidate_history_cache(user["id"])

    return {"imported": len(docs), "errors": errors}

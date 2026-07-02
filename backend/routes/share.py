"""Public portfolio share links.

Endpoints (authenticated):
  POST   /api/share/generate   — create or refresh a share link for the user
  GET    /api/share/status     — return current share link info (or null)
  DELETE /api/share            — revoke the share link
  PATCH  /api/share/settings   — update hide_values flag

Public endpoint (no auth):
  GET    /api/p/{slug}         — return sanitised portfolio data for a share slug
"""
import asyncio
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from core import db, get_current_user, _cache_get, _cache_set, logger
from prices import (
    compute_holdings_from_txns,
    get_crypto_prices,
    get_stock_prices,
    get_fx_rates,
)

router = APIRouter()

SLUG_BYTES = 10          # 10 random bytes → 20-char hex slug (URL-safe)
PUBLIC_CACHE_TTL = 60    # seconds to cache the public portfolio view


# ---------------------------------------------------------------------------
# Pydantic bodies
# ---------------------------------------------------------------------------

class ShareSettingsBody(BaseModel):
    hide_values: bool = False


# ---------------------------------------------------------------------------
# Authenticated management endpoints
# ---------------------------------------------------------------------------

@router.post("/share/generate")
async def generate_share_link(user=Depends(get_current_user)):
    """Create (or regenerate) a public share link for the authenticated user."""
    slug = secrets.token_hex(SLUG_BYTES)
    now = datetime.now(timezone.utc).isoformat()

    doc = {
        "user_id": user["id"],
        "slug": slug,
        "hide_values": False,
        "created_at": now,
        "updated_at": now,
    }

    await db.share_links.update_one(
        {"user_id": user["id"]},
        {"$set": doc},
        upsert=True,
    )
    return {"slug": slug, "hide_values": False}


@router.get("/share/status")
async def share_status(user=Depends(get_current_user)):
    """Return the user's current share link, or null if none."""
    doc = await db.share_links.find_one({"user_id": user["id"]}, {"_id": 0})
    if not doc:
        return {"active": False}
    return {"active": True, "slug": doc["slug"], "hide_values": doc.get("hide_values", False)}


@router.delete("/share")
async def revoke_share_link(user=Depends(get_current_user)):
    """Delete the user's share link."""
    await db.share_links.delete_one({"user_id": user["id"]})
    return {"ok": True}


@router.patch("/share/settings")
async def update_share_settings(body: ShareSettingsBody, user=Depends(get_current_user)):
    """Toggle hide_values on the existing share link."""
    res = await db.share_links.update_one(
        {"user_id": user["id"]},
        {"$set": {"hide_values": body.hide_values, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "No share link found. Generate one first.")
    return {"ok": True, "hide_values": body.hide_values}


# ---------------------------------------------------------------------------
# Public read endpoint — no authentication required
# ---------------------------------------------------------------------------

@router.get("/p/{slug}")
async def public_portfolio(slug: str):
    """Return a sanitised, read-only portfolio snapshot for a share slug."""
    cache_key = f"public_portfolio:{slug}"
    cached = _cache_get(cache_key, PUBLIC_CACHE_TTL)
    if cached:
        return cached

    link = await db.share_links.find_one({"slug": slug}, {"_id": 0})
    if not link:
        raise HTTPException(404, "Portfolio not found or link has been revoked.")

    user_id = link["user_id"]
    hide_values = link.get("hide_values", False)

    # Fetch user display name (never expose email)
    user = await db.users.find_one({"id": user_id}, {"name": 1, "_id": 0})
    display_name = (user or {}).get("name") or "Anonymous"

    # Compute holdings from transactions
    txns = await db.transactions.find({"user_id": user_id}, {"_id": 0}).to_list(5000)
    holdings = compute_holdings_from_txns(txns)
    holdings = [h for h in holdings if h.get("quantity", 0) > 0]

    if not holdings:
        result = {
            "display_name": display_name,
            "hide_values": hide_values,
            "assets": [],
            "summary": {},
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        _cache_set(cache_key, result)
        return result

    crypto_ids = [
        (h.get("coingecko_id") or h["symbol"]).lower()
        for h in holdings if h["asset_type"] == "crypto"
    ]
    stock_syms = [h["symbol"].upper() for h in holdings if h["asset_type"] == "stock"]

    crypto_prices, stock_prices, fx_rates = await asyncio.gather(
        get_crypto_prices(list(set(crypto_ids))),
        get_stock_prices(list(set(stock_syms))),
        get_fx_rates(),
    )
    eur_rate = fx_rates.get("EUR", 0.92)

    enriched = []
    total_usd = 0.0
    total_cost = 0.0

    for h in holdings:
        price_usd = 0.0
        change_24h = 0.0

        if h["asset_type"] == "crypto":
            key = (h.get("coingecko_id") or h["symbol"]).lower()
            p = crypto_prices.get(key) or {}
            price_usd = float(p.get("usd") or 0)
            change_24h = float(p.get("usd_24h_change") or 0)
        else:
            p = stock_prices.get(h["symbol"].upper()) or {}
            price_usd = float(p.get("usd") or 0)
            change_24h = float(p.get("change_pct") or 0)

        value = price_usd * h["quantity"]
        cost = h["avg_cost_usd"] * h["quantity"]
        pnl = value - cost
        pnl_pct = (pnl / cost * 100) if cost > 0 else 0

        total_usd += value
        total_cost += cost

        asset = {
            "symbol": h["symbol"],
            "name": h.get("name") or h["symbol"],
            "asset_type": h["asset_type"],
            "quantity": h["quantity"],
            "price_usd": price_usd,
            "change_24h": round(change_24h, 2),
            "pnl_pct": round(pnl_pct, 2),
            # Value fields hidden if hide_values is set
            "value_usd": None if hide_values else round(value, 2),
            "value_eur": None if hide_values else round(value * eur_rate, 2),
            "pnl_usd": None if hide_values else round(pnl, 2),
            "weight_pct": 0,  # filled after total is known
        }
        enriched.append(asset)

    # Compute portfolio weights
    for a in enriched:
        a["weight_pct"] = round((a["price_usd"] * a["quantity"] / total_usd * 100) if total_usd > 0 else 0, 1)

    total_pnl = total_usd - total_cost
    total_pnl_pct = (total_pnl / total_cost * 100) if total_cost > 0 else 0

    summary = {
        "total_usd": None if hide_values else round(total_usd, 2),
        "total_eur": None if hide_values else round(total_usd * eur_rate, 2),
        "total_pnl_usd": None if hide_values else round(total_pnl, 2),
        "total_pnl_pct": round(total_pnl_pct, 2),
        "asset_count": len(enriched),
    }

    result = {
        "display_name": display_name,
        "hide_values": hide_values,
        "assets": sorted(enriched, key=lambda x: -(x["price_usd"] * x["quantity"])),
        "summary": summary,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    _cache_set(cache_key, result)
    return result

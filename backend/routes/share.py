"""Public portfolio share links.

Endpoints (authenticated):
  POST   /api/share/generate   — create or refresh a share link for the user
  GET    /api/share/status     — return current share link info (or null)
  DELETE /api/share            — revoke the share link
  PATCH  /api/share/settings   — update hide_values / wallet_id

Public endpoint (no auth):
  GET    /api/p/{slug}         — return sanitised portfolio data for a share slug
"""
import asyncio
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from typing import Optional

from core import (
    db, get_current_user, _cache_get, _cache_set, _cache_clear_prefix, logger,
)
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
    """Ambos os campos sao opcionais e tratados de forma independente: o
    frontend envia so o que mudou. Distinguimos "campo nao enviado" de
    "campo enviado a null" atraves de model_fields_set, porque wallet_id=None
    e um valor com significado proprio (= partilhar todas as carteiras)."""
    hide_values: Optional[bool] = None
    wallet_id: Optional[str] = None


def _public_cache_key(slug: str) -> str:
    return f"public_portfolio:{slug}"


def _invalidate_public_cache(slug: str) -> None:
    """A vista publica e cacheada 60s. Sem isto, mudar o "ocultar valores",
    trocar de carteira ou REVOGAR o link continuava a servir o conteudo
    antigo ate um minuto — no caso da revogacao isso e um problema de
    privacidade, nao so um atraso cosmetico."""
    if slug:
        _cache_clear_prefix(_public_cache_key(slug))


# ---------------------------------------------------------------------------
# Authenticated management endpoints
# ---------------------------------------------------------------------------

@router.post("/share/generate")
async def generate_share_link(user=Depends(get_current_user)):
    """Create (or regenerate) a public share link for the authenticated user."""
    prev = await db.share_links.find_one({"user_id": user["id"]}, {"_id": 0})
    slug = secrets.token_hex(SLUG_BYTES)
    now = datetime.now(timezone.utc).isoformat()

    # Regenerar e "trocar o link", nao "repor as definicoes": preservamos o
    # ocultar-valores e a carteira escolhida. Repor hide_values a False aqui
    # (comportamento antigo) tornava publicos valores que o utilizador tinha
    # escondido, sem qualquer aviso.
    doc = {
        "user_id": user["id"],
        "slug": slug,
        "hide_values": bool((prev or {}).get("hide_values", False)),
        "wallet_id": (prev or {}).get("wallet_id") or None,
        "created_at": (prev or {}).get("created_at") or now,
        "updated_at": now,
    }

    await db.share_links.update_one(
        {"user_id": user["id"]},
        {"$set": doc},
        upsert=True,
    )
    # O slug antigo tem de deixar de responder de imediato.
    _invalidate_public_cache((prev or {}).get("slug") or "")
    return {"slug": slug, "hide_values": doc["hide_values"], "wallet_id": doc["wallet_id"]}


@router.get("/share/status")
async def share_status(user=Depends(get_current_user)):
    """Return the user's current share link, or null if none."""
    doc = await db.share_links.find_one({"user_id": user["id"]}, {"_id": 0})
    if not doc:
        return {"active": False}
    return {
        "active": True,
        "slug": doc["slug"],
        "hide_values": doc.get("hide_values", False),
        "wallet_id": doc.get("wallet_id") or None,
    }


@router.delete("/share")
async def revoke_share_link(user=Depends(get_current_user)):
    """Delete the user's share link."""
    doc = await db.share_links.find_one({"user_id": user["id"]}, {"slug": 1, "_id": 0})
    await db.share_links.delete_one({"user_id": user["id"]})
    _invalidate_public_cache((doc or {}).get("slug") or "")
    return {"ok": True}


@router.patch("/share/settings")
async def update_share_settings(body: ShareSettingsBody, user=Depends(get_current_user)):
    """Update the existing share link: hide_values and/or which wallet it shows."""
    link = await db.share_links.find_one({"user_id": user["id"]}, {"_id": 0})
    if not link:
        raise HTTPException(404, "No share link found. Generate one first.")

    sent = body.model_fields_set
    upd = {"updated_at": datetime.now(timezone.utc).isoformat()}

    if "hide_values" in sent and body.hide_values is not None:
        upd["hide_values"] = bool(body.hide_values)

    if "wallet_id" in sent:
        wid = (body.wallet_id or "").strip()
        if wid:
            # Confirmar a posse: sem isto, bastava enviar o id de uma
            # carteira de outra pessoa para a passar a servir no link.
            owned = await db.wallets.find_one({"id": wid, "user_id": user["id"]}, {"_id": 1})
            if not owned:
                raise HTTPException(404, "Wallet not found")
        upd["wallet_id"] = wid or None

    await db.share_links.update_one({"user_id": user["id"]}, {"$set": upd})
    _invalidate_public_cache(link.get("slug") or "")
    merged = {**link, **upd}
    return {
        "ok": True,
        "hide_values": merged.get("hide_values", False),
        "wallet_id": merged.get("wallet_id") or None,
    }


# ---------------------------------------------------------------------------
# Public read endpoint — no authentication required
# ---------------------------------------------------------------------------

@router.get("/p/{slug}/meta")
async def public_portfolio_meta(slug: str):
    """Nome do dono + lingua dele, para a Pages Function reescrever na edge
    o <title> e os og:* da pagina partilhada (3 ago 2026). Porque: o WhatsApp
    e os outros crawlers NAO correm JavaScript — leem as meta tags estaticas
    do index.html, que sao uma so (em ingles) para as 6 linguas. Ao servir
    /p/{slug}, a Function pergunta aqui a lingua DE QUEM PARTILHOU e reescreve
    o titulo/descricao nessa lingua — quem recebe o link ve a pre-visualizacao
    na lingua de quem lho mandou. Sem valores, sem email: nome + lingua.
    Cache com o MESMO prefixo do payload publico, para a revogacao/regeneracao
    (que faz _cache_clear_prefix do prefixo) matar as duas entradas de uma vez.
    """
    cache_key = _public_cache_key(slug) + ":meta"
    cached = _cache_get(cache_key, 300)
    if cached:
        return cached
    link = await db.share_links.find_one({"slug": slug}, {"_id": 0, "user_id": 1})
    if not link:
        raise HTTPException(404, "Portfolio not found or link has been revoked.")
    user = await db.users.find_one({"id": link["user_id"]}, {"name": 1, "_id": 0})
    prefs = await db.user_prefs.find_one(
        {"user_id": link["user_id"]}, {"_id": 0, "language": 1})
    result = {
        "display_name": (user or {}).get("name") or "Anonymous",
        "lang": (((prefs or {}).get("language")) or "en").lower()[:2],
    }
    _cache_set(cache_key, result)
    return result


@router.get("/p/{slug}")
async def public_portfolio(slug: str):
    """Return a sanitised, read-only portfolio snapshot for a share slug."""
    cache_key = _public_cache_key(slug)
    cached = _cache_get(cache_key, PUBLIC_CACHE_TTL)
    if cached:
        return cached

    link = await db.share_links.find_one({"slug": slug}, {"_id": 0})
    if not link:
        raise HTTPException(404, "Portfolio not found or link has been revoked.")

    user_id = link["user_id"]
    hide_values = link.get("hide_values", False)
    wallet_id = link.get("wallet_id") or None

    # Carteira especifica escolhida no painel de partilha. Se ela ja nao
    # existir (foi apagada depois de partilhada), respondemos 404 em vez de
    # cair para "todas": voltar silenciosamente a mostrar a carteira inteira
    # expunha mais do que o utilizador autorizou.
    wallet_name = None
    if wallet_id:
        w = await db.wallets.find_one(
            {"id": wallet_id, "user_id": user_id}, {"name": 1, "_id": 0})
        if not w:
            raise HTTPException(404, "Portfolio not found or link has been revoked.")
        wallet_name = w.get("name") or None

    # Fetch user display name (never expose email)
    user = await db.users.find_one({"id": user_id}, {"name": 1, "_id": 0})
    display_name = (user or {}).get("name") or "Anonymous"

    # Compute holdings from transactions
    txn_query = {"user_id": user_id}
    if wallet_id:
        txn_query["wallet_id"] = wallet_id
    txns = await db.transactions.find(txn_query, {"_id": 0}).to_list(5000)
    holdings = compute_holdings_from_txns(txns)
    holdings = [h for h in holdings if h.get("quantity", 0) > 0]

    # Agregar por ativo (3 ago 2026): compute_holdings_from_txns devolve uma
    # posicao POR CARTEIRA, e a pagina publica listava-as tal e qual — quem
    # tivesse BTC em duas carteiras aparecia com duas linhas "BTC" sem
    # etiqueta nenhuma, o que aos olhos de quem recebe o link parece um erro
    # (visto num link real partilhado por WhatsApp). A vista publica nao
    # mostra carteiras, por isso consolida-se: soma das quantidades e custo
    # medio ponderado. O nome fica o da primeira ocorrencia.
    _merged: dict = {}
    for h in holdings:
        key = (h["asset_type"], h["symbol"].upper(), (h.get("coingecko_id") or "").lower())
        m = _merged.get(key)
        if m is None:
            _merged[key] = dict(h)
        else:
            q_total = m["quantity"] + h["quantity"]
            cost_total = m["avg_cost_usd"] * m["quantity"] + h["avg_cost_usd"] * h["quantity"]
            m["quantity"] = q_total
            m["avg_cost_usd"] = (cost_total / q_total) if q_total > 0 else 0.0
    holdings = list(_merged.values())

    if not holdings:
        result = {
            "display_name": display_name,
            "wallet_name": wallet_name,
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
    # Correção (17 jul 2026): antes só juntava asset_type == "stock", mas o
    # loop de enriquecimento abaixo trata TODOS os não-crypto (etf/fundo/
    # obrigação/reit) via stock_prices. Como esses símbolos não iam a
    # get_stock_prices, ficavam com preço 0 → a página pública mostrava-os a
    # $0 e distorcia os pesos. Inclui todos os tipos de "equity" (mesma lista
    # que EQUITY_TYPES em routes/portfolio.py).
    stock_syms = [
        h["symbol"].upper() for h in holdings
        if h["asset_type"] in ("stock", "etf", "fund", "bond", "reit")
    ]

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
        "wallet_name": wallet_name,
        "hide_values": hide_values,
        "assets": sorted(enriched, key=lambda x: -(x["price_usd"] * x["quantity"])),
        "summary": summary,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    _cache_set(cache_key, result)
    return result

"""Broker connections — add, list, sync, delete.

Encryption:
  New connections use envelope encryption (v3): per-user AES-256-GCM key
  encrypted with a master key (see broker_connectors/crypto.py for the full
  v1/v2/v3 scheme history). Legacy v1/v2 connections are migrated to v3 on
  first sync after this change shipped.

Supported brokers:
  degiro, ibkr, trading212, binance, coinbase, kraken
"""
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel

from core import db, get_current_user, require_active_subscription, logger, _client_ip
from broker_connectors.crypto import (
    encrypt_for_user_v3, decrypt_for_user_v3,
    get_or_create_user_aes_key, migrate_conn_to_v3,
)
from broker_connectors import degiro, ibkr, trading212, binance, coinbase, kraken, ccxt_generic, xtb
from prices import get_fx_rates, resolve_asset_types_bulk

router = APIRouter()

BrokerType = Literal["degiro", "ibkr", "trading212", "binance", "coinbase", "kraken"]

# Crypto exchanges handled generically via ccxt (broker_connectors/ccxt_generic.py).
# Adding a new exchange = one entry here + one entry in the frontend broker list.
# key -> {candidate ccxt ids, needs a passphrase, display name}
CCXT_BROKERS: dict[str, dict] = {
    "bybit":     {"ids": ["bybit"],          "password": False, "name": "Bybit"},
    "okx":       {"ids": ["okx"],            "password": True,  "name": "OKX"},
    "kucoin":    {"ids": ["kucoin"],         "password": True,  "name": "KuCoin"},
    "bitget":    {"ids": ["bitget"],         "password": True,  "name": "Bitget"},
    "mexc":      {"ids": ["mexc", "mexc3"],  "password": False, "name": "MEXC"},
    "cryptocom": {"ids": ["cryptocom"],      "password": False, "name": "Crypto.com"},
    "gateio":    {"ids": ["gate", "gateio"], "password": False, "name": "Gate.io"},
    "htx":       {"ids": ["htx", "huobi"],   "password": False, "name": "HTX"},
}


# ---------------------------------------------------------------------------
# Error classification
# ---------------------------------------------------------------------------

def _classify_sync_error(raw: str, broker: str) -> str:
    """Turn raw exception messages into user-friendly, actionable strings."""
    r = raw.lower()

    # Authentication / credentials
    if any(k in r for k in ("401", "403", "unauthorized", "forbidden", "invalid key",
                             "invalid credentials", "authentication", "api key", "bad credentials",
                             "wrong credentials", "access denied", "permission denied")):
        return (
            f"Authentication failed for {broker.upper()}. "
            "Your API key may have expired or been revoked. "
            "Please reconnect with valid credentials."
        )

    # Rate limiting
    if any(k in r for k in ("429", "rate limit", "too many requests", "throttl")):
        return (
            f"{broker.upper()} rate limit reached. "
            "Wait a few minutes before syncing again."
        )

    # Network / timeout
    if any(k in r for k in ("timeout", "timed out", "connection refused",
                             "name or service not known", "network", "ssl")):
        return (
            f"Could not reach {broker.upper()}. "
            "Check your internet connection and try again."
        )

    # Broker-specific maintenance
    if any(k in r for k in ("maintenance", "unavailable", "503", "502", "down")):
        return (
            f"{broker.upper()} is temporarily unavailable. "
            "Please try again later."
        )

    # Empty / no data
    if any(k in r for k in ("no transactions", "empty", "no data")):
        return f"No transactions returned by {broker.upper()}."

    # Permissions missing
    if any(k in r for k in ("permission", "scope", "read")):
        return (
            f"{broker.upper()} returned a permissions error. "
            "Make sure your API key has read-only access to account history."
        )

    # Generic fallback — keep raw but trim
    trimmed = raw[:200] + ("…" if len(raw) > 200 else "")
    return f"Sync error: {trimmed}"


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class AddDegiro(BaseModel):
    username: str
    password: str
    label: str = "DEGIRO"

class AddIBKR(BaseModel):
    token: str
    query_id: str
    label: str = "Interactive Brokers"

class AddT212(BaseModel):
    api_key: str
    is_paper: bool = False
    label: str = "Trading 212"

class AddBinance(BaseModel):
    api_key: str
    api_secret: str
    label: str = "Binance"

class AddCoinbase(BaseModel):
    api_key: str
    api_secret: str
    passphrase: Optional[str] = ""
    label: str = "Coinbase"

class AddKraken(BaseModel):
    api_key: str
    api_secret: str
    label: str = "Kraken"

class AddCcxt(BaseModel):
    api_key: str
    api_secret: str
    passphrase: Optional[str] = ""
    label: str = ""

class AddXTB(BaseModel):
    user_id: str
    password: str
    is_demo: bool = False
    label: str = "XTB"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sanitise(conn: dict) -> dict:
    conn.pop("_id", None)
    conn.pop("credentials_enc", None)
    return conn


async def _usd_price(price: float, currency: str, fx_rates: dict) -> float:
    if currency == "USD":
        return price
    rate = fx_rates.get(currency)
    if rate and rate > 0:
        return price / rate
    return price


async def _import_transactions(
    user_id: str,
    wallet_id: str | None,
    transactions: list[dict],
    conn_id: str,
) -> tuple[int, list[str]]:
    fx_rates = await get_fx_rates()
    imported = 0
    errors = []

    # ETF/REIT (7 jul 2026) — DEGIRO/Trading212/IBKR gravam sempre
    # asset_type="stock" nas suas respostas (ver broker_connectors/*.py);
    # aqui reclassificamos em bloco, uma única vez por símbolo único desta
    # sincronização, via Yahoo Finance (resolve_asset_type). Não mexe nos
    # conectores em si — mais seguro do que alterar o parsing específico de
    # cada broker, que já está em produção com ligações reais.
    stock_symbols = [t["symbol"] for t in transactions if t.get("asset_type", "stock") == "stock" and t.get("symbol")]
    type_map = await resolve_asset_types_bulk(stock_symbols) if stock_symbols else {}

    for t in transactions:
        try:
            broker = t.get("_broker", "")
            broker_id = t.get("_broker_id", "")
            if broker and broker_id:
                existing = await db.transactions.find_one({
                    "user_id": user_id,
                    "_broker": broker,
                    "_broker_id": broker_id,
                })
                if existing:
                    continue

            price_usd = await _usd_price(t["price_usd"], t.get("price_currency", "USD"), fx_rates)
            fee_usd   = await _usd_price(t.get("fee", 0), t.get("fee_currency", "USD"), fx_rates)

            doc = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "wallet_id": wallet_id,
                "symbol": t["symbol"],
                "name": t.get("name") or t["symbol"],
                "asset_type": type_map.get(t["symbol"].upper(), t.get("asset_type", "stock")),
                "type": t["type"],
                "date": t["date"],
                "quantity": float(t["quantity"]),
                # Correção (16 jul 2026) — os consumidores de transações
                # (compute_holdings_from_txns em prices.py, _build_retro_history
                # em portfolio.py, get_analytics/get_tax_report em analytics.py,
                # etc.) leem SEMPRE t["price"], t.get("fee") e t.get("fx_to_usd")
                # — o mesmo formato das transações manuais. Antes, a importação
                # de corretora gravava só "price_usd"/"fee_usd" e NENHUM "price",
                # pelo que, após a 1ª sincronização, GET /portfolio, /holdings,
                # /history e /analytics rebentavam com KeyError: 'price' (HTTP
                # 500 permanente para esse utilizador). Como price_usd/fee_usd
                # já vêm convertidos para USD acima, gravamos "price"/"fee" com
                # currency="USD" e fx_to_usd=1.0 para o cálculo dar exatamente o
                # mesmo valor. Mantemos "price_usd"/"fee_usd" por compatibilidade.
                "price": price_usd,
                "fee": fee_usd,
                "currency": "USD",
                "fx_to_usd": 1.0,
                "price_usd": price_usd,
                "fee_usd": fee_usd,
                "notes": t.get("notes", ""),
                "_broker": broker,
                "_broker_id": broker_id,
                "_broker_conn_id": conn_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.transactions.insert_one(doc)
            imported += 1
        except Exception as e:
            errors.append(f"{t.get('symbol', '?')}: {e}")

    return imported, errors


async def _write_audit(
    user_id: str,
    conn_id: str,
    broker: str,
    status: str,
    imported: int = 0,
    errors: list | None = None,
    error_msg: str = "",
    ip: str = "",
) -> None:
    """Write a sync event to audit_logs and check for repeated failures."""
    now = datetime.now(timezone.utc).isoformat()
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "conn_id": conn_id,
        "broker": broker,
        "event": "sync",
        "status": status,
        "imported": imported,
        "errors": (errors or [])[:10],
        "error_msg": error_msg,
        "ip": ip,
        "timestamp": now,
    })

    if status == "error":
        # Count consecutive failures
        recent = await db.audit_logs.find(
            {"conn_id": conn_id, "event": "sync"},
            {"status": 1}
        ).sort("timestamp", -1).limit(3).to_list(3)

        consecutive_errors = all(r.get("status") == "error" for r in recent)

        if len(recent) == 3 and consecutive_errors:
            # Mark connection as suspicious
            await db.broker_connections.update_one(
                {"id": conn_id},
                {"$set": {"_suspicious": True, "_suspicious_at": now}},
            )
            # Send alert email
            try:
                user = await db.users.find_one({"id": user_id})
                conn = await db.broker_connections.find_one({"id": conn_id})
                if user and conn:
                    from email_utils import send_email
                    await send_email(
                        to=user["email"],
                        subject="⚠️ Wallet76 — Broker connection failing",
                        html=f"""
                        <p>Your <strong>{conn.get('label', broker)}</strong> connection has failed
                        3 times in a row.</p>
                        <p>This may mean your API key was revoked, expired, or compromised.</p>
                        <p><strong>Action required:</strong> go to Connected Accounts and review
                        or remove this connection. If you didn't revoke the key yourself, consider
                        regenerating it immediately on the broker's website.</p>
                        """,
                    )
                    logger.warning("Sent suspicious-key alert to %s for conn %s", user["email"], conn_id)
            except Exception as e:
                logger.error("Failed to send suspicious-key alert: %s", e)


async def _do_sync(conn_id: str, user_id: str, wallet_id: str | None, ip: str = "") -> dict:
    conn = await db.broker_connections.find_one({"id": conn_id, "user_id": user_id})
    if not conn:
        return {"error": "Connection not found"}

    broker = conn["broker"]
    enc_v = conn.get("_enc_v", 1)
    now = datetime.now(timezone.utc).isoformat()

    try:
        # Auto-migrate v1/v2 → v3 (real AES-256-GCM) on first sync after
        # this scheme shipped. Same lazy, opportunistic pattern the v1→v2
        # migration already used — see migrate_conn_to_v3's docstring.
        if enc_v != 3:
            new_creds = await migrate_conn_to_v3(conn, user_id)
            await db.broker_connections.update_one(
                {"id": conn_id},
                {"$set": {"credentials_enc": new_creds, "_enc_v": 3}},
            )
            conn["credentials_enc"] = new_creds
            enc_v = 3
            logger.info("Migrated connection %s to v3 (AES-256-GCM) encryption", conn_id)

        user_key = await get_or_create_user_aes_key(user_id)
        creds_enc = conn["credentials_enc"]

        def dec(field: str) -> str:
            return decrypt_for_user_v3(creds_enc[field], user_key)

        if broker == "degiro":
            txns = await degiro.fetch_transactions(
                dec("username"), dec("password"),
                from_date=conn.get("last_synced_at", "2015-01-01")[:10],
            )
        elif broker == "ibkr":
            # query_id isn't secret — add_ibkr stores it plaintext as
            # query_id_plain on the connection doc itself, not inside
            # credentials_enc (nothing to decrypt here, unlike "token").
            txns = await ibkr.fetch_transactions(dec("token"), conn.get("query_id_plain", ""))
        elif broker == "trading212":
            txns = await trading212.fetch_transactions(dec("api_key"), conn.get("is_paper", False))
        elif broker == "binance":
            txns = await binance.fetch_transactions(dec("api_key"), dec("api_secret"))
        elif broker == "coinbase":
            pp = dec("passphrase") if creds_enc.get("passphrase") else ""
            txns = await coinbase.fetch_transactions(dec("api_key"), dec("api_secret"), pp)
        elif broker == "kraken":
            txns = await kraken.fetch_transactions(dec("api_key"), dec("api_secret"))
        elif broker == "xtb":
            txns = await xtb.fetch_transactions(dec("user_id"), dec("password"), conn.get("is_demo", False))
        elif broker in CCXT_BROKERS:
            spec = CCXT_BROKERS[broker]
            pw = dec("passphrase") if creds_enc.get("passphrase") else None
            txns = await ccxt_generic.fetch_transactions(
                spec["ids"], dec("api_key"), dec("api_secret"), pw,
            )
        else:
            return {"error": f"Unknown broker: {broker}"}

        imported, errors = await _import_transactions(user_id, wallet_id, txns, conn_id)

        await db.broker_connections.update_one(
            {"id": conn_id},
            {"$set": {
                "last_synced_at": now,
                "last_imported": imported,
                "last_error": None,
                "_suspicious": False,
            }},
        )
        await _write_audit(user_id, conn_id, broker, "success", imported, errors, ip=ip)
        logger.info("Broker sync %s/%s: %d imported, %d errors", broker, conn_id, imported, len(errors))
        return {"imported": imported, "errors": errors}

    except Exception as e:
        err_msg = _classify_sync_error(str(e), broker)
        await db.broker_connections.update_one(
            {"id": conn_id},
            {"$set": {"last_error": err_msg, "last_synced_at": now}},
        )
        await _write_audit(user_id, conn_id, broker, "error", error_msg=err_msg, ip=ip)
        logger.error("Broker sync %s/%s failed: %s", broker, conn_id, e)
        return {"error": err_msg}


async def _add_conn(user_id: str, broker: str, label: str, raw_creds: dict, extra: dict | None = None) -> dict:
    """Create a new broker connection using v3 (AES-256-GCM) envelope encryption."""
    user_key = await get_or_create_user_aes_key(user_id)
    creds_enc = {k: encrypt_for_user_v3(v, user_key) for k, v in raw_creds.items() if v}
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "broker": broker,
        "label": label or broker,
        "credentials_enc": creds_enc,
        "_enc_v": 3,
        "_suspicious": False,
        "last_synced_at": None,
        "last_imported": 0,
        "last_error": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        **(extra or {}),
    }
    await db.broker_connections.insert_one(doc)
    doc.pop("_id", None)
    return _sanitise(doc)


# ---------------------------------------------------------------------------
# Routes — list / delete / sync
# ---------------------------------------------------------------------------

@router.get("/brokers")
async def list_connections(user=Depends(get_current_user)):
    conns = await db.broker_connections.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return [_sanitise(c) for c in conns]


@router.get("/brokers/audit")
async def list_audit(user=Depends(get_current_user)):
    """Last 50 sync events for the current user.

    audit_logs now also holds auth events (login/password-reset, written by
    write_auth_audit in core.py) sharing this same collection — filter to
    event="sync" explicitly so this broker-connections view doesn't mix in
    unrelated login rows (which lack conn_id/broker/status fields the
    frontend expects here)."""
    logs = await db.audit_logs.find(
        {"user_id": user["id"], "event": "sync"}, {"_id": 0}
    ).sort("timestamp", -1).to_list(50)
    return logs


@router.post("/brokers/{conn_id}/sync")
async def sync_connection(
    conn_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
    wallet_id: str | None = None,
    user=Depends(require_active_subscription),
):
    conn = await db.broker_connections.find_one({"id": conn_id, "user_id": user["id"]})
    if not conn:
        raise HTTPException(404, "Connection not found")
    if wallet_id:
        wallet = await db.wallets.find_one({"id": wallet_id, "user_id": user["id"]})
        if not wallet:
            raise HTTPException(404, "Wallet not found")
    ip = _client_ip(request)
    background_tasks.add_task(_do_sync, conn_id, user["id"], wallet_id, ip)
    return {"ok": True, "message": "Sync started in background"}


@router.delete("/brokers/{conn_id}")
async def delete_connection(conn_id: str, user=Depends(get_current_user)):
    res = await db.broker_connections.delete_one({"id": conn_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Connection not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Routes — add brokers (all use v3 encryption via _add_conn)
# ---------------------------------------------------------------------------

@router.post("/brokers/degiro")
async def add_degiro(payload: AddDegiro, user=Depends(require_active_subscription)):
    valid = await degiro.validate_credentials(payload.username, payload.password)
    if not valid:
        raise HTTPException(400, "Invalid DEGIRO credentials.")
    return await _add_conn(user["id"], "degiro", payload.label,
                           {"username": payload.username, "password": payload.password})


@router.post("/brokers/ibkr")
async def add_ibkr(payload: AddIBKR, user=Depends(require_active_subscription)):
    valid = await ibkr.validate_credentials(payload.token, payload.query_id)
    if not valid:
        raise HTTPException(400, "Could not connect to Interactive Brokers.")
    # query_id is not secret — store plaintext alongside encrypted token
    return await _add_conn(user["id"], "ibkr", payload.label,
                           {"token": payload.token},
                           extra={"query_id_plain": payload.query_id})


@router.post("/brokers/trading212")
async def add_trading212(payload: AddT212, user=Depends(require_active_subscription)):
    valid = await trading212.validate_credentials(payload.api_key, payload.is_paper)
    if not valid:
        raise HTTPException(400, "Invalid Trading 212 API key.")
    return await _add_conn(user["id"], "trading212", payload.label,
                           {"api_key": payload.api_key},
                           extra={"is_paper": payload.is_paper})


@router.post("/brokers/binance")
async def add_binance(payload: AddBinance, user=Depends(require_active_subscription)):
    valid = await binance.validate_credentials(payload.api_key, payload.api_secret)
    if not valid:
        raise HTTPException(400, "Invalid Binance API key or secret. Enable 'Read Info' permission only.")
    return await _add_conn(user["id"], "binance", payload.label,
                           {"api_key": payload.api_key, "api_secret": payload.api_secret})


@router.post("/brokers/coinbase")
async def add_coinbase(payload: AddCoinbase, user=Depends(require_active_subscription)):
    valid = await coinbase.validate_credentials(payload.api_key, payload.api_secret, payload.passphrase or "")
    if not valid:
        raise HTTPException(400, "Invalid Coinbase credentials.")
    raw = {"api_key": payload.api_key, "api_secret": payload.api_secret}
    if payload.passphrase:
        raw["passphrase"] = payload.passphrase
    return await _add_conn(user["id"], "coinbase", payload.label, raw)


@router.post("/brokers/kraken")
async def add_kraken(payload: AddKraken, user=Depends(require_active_subscription)):
    valid = await kraken.validate_credentials(payload.api_key, payload.api_secret)
    if not valid:
        raise HTTPException(400, "Invalid Kraken API key or secret. Needs 'Query Funds' + 'Query Trades' permissions.")
    return await _add_conn(user["id"], "kraken", payload.label,
                           {"api_key": payload.api_key, "api_secret": payload.api_secret})


@router.post("/brokers/ccxt/{exchange_key}")
async def add_ccxt_exchange(exchange_key: str, payload: AddCcxt, user=Depends(require_active_subscription)):
    """Generic add-endpoint for any ccxt-supported crypto exchange in CCXT_BROKERS."""
    spec = CCXT_BROKERS.get(exchange_key)
    if not spec:
        raise HTTPException(404, f"Unsupported exchange: {exchange_key}")
    pw = payload.passphrase or None
    if spec["password"] and not pw:
        raise HTTPException(400, f"{spec['name']} requires an API passphrase.")
    try:
        err = await ccxt_generic.validate_credentials(spec["ids"], payload.api_key, payload.api_secret, pw)
    except Exception as e:
        # Erro técnico (ex.: ccxt em falta no servidor, rede) — mensagem clara.
        raise HTTPException(400, f"Could not connect to {spec['name']}: {str(e)[:160]}")
    if err:
        # Mensagem REAL da exchange (código de erro, IP, permissões, relógio…).
        raise HTTPException(400, f"{spec['name']}: {err}")
    raw = {"api_key": payload.api_key, "api_secret": payload.api_secret}
    if pw:
        raw["passphrase"] = pw
    return await _add_conn(user["id"], exchange_key, payload.label or spec["name"], raw)


@router.post("/brokers/xtb")
async def add_xtb(payload: AddXTB, user=Depends(require_active_subscription)):
    """XTB (xStation API) — SÓ LEITURA. Autentica com userId + password; nunca
    envia ordens. Ver broker_connectors/xtb.py."""
    valid = await xtb.validate_credentials(payload.user_id, payload.password, payload.is_demo)
    if not valid:
        raise HTTPException(400, "Could not connect to XTB. Check your account number and xStation password.")
    return await _add_conn(user["id"], "xtb", payload.label,
                           {"user_id": payload.user_id, "password": payload.password},
                           extra={"is_demo": payload.is_demo})

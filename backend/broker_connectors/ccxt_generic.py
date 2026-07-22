"""Generic crypto-exchange connector (via ccxt).

Instead of hand-rolling request signing for every exchange, this module
delegates auth + trade-history normalization to ccxt, which already
implements (and maintains) the signing scheme for dozens of exchanges.

Add a new exchange by adding an entry to CCXT_BROKERS in routes/brokers.py
— no code here needs to change. Each entry supplies one or more candidate
ccxt exchange ids (ccxt occasionally renames ids, e.g. gateio -> gate), and
whether the exchange also needs a passphrase/password.

ccxt is imported lazily inside the functions so that merely importing this
module never crashes the app if the dependency isn't installed yet (it is
declared in requirements.txt and installed on deploy).

Credentials stored (encrypted): api_key + api_secret (+ passphrase when the
exchange requires one, e.g. OKX / KuCoin / Bitget).
"""
from datetime import date

# Quote assets we try, per held base asset, to discover trade pairs.
QUOTES = ["USDT", "USDC", "USD", "BTC", "ETH", "EUR"]

# Assets we don't treat as a "base" to look up (no point fetching e.g.
# USDT/USDT). Fiat + common stablecoins.
STABLES = {
    "USDT", "USDC", "USD", "EUR", "GBP", "CHF", "JPY", "BRL",
    "DAI", "TUSD", "FDUSD", "BUSD", "USDP", "PYUSD",
}


class CcxtError(Exception):
    pass


def _resolve_class(candidate_ids):
    """Return the first ccxt.async_support exchange class that exists."""
    import ccxt.async_support as ccxt  # lazy — see module docstring
    for eid in candidate_ids:
        if hasattr(ccxt, eid):
            return getattr(ccxt, eid), eid
    raise CcxtError(f"No ccxt exchange found for ids {candidate_ids}")


def _make_client(candidate_ids, api_key, api_secret, password=None):
    klass, eid = _resolve_class(candidate_ids)
    cfg = {"apiKey": api_key, "secret": api_secret, "enableRateLimit": True}
    if password:
        cfg["password"] = password
    return klass(cfg), eid


async def validate_credentials(candidate_ids, api_key, api_secret, password=None) -> bool:
    """Return True if the read-only credentials authenticate."""
    client, _eid = _make_client(candidate_ids, api_key, api_secret, password)
    try:
        await client.fetch_balance()
        return True
    except Exception:
        return False
    finally:
        try:
            await client.close()
        except Exception:
            pass


def _map_trade(tr: dict, base: str, quote: str, btc_usd: float, eid: str) -> dict | None:
    amount = abs(float(tr.get("amount") or 0))
    price = abs(float(tr.get("price") or 0))
    if amount == 0 or price == 0:
        return None

    side = (tr.get("side") or "buy").upper()
    ts = tr.get("timestamp")
    d = date.fromtimestamp(ts / 1000).isoformat() if ts else date.today().isoformat()

    if quote in ("USDT", "USDC", "USD"):
        price_usd = price
    elif quote == "BTC":
        price_usd = price * btc_usd
    else:
        price_usd = price  # best effort (e.g. ETH/EUR pairs)

    fee = tr.get("fee") or {}
    fee_cost = abs(float(fee.get("cost") or 0)) if fee else 0.0
    fee_cur = (fee.get("currency") or "") if fee else ""
    fee_usd = fee_cost if fee_cur in ("USDT", "USDC", "USD") else 0.0

    tid = tr.get("id") or tr.get("order") or ""
    return {
        "symbol": base.upper(),
        "name": base.upper(),
        "asset_type": "crypto",
        "type": "BUY" if side == "BUY" else "SELL",
        "date": d,
        "quantity": amount,
        "price_usd": price_usd,
        "price_currency": "USD",
        "fee": fee_usd,
        "fee_currency": "USD",
        "notes": f"{eid} import · {tr.get('symbol', '')} · ID {tid}",
        "_broker_id": f"{eid}_{tr.get('symbol', '')}_{tid}",
        "_broker": eid,
    }


async def fetch_transactions(candidate_ids, api_key, api_secret, password=None) -> list[dict]:
    """Fetch spot trade history from any ccxt-supported exchange.

    Strategy mirrors the Binance connector: read current balances to learn
    which assets are held, then pull trade history for each asset against the
    common quote currencies that the exchange actually lists.
    """
    client, eid = _make_client(candidate_ids, api_key, api_secret, password)
    results: list[dict] = []
    try:
        if not client.has.get("fetchMyTrades"):
            raise CcxtError(f"{eid} does not expose trade history via API")

        await client.load_markets()

        balance = await client.fetch_balance()
        totals = balance.get("total") or {}
        held = {
            c for c, amt in totals.items()
            if amt and float(amt) > 0 and c.upper() not in STABLES
        }

        # BTC/USD reference for BTC-quoted pairs
        btc_usd = 50000.0
        for ref in ("BTC/USDT", "BTC/USD", "BTC/USDC"):
            if ref in client.markets:
                try:
                    tk = await client.fetch_ticker(ref)
                    if tk and tk.get("last"):
                        btc_usd = float(tk["last"])
                        break
                except Exception:
                    continue

        for base in sorted(held):
            for quote in QUOTES:
                symbol = f"{base}/{quote}"
                if symbol not in client.markets:
                    continue
                try:
                    trades = await client.fetch_my_trades(symbol, limit=1000)
                except Exception:
                    continue
                for tr in trades:
                    m = _map_trade(tr, base, quote, btc_usd, eid)
                    if m:
                        results.append(m)
    finally:
        try:
            await client.close()
        except Exception:
            pass

    return results

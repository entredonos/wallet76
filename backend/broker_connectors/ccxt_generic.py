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


def _ccxt():
    try:
        import ccxt.async_support as ccxt  # lazy — see module docstring
        return ccxt
    except ImportError as e:
        raise CcxtError("ccxt library is not installed on the server") from e


def _resolve_class(candidate_ids):
    """Return the first ccxt.async_support exchange class that exists."""
    ccxt = _ccxt()
    for eid in candidate_ids:
        if hasattr(ccxt, eid):
            return getattr(ccxt, eid), eid
    raise CcxtError(f"No ccxt exchange found for ids {candidate_ids}")


async def _try_balance(client):
    """fetch_balance tolerante ao tipo de conta.

    Algumas exchanges (sobretudo a Bybit, com conta UNIFIED/UTA) rejeitam o
    fetch_balance por omissão e exigem o tipo de conta certo. Tentamos os
    tipos comuns por ordem; um erro de AUTENTICAÇÃO é reenviado de imediato
    (chave inválida de facto), os restantes fazem avançar para o tipo
    seguinte, para não rejeitar uma chave válida só por causa do tipo de
    conta.
    """
    ccxt = _ccxt()
    # Junta TODAS as contas distintas da exchange — o saldo pode estar em
    # qualquer uma (unified, spot, funding, trading, main, margin, earn,
    # contract…), e o utilizador não tem de saber onde. Deduplicamos por
    # assinatura do resultado, para não somar duas vezes quando um tipo é
    # alias de outro (ex.: {} == unified na Bybit; main == funding na KuCoin).
    account_params = (
        {},
        {"type": "unified"},
        {"type": "funding"},
        {"type": "spot"},
        {"type": "trading"},
        {"type": "main"},
        {"type": "margin"},
        {"type": "earn"},
        {"type": "contract"},
        {"type": "swap"},
    )
    merged = {}
    seen_sigs = set()
    ok = False
    auth_err = None
    for params in account_params:
        try:
            bal = await client.fetch_balance(params)
        except ccxt.AuthenticationError as e:
            auth_err = e
            continue
        except Exception:
            continue
        ok = True
        clean = {}
        for cur, amt in (bal.get("total") or {}).items():
            try:
                a = float(amt or 0)
            except (TypeError, ValueError):
                a = 0
            if a > 0:
                clean[cur] = a
        if not clean:
            continue
        sig = frozenset((cur, round(a, 8)) for cur, a in clean.items())
        if sig in seen_sigs:
            continue  # conta repetida (alias) — já contada
        seen_sigs.add(sig)
        for cur, a in clean.items():
            merged[cur] = merged.get(cur, 0) + a
    if not ok:
        if auth_err is not None:
            raise auth_err
        raise CcxtError("fetch_balance failed for all account types")
    return {"total": merged}


def _make_client(candidate_ids, api_key, api_secret, password=None):
    klass, eid = _resolve_class(candidate_ids)
    cfg = {
        "apiKey": api_key,
        "secret": api_secret,
        "enableRateLimit": True,
        # recvWindow maior + ajuste de relógio: a Bybit (e outras) recusam a
        # assinatura se o timestamp do servidor divergir alguns segundos.
        "options": {"recvWindow": 15000, "adjustForTimeDifference": True},
    }
    if password:
        cfg["password"] = password
    return klass(cfg), eid


def _short(e) -> str:
    msg = str(e).strip().replace("\n", " ")
    return (msg[:180] + "…") if len(msg) > 180 else (msg or "erro desconhecido")


async def _sync_clock(client):
    try:
        if getattr(client, "load_time_difference", None):
            await client.load_time_difference()
    except Exception:
        pass


# Pistas de que um erro (mesmo não tipado como AuthenticationError pela ccxt)
# é afinal um problema de credenciais/permissões/IP — para rejeitar já ao
# ligar, em vez de criar uma ligação que nunca sincroniza. Inclui códigos de
# erro da Bybit (10003 chave inválida, 10004 assinatura, 10005 permissão,
# 33004 chave expirada).
_AUTH_HINTS = (
    "auth", "sign", "signature", "api key", "apikey", "api-key",
    "permission", "invalid key", "unauthorized", "forbidden",
    "expired", "revoked", "ip address", "ip white", "not whitelist",
    "10003", "10004", "10005", "33004", "invalid api",
)


async def validate_credentials(candidate_ids, api_key, api_secret, password=None) -> str:
    """Devolve "" se a chave é válida, ou a MENSAGEM REAL do erro (da exchange)
    para o utilizador perceber a causa (chave, assinatura, IP, permissões,
    relógio). Só um erro claramente não-auth (ex.: tipo de conta que não
    usamos) é tratado como válido — a sincronização trata do resto.
    """
    ccxt = _ccxt()
    client, _eid = _make_client(candidate_ids, api_key, api_secret, password)
    try:
        await _sync_clock(client)
        try:
            await _try_balance(client)
            return ""
        except ccxt.AuthenticationError as e:
            return _short(e)
        except Exception as e:
            if any(h in str(e).lower() for h in _AUTH_HINTS):
                return _short(e)
            return ""
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
        await _sync_clock(client)
        if not client.has.get("fetchMyTrades"):
            raise CcxtError(f"{eid} does not expose trade history via API")

        await client.load_markets()

        balance = await _try_balance(client)
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

        traded = set()
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
                        traded.add(base)

        # Holdings SEM histórico de trades (moedas depositadas/transferidas,
        # não compradas nesta exchange): sem isto, a carteira ficava a $0
        # mesmo tendo saldo. Criamos uma posição a partir do saldo ATUAL, ao
        # preço atual, para o ativo aparecer. Fica marcado nas notas.
        # Nota: usa um _broker_id fixo por ativo (dedup) — na 1ª sincronização
        # regista o saldo; se o saldo mudar depois, corrige-se à mão (o
        # histórico real de trades, quando existe, tem sempre prioridade).
        # Todos os ativos com saldo que NÃO tiveram trades reais — inclui
        # stablecoins (USDT, USDC…), que valem ~1 USD e são muitas vezes a
        # maior fatia do saldo (antes eram ignoradas, dando carteira a 0).
        _USD_STABLES = {"USDT", "USDC", "USD", "DAI", "TUSD", "FDUSD", "BUSD", "USDP", "PYUSD"}
        _FIAT = {"EUR", "GBP", "CHF", "JPY", "BRL", "CAD", "AUD"}
        all_bal = {}
        for cur, amt0 in totals.items():
            try:
                a = float(amt0 or 0)
            except (TypeError, ValueError):
                a = 0
            if a > 0:
                all_bal[cur] = a
        for base in sorted(set(all_bal) - traded):
            amt = all_bal.get(base, 0)
            if amt <= 0:
                continue
            b = base.upper()
            if b in _USD_STABLES:
                # Stablecoin -> CAIXA (liquidez), valorizada ao par (1 USD).
                asset_type, price_usd, price_cur = "cash", 1.0, "USD"
            elif b in _FIAT:
                # Fiat na exchange -> CAIXA na sua moeda (o portfólio converte
                # via FX; price_usd=1 na própria moeda vira o valor em USD).
                asset_type, price_usd, price_cur = "cash", 1.0, b
            else:
                # Cripto real -> preço de mercado.
                asset_type, price_cur = "crypto", "USD"
                price_usd = None
                for quote in ("USDT", "USDC", "USD"):
                    sym = f"{base}/{quote}"
                    if sym in client.markets:
                        try:
                            tk = await client.fetch_ticker(sym)
                            if tk and tk.get("last"):
                                price_usd = float(tk["last"])
                                break
                        except Exception:
                            continue
                if not price_usd or price_usd <= 0:
                    sym = f"{base}/BTC"
                    if sym in client.markets:
                        try:
                            tk = await client.fetch_ticker(sym)
                            if tk and tk.get("last"):
                                price_usd = float(tk["last"]) * btc_usd
                        except Exception:
                            price_usd = None
                if not price_usd or price_usd <= 0:
                    continue  # sem cotação -> não importa (evita valor $0)
            results.append({
                "symbol": b,
                "name": b,
                "asset_type": asset_type,
                "type": "BUY",
                "date": date.today().isoformat(),
                "quantity": amt,
                "price_usd": price_usd,
                "price_currency": price_cur,
                "currency": price_cur,
                "fee": 0.0,
                "fee_currency": "USD",
                "notes": f"{eid} saldo atual (sem historico de trades)",
                "_broker_id": f"{eid}_balance_{base}",
                "_broker": eid,
            })
    finally:
        try:
            await client.close()
        except Exception:
            pass

    return results

"""Price fetching helpers (CoinGecko, yfinance, FX) and holding computation."""
import asyncio
import os
import re as _re
from typing import List

import httpx
import yfinance as yf

from core import _cache_get, _cache_set, _cache_get_stale, logger, db


# --- Crypto prices ---
async def get_crypto_prices(coingecko_ids: List[str], symbol_map: dict | None = None) -> dict:
    """Returns dict { coingecko_id: { usd, eur, usd_24h_change, eur_24h_change } }.

    Cached PER SYMBOL (not per combined request), and shared across every
    user — not scoped to a single user's request. The old version cached by
    the exact joined id-list ("crypto:bitcoin,ethereum"), so two users with
    almost-identical holdings (both own BTC/ETH, one also owns SOL) each
    triggered their own separate CoinGecko call for the SAME BTC/ETH prices
    within the same 60s window, instead of the second user's request
    reusing what the first one just fetched. Now each id has its own cache
    entry, so only the ids NOT already cached actually hit CoinGecko."""
    if not coingecko_ids:
        return {}
    ids = sorted(set(coingecko_ids))

    result = {}
    missing = []
    for cid in ids:
        cached = _cache_get(f"crypto_price:{cid}", ttl=60)
        if cached is not None:
            result[cid] = cached
        else:
            missing.append(cid)

    if not missing:
        return result

    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {
        "ids": ",".join(missing),
        "vs_currencies": "usd,eur",
        "include_24hr_change": "true",
    }
    # Chave demo gratuita da CoinGecko (30 req/min dedicados em vez do limite
    # partilhado por IP, que IPs de cloud como o Render apanham quase sempre em
    # 429). Definir COINGECKO_API_KEY no ambiente ativa-a; sem ela funciona
    # como antes.
    _cg_key = os.environ.get("COINGECKO_API_KEY", "").strip()
    headers = {"x-cg-demo-api-key": _cg_key} if _cg_key else {}
    try:
        async with httpx.AsyncClient(timeout=15) as client_http:
            r = await client_http.get(url, params=params, headers=headers)
            r.raise_for_status()
            data = r.json()
            for cid, val in data.items():
                _cache_set(f"crypto_price:{cid}", val)
                result[cid] = val
    except Exception as e:
        logger.error(f"CoinGecko error: {e}")

    # 15 jul 2026 — qualquer id que continue sem preço aqui (CoinGecko caiu
    # de vez, ou simplesmente não devolveu esse id na resposta, ex.:
    # rate-limit parcial) ficava com price_usd=0 no /portfolio (ver
    # _price_holdings em routes/portfolio.py), o que faz esse ativo aparecer
    # a -100% de PnL — um crash de preço falso, não um crash real. Cai para o
    # último preço conhecido (mesmo expirado) em vez de deixar o chamador
    # tratar "sem preço" como preço zero. Mesma técnica já usada em
    # _fetch_movers_crypto (routes/market.py).
    for cid in missing:
        if cid in result:
            continue
        stale = _cache_get_stale(f"crypto_price:{cid}")
        if stale is not None:
            result[cid] = stale

    # Fallback independente (17 jul 2026): se a CoinGecko falhou e nao ha valor
    # em cache (ex.: cache fria logo apos deploy + rate-limit), tenta a yfinance
    # com o ticker "SIMBOLO-USD". So corre para ids ainda sem preco e apenas se
    # o chamador deu o mapa id->simbolo (alertas). Evita que "sem preco" cale os
    # alertas por completo.
    still_missing = {cid: (symbol_map or {}).get(cid) for cid in missing if cid not in result}
    yf_syms = {f"{s.upper()}-USD": cid for cid, s in still_missing.items() if s}
    if yf_syms:
        try:
            yf_data = await asyncio.to_thread(_yf_fetch, list(yf_syms.keys()))
            for yfsym, val in yf_data.items():
                cid = yf_syms.get(yfsym)
                if cid and val.get("usd"):
                    entry = {"usd": val["usd"], "usd_24h_change": val.get("change_pct", 0)}
                    _cache_set(f"crypto_price:{cid}", entry)
                    result[cid] = entry
        except Exception as e:
            logger.warning(f"yfinance crypto fallback error: {e}")
    return result


# --- Stock prices (yfinance) ---
def _yf_fetch(symbols: List[str]) -> dict:
    """Sync yfinance fetch (run in thread). Returns { symbol: { usd, prev_close, change_pct } }"""
    out = {}
    if not symbols:
        return out
    try:
        tickers = yf.Tickers(" ".join(symbols))
        for sym in symbols:
            try:
                t = tickers.tickers.get(sym) or yf.Ticker(sym)
                fast = getattr(t, "fast_info", None) or {}
                price = None
                prev = None
                try:
                    price = float(fast.get("last_price") or fast.get("lastPrice") or 0) or None
                    prev = float(fast.get("previous_close") or fast.get("previousClose") or 0) or None
                except Exception:
                    pass
                if not price:
                    hist = t.history(period="2d")
                    if not hist.empty:
                        price = float(hist["Close"].iloc[-1])
                        if len(hist) >= 2:
                            prev = float(hist["Close"].iloc[-2])
                if price:
                    change_pct = ((price - prev) / prev * 100) if prev else 0
                    out[sym] = {"usd": price, "prev_close": prev or price, "change_pct": change_pct}
            except Exception as e:
                logger.warning(f"yfinance {sym} error: {e}")
    except Exception as e:
        logger.error(f"yfinance batch error: {e}")
    return out


async def get_stock_prices(symbols: List[str]) -> dict:
    """Same shared per-symbol caching as get_crypto_prices above — each
    symbol has its own cache entry so a second user requesting a stock
    already fetched (for anyone) in the last 120s reuses it instead of
    triggering another yfinance batch call for it. Still batches whatever's
    actually missing into a single yfinance call (batching per request is
    still cheaper than one call per symbol when there IS a real cache miss)."""
    if not symbols:
        return {}
    syms = sorted(set([s.upper() for s in symbols]))

    result = {}
    missing = []
    for sym in syms:
        cached = _cache_get(f"stock_price:{sym}", ttl=120)
        if cached is not None:
            result[sym] = cached
        else:
            missing.append(sym)

    if not missing:
        return result

    data = await asyncio.to_thread(_yf_fetch, missing)
    for sym, val in data.items():
        _cache_set(f"stock_price:{sym}", val)
    result.update(data)

    # Resolve unknown symbols via Yahoo Search
    unresolved = [s for s in missing if s not in result or not result[s].get("usd")]
    if unresolved:
        def _variants(s: str):
            cleaned = _re.sub(r"[^a-zA-Z0-9]", "", s).lower()
            yield s
            if cleaned and cleaned != s.lower():
                yield cleaned
            m = _re.match(r"^3d(.+)$", cleaned)
            if m:
                yield f"{m.group(1)} 3d"
                yield f"{m.group(1)}3d"
            m = _re.match(r"^(.+)3d$", cleaned)
            if m:
                yield f"3d{m.group(1)}"
                yield f"3d {m.group(1)}"

        async def _resolve(sym: str):
            cache_key_r = f"resolve:{sym.lower()}"
            cached_r = _cache_get(cache_key_r, ttl=86400)
            if cached_r is not None:
                return sym, cached_r or None
            for term in _variants(sym):
                try:
                    async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "Mozilla/5.0"}) as ch:
                        r = await ch.get(
                            "https://query2.finance.yahoo.com/v1/finance/search",
                            params={"q": term, "quotesCount": 5, "newsCount": 0},
                        )
                        if r.status_code != 200:
                            continue
                        for q in r.json().get("quotes", []):
                            qt = (q.get("quoteType") or "").upper()
                            if qt in ("EQUITY", "ETF") and q.get("symbol"):
                                resolved = q["symbol"]
                                _cache_set(cache_key_r, resolved)
                                return sym, resolved
                except Exception as e:
                    logger.warning(f"resolve {sym}/{term} err: {e}")
            _cache_set(cache_key_r, "")
            return sym, None

        resolutions = await asyncio.gather(*[_resolve(s) for s in unresolved])
        resolved_pairs = [(o, r) for o, r in resolutions if r and r != o]
        if resolved_pairs:
            new_syms = [r for _, r in resolved_pairs]
            resolved_data = await asyncio.to_thread(_yf_fetch, new_syms)
            for orig, real in resolved_pairs:
                if real in resolved_data and resolved_data[real].get("usd"):
                    result[orig] = resolved_data[real]
                    _cache_set(f"stock_price:{orig}", resolved_data[real])

    # 15 jul 2026 — mesmo fallback do get_crypto_prices acima: um símbolo que
    # continue sem preço aqui (yfinance em baixo/rate-limited e a resolução
    # via Yahoo Search também falhou) virava price_usd=0 no /portfolio,
    # mostrando -100% de PnL nesse ativo/carteira em vez de manter o último
    # valor conhecido enquanto a fonte de preços recupera.
    for sym in missing:
        if sym in result and result[sym].get("usd"):
            continue
        stale = _cache_get_stale(f"stock_price:{sym}")
        if stale is not None:
            result[sym] = stale
    return result


# --- FX rates ---
async def get_fx_rates() -> dict:
    """Returns per-USD rates for every currency the app accepts, e.g.
    { 'USD': 1.0, 'EUR': eur_per_usd, 'GBP': ..., 'CHF': ..., 'JPY': ...,
      'BRL': ..., 'CAD': ..., 'AUD': ... }."""
    cached = _cache_get("fx:rates", ttl=600)
    if cached:
        return cached
    # Correção (16 jul 2026) — TransactionCreate aceita USD/EUR/GBP/CHF/JPY/BRL/
    # CAD/AUD (ver models.py), mas esta função só devolvia EUR/CHF/BRL. Para as
    # restantes, `fx_rates.get(currency, 1.0)` caía no fallback 1.0 e a moeda
    # era tratada 1:1 com o USD — uma compra em JPY ficava ~150x sobreavaliada,
    # GBP/CAD/AUD ~30-50% erradas. Agora buscamos e devolvemos todas. Os valores
    # abaixo são só fallback para quando a API falha; a chamada ao vivo sobrepõe.
    rates = {
        "USD": 1.0, "EUR": 0.92, "GBP": 0.79, "CHF": 0.88,
        "JPY": 155.0, "BRL": 5.0, "CAD": 1.37, "AUD": 1.52,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as ch:
            r = await ch.get("https://open.er-api.com/v6/latest/USD")
            if r.status_code == 200:
                data = r.json().get("rates", {})
                for c in ("EUR", "GBP", "CHF", "JPY", "BRL", "CAD", "AUD"):
                    if data.get(c):
                        rates[c] = float(data[c])
    except Exception as e:
        logger.warning(f"FX rate fetch failed, using defaults: {e}")
    _cache_set("fx:rates", rates)
    return rates


async def get_eur_usd_rate() -> float:
    rates = await get_fx_rates()
    return rates.get("EUR", 0.92)


# --- Asset sub-type resolution (ETF / fund / REIT) ---
# (7 jul 2026) — DEGIRO, Trading212 e IBKR gravam sempre asset_type="stock"
# nas sincronizações (não distinguem ETF, e IBKR tinha um bug de copy-paste
# que tornava o "if" sempre "stock"). REIT nunca existiu em lado nenhum: o
# Yahoo Finance classifica REITs como EQUITY normal (quoteType), só dá para
# separar olhando ao campo assetProfile.industry (contém "REIT" nesse caso).
# Esta função faz uma única chamada ao quoteSummary do Yahoo e cacheia o
# resultado por símbolo durante 30 dias — o tipo de um ativo muda raramente.
_YF_HEADERS_TYPE = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}


async def resolve_asset_type(symbol: str, fallback: str = "stock") -> str:
    """Devolve 'etf' / 'fund' / 'reit' / o fallback, consultando o Yahoo
    Finance quando necessário. Só se aplica a símbolos que já estão a ser
    tratados como ações (fallback == 'stock') — crypto e cash não passam
    por aqui."""
    if fallback != "stock":
        return fallback

    cache_key = f"asset_subtype:{symbol.upper()}"
    cached = _cache_get(cache_key, ttl=2_592_000)  # 30 dias
    if cached:
        return cached.get("type", fallback)

    resolved = fallback
    try:
        async with httpx.AsyncClient(timeout=10, headers=_YF_HEADERS_TYPE) as ch:
            for host in ("query2.finance.yahoo.com", "query1.finance.yahoo.com"):
                r = await ch.get(
                    f"https://{host}/v10/finance/quoteSummary/{symbol}",
                    params={"modules": "price,assetProfile", "corsDomain": "finance.yahoo.com", "formatted": "true"},
                )
                if r.status_code != 200:
                    continue
                result = (r.json().get("quoteSummary", {}) or {}).get("result") or []
                if not result:
                    continue
                mod = result[0]
                qt = ((mod.get("price") or {}).get("quoteType") or "").upper()
                if qt == "ETF":
                    resolved = "etf"
                elif qt == "MUTUALFUND":
                    resolved = "fund"
                else:
                    industry = ((mod.get("assetProfile") or {}).get("industry") or "")
                    if "REIT" in industry.upper():
                        resolved = "reit"
                break
    except Exception as e:
        logger.warning(f"resolve_asset_type({symbol}): {e}")

    _cache_set(cache_key, {"type": resolved})
    return resolved


async def resolve_asset_types_bulk(symbols: List[str]) -> dict:
    """Resolve vários símbolos em paralelo (usado na sincronização de
    brokers, onde há vários símbolos únicos a classificar de uma vez)."""
    uniq = list({s.upper() for s in symbols if s})
    results = await asyncio.gather(*[resolve_asset_type(s) for s in uniq], return_exceptions=True)
    return {s: (r if isinstance(r, str) else "stock") for s, r in zip(uniq, results)}


# Símbolos cripto cujo id CoinGecko NÃO é o símbolo em minúsculas — os mais
# enganadores. Usado como atalho antes de ir à rede (e como rede de segurança
# se a CoinGecko falhar). O resto é resolvido dinamicamente por market cap.
_CG_SYMBOL_OVERRIDES = {
    "USDT": "tether", "USDC": "usd-coin", "XRP": "ripple", "BNB": "binancecoin",
    "DOGE": "dogecoin", "TON": "the-open-network", "DOT": "polkadot",
    "MATIC": "matic-network", "POL": "polygon-ecosystem-token", "SHIB": "shiba-inu",
    "AVAX": "avalanche-2", "LINK": "chainlink", "UNI": "uniswap", "LTC": "litecoin",
    "BCH": "bitcoin-cash", "ATOM": "cosmos", "XLM": "stellar", "ETC": "ethereum-classic",
    "FIL": "filecoin", "HBAR": "hedera-hashgraph", "APT": "aptos", "ARB": "arbitrum",
    "OP": "optimism", "NEAR": "near", "GRT": "the-graph", "IMX": "immutable-x",
    "RNDR": "render-token", "INJ": "injective-protocol", "SUI": "sui", "SEI": "sei-network",
    "TRX": "tron", "DAI": "dai", "FDUSD": "first-digital-usd", "WBTC": "wrapped-bitcoin",
    "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana", "ADA": "cardano",
}


async def _search_coingecko_id(symbol: str) -> str | None:
    """Resolve UM símbolo cripto -> coingecko_id via /search da CoinGecko,
    escolhendo, entre os que têm exatamente esse símbolo, o de melhor market
    cap. Cobre moedas fora do top de mercado (users novos com qualquer coin).
    Cache por símbolo (30 dias) para não repetir a chamada a cada sync."""
    sym = symbol.upper()
    cache_key = f"cg_sym_id:{sym}"
    cached = _cache_get(cache_key, ttl=2_592_000)  # 30 dias
    if cached:
        return cached.get("id")
    cid = None
    try:
        async with httpx.AsyncClient(timeout=10) as ch:
            r = await ch.get("https://api.coingecko.com/api/v3/search", params={"query": symbol})
            if r.status_code == 200:
                coins = r.json().get("coins", []) or []
                matches = [c for c in coins if (c.get("symbol") or "").upper() == sym]
                pool = matches or coins

                def _rank(c):
                    rk = c.get("market_cap_rank")
                    return rk if isinstance(rk, int) else 10 ** 9
                pool.sort(key=_rank)
                if pool:
                    cid = pool[0].get("id")
    except Exception as e:
        logger.warning(f"CoinGecko search '{symbol}' error: {e}")
    if cid:
        _cache_set(cache_key, {"id": cid})
    return cid


async def resolve_crypto_ids_bulk(symbols: List[str]) -> dict:
    """Mapa { SÍMBOLO -> coingecko_id } para dar cotação a cripto importada de
    exchanges (que só traz o símbolo). Sem o id certo, o ativo ficava sem preço
    (-100% de PnL falso). Estratégia: overrides estáticos dos mais enganadores
    (USDT->tether, XRP->ripple…) + mapa dinâmico por market cap (top ~500 da
    CoinGecko, em cache 24h) para o resto — escolhendo, por símbolo, a moeda de
    maior capitalização (evita apanhar um homónimo obscuro)."""
    uniq = {s.upper() for s in symbols if s}
    if not uniq:
        return {}

    out = {}
    remaining = set()
    for sym in uniq:
        if sym in _CG_SYMBOL_OVERRIDES:
            out[sym] = _CG_SYMBOL_OVERRIDES[sym]
        else:
            remaining.add(sym)

    if remaining:
        cache_key = "cg_symbol_to_id_map"
        sym_map = _cache_get(cache_key, ttl=86_400)  # 24h
        if not sym_map:
            sym_map = {}
            try:
                async with httpx.AsyncClient(timeout=15) as ch:
                    for page in (1, 2):
                        r = await ch.get(
                            "https://api.coingecko.com/api/v3/coins/markets",
                            params={"vs_currency": "usd", "order": "market_cap_desc",
                                    "per_page": 250, "page": page, "sparkline": "false"},
                        )
                        if r.status_code != 200:
                            break
                        for x in r.json():
                            sym = (x.get("symbol") or "").upper()
                            cid = x.get("id")
                            # 1º a aparecer = maior market cap (lista já ordenada)
                            if sym and cid and sym not in sym_map:
                                sym_map[sym] = cid
                if sym_map:
                    _cache_set(cache_key, sym_map)
            except Exception as e:
                logger.warning(f"resolve_crypto_ids_bulk market map error: {e}")
        still_missing = set()
        for sym in remaining:
            if sym in (sym_map or {}):
                out[sym] = sym_map[sym]
            else:
                still_missing.add(sym)

        # Fallback para QUALQUER moeda fora do top de mercado (users novos com
        # coins pequenas): pesquisa individual por símbolo, concorrência
        # limitada para respeitar o rate-limit da CoinGecko.
        if still_missing:
            sem = asyncio.Semaphore(3)

            async def _one(sym):
                async with sem:
                    return sym, await _search_coingecko_id(sym)
            pairs = await asyncio.gather(*[_one(s) for s in still_missing], return_exceptions=True)
            for pr in pairs:
                if isinstance(pr, tuple):
                    sym, cid = pr
                    if cid:
                        out[sym] = cid

    return out


# --- Holdings ---
def compute_holdings_from_txns(txns: List[dict]) -> List[dict]:
    """Compute current holdings from a list of transactions (weighted average cost)."""
    txns = sorted(txns, key=lambda t: (t.get("date", ""), t.get("created_at", "")))
    holdings = {}
    for t in txns:
        key = (t["wallet_id"], t["asset_type"], t["symbol"].upper())
        h = holdings.get(key)
        if not h:
            h = {
                "wallet_id": t["wallet_id"],
                "asset_type": t["asset_type"],
                "symbol": t["symbol"].upper(),
                "coingecko_id": t.get("coingecko_id"),
                "name": t.get("name") or t["symbol"],
                "quantity": 0.0,
                "total_cost_usd": 0.0,
                "avg_cost_usd": 0.0,
                "realized_pnl_usd": 0.0,
                "tx_count": 0,
            }
            holdings[key] = h
        if t.get("coingecko_id"):
            h["coingecko_id"] = t["coingecko_id"]
        if t.get("name"):
            h["name"] = t["name"]
        h["tx_count"] += 1

        fx = float(t.get("fx_to_usd") or 1.0)
        price_usd = float(t["price"]) * fx
        fee_usd = float(t.get("fee", 0)) * fx
        qty = float(t["quantity"])

        if t["type"] == "BUY":
            h["total_cost_usd"] += price_usd * qty + fee_usd
            h["quantity"] += qty
            if h["quantity"] > 0:
                h["avg_cost_usd"] = h["total_cost_usd"] / h["quantity"]
        elif t["type"] == "SELL":
            sell_qty = min(qty, h["quantity"])
            realized = (price_usd - h["avg_cost_usd"]) * sell_qty - fee_usd
            h["realized_pnl_usd"] += realized
            cost_removed = h["avg_cost_usd"] * sell_qty
            h["total_cost_usd"] -= cost_removed
            h["quantity"] -= sell_qty
            if h["quantity"] < 1e-9:
                h["quantity"] = 0
                h["total_cost_usd"] = 0
    return list(holdings.values())


# --- Asset name backfill (6 jul 2026: "temos que por o nome do ativo" nos
# Top Movers do painel) -----------------------------------------------------
# compute_holdings_from_txns() above falls back to `name = symbol` whenever
# a transaction was stored without a real display name (older transactions
# added before the search-and-pick UI captured `name`, or CSV imports) — so
# a lot of existing holdings have no proper name to show. Rather than
# fixing this only for new transactions, resolve it live for whatever's
# still missing, but keep it cheap: cached 30 days per symbol/coingecko_id
# (a company/coin's name never changes) via the same in-memory cache used
# everywhere else, so this only ever costs a real network call the FIRST
# time ANY user's portfolio contains that asset — every request after that
# (this user or anyone else) is a cache hit.
_NAME_CACHE_TTL = 30 * 24 * 3600


async def _resolve_crypto_name(coingecko_id: str) -> str | None:
    cache_key = f"crypto_name:{coingecko_id}"
    cached = _cache_get(cache_key, ttl=_NAME_CACHE_TTL)
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(timeout=8) as ch:
            r = await ch.get(
                f"https://api.coingecko.com/api/v3/coins/{coingecko_id}",
                params={
                    "localization": "false", "tickers": "false", "market_data": "false",
                    "community_data": "false", "developer_data": "false", "sparkline": "false",
                },
            )
            r.raise_for_status()
            name = r.json().get("name")
            if name:
                _cache_set(cache_key, name)
            return name
    except Exception as e:
        logger.warning(f"CoinGecko name lookup '{coingecko_id}' error: {e}")
        return None


def _resolve_stock_name_sync(symbol: str) -> str | None:
    try:
        info = yf.Ticker(symbol).info or {}
        return info.get("longName") or info.get("shortName") or None
    except Exception:
        return None


async def _resolve_stock_name(symbol: str) -> str | None:
    cache_key = f"stock_name:{symbol.upper()}"
    cached = _cache_get(cache_key, ttl=_NAME_CACHE_TTL)
    if cached is not None:
        return cached
    name = await asyncio.to_thread(_resolve_stock_name_sync, symbol)
    if name:
        _cache_set(cache_key, name)
    return name


async def backfill_holding_names(holdings: List[dict]) -> None:
    """Mutates `holdings` in place: for every holding whose name is still
    just its symbol, tries to resolve a real display name (see module note
    above). Runs all lookups concurrently and is meant to be awaited
    alongside the price/FX fetches (asyncio.gather in _price_holdings), not
    before them, so it adds no serial latency beyond whatever's already the
    slowest of the group."""
    targets = [
        h for h in holdings
        if (h.get("name") or "").strip().upper() == (h.get("symbol") or "").strip().upper()
    ]
    if not targets:
        return

    async def _resolve(h):
        try:
            if h["asset_type"] == "crypto" and h.get("coingecko_id"):
                name = await _resolve_crypto_name(h["coingecko_id"])
            elif h["asset_type"] in ("stock", "etf", "fund", "bond", "reit"):
                name = await _resolve_stock_name(h["symbol"])
            else:
                name = None
            if name:
                h["name"] = name
        except Exception as e:
            logger.warning(f"Name backfill for {h.get('symbol')} failed: {e}")

    await asyncio.gather(*(_resolve(h) for h in targets), return_exceptions=True)


def _yf_detect_types(symbols: List[str]) -> dict:
    """Sync: returns { symbol: 'etf' | 'fund' | 'stock' } for each symbol."""
    out = {}
    if not symbols:
        return out
    try:
        tickers = yf.Tickers(" ".join(symbols))
        for sym in symbols:
            try:
                t = tickers.tickers.get(sym) or yf.Ticker(sym)
                info = t.info or {}
                qt = (info.get("quoteType") or "").upper()
                if qt == "ETF":
                    out[sym] = "etf"
                elif qt in ("MUTUALFUND", "FUND"):
                    out[sym] = "fund"
                else:
                    # fallback: try fast_info
                    fi = getattr(t, "fast_info", None) or {}
                    qt2 = (fi.get("quoteType") or fi.get("quote_type") or "").upper()
                    if qt2 == "ETF":
                        out[sym] = "etf"
                    elif qt2 in ("MUTUALFUND", "FUND"):
                        out[sym] = "fund"
                    else:
                        out[sym] = "stock"
            except Exception:
                out[sym] = "stock"
    except Exception as e:
        logger.warning(f"_yf_detect_types error: {e}")
    return out


async def detect_and_fix_equity_types(user_id: str) -> dict:
    """
    Check all transactions stored as    Check all transactions stored as 'stock' and update those that
    are actually ETFs or funds in yfinance. Returns { updated: int }.
    Cached for 1 hour per user so it doesn't re-run on every page load.
    """
    cache_key = f"fix_types:{user_id}"
    if _cache_get(cache_key, ttl=3600):
        return {"updated": 0, "cached": True}

    txns = await db.transactions.find(
        {"user_id": user_id, "asset_type": "stock"}, {"_id": 0, "symbol": 1}
    ).to_list(5000)

    symbols = list({t["symbol"].upper() for t in txns})
    if not symbols:
        _cache_set(cache_key, True)
        return {"updated": 0}

    detected = await asyncio.to_thread(_yf_detect_types, symbols)
    updates = {sym: typ for sym, typ in detected.items() if typ != "stock"}

    total_updated = 0
    for sym, new_type in updates.items():
        res = await db.transactions.update_many(
            {"user_id": user_id, "asset_type": "stock", "symbol": sym},
            {"$set": {"asset_type": new_type}},
        )
        total_updated += res.modified_count

    _cache_set(cache_key, True)
    logger.info(f"fix_asset_types user={user_id}: {total_updated} txns updated ({updates})")
    return {"updated": total_updated, "changes": updates}


async def migrate_legacy_assets(user_id: str):
    """One-time migration: convert legacy `assets` rows into BUY transactions."""
    import uuid
    from datetime import datetime, timezone
    legacy = await db.assets.find({"user_id": user_id}).to_list(2000)
    if not legacy:
        return
    for a in legacy:
        date = (a.get("created_at") or datetime.now(timezone.utc).isoformat())[:10]
        await db.transactions.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet_id": a["wallet_id"],
            "asset_type": a["asset_type"],
            "symbol": a["symbol"].upper(),
            "coingecko_id": a.get("coingecko_id"),
            "name": a.get("name") or a["symbol"],
            "type": "BUY",
            "date": date,
            "quantity": a["quantity"],
            "price": a["avg_price"],
            "fee": 0,
            "currency": "USD",
            "fx_to_usd": 1.0,
            "notes": "Migrated from initial holdings",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "_migrated": True,
        })
    await db.assets.delete_many({"user_id": user_id})
    logger.info(f"Migrated {len(legacy)} legacy assets to transactions for user {user_id}")

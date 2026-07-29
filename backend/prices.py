"""Price fetching helpers (CoinGecko, yfinance, FX) and holding computation."""
import asyncio
import math
import os
import re as _re
from datetime import datetime, timezone
from typing import List

import httpx
import yfinance as yf

from core import (_cache_get, _cache_set, _cache_get_stale, _cache_age,
                  _cache_count_prefix, logger, db)


# --- Guardas de sanidade dos dados (28 jul 2026) ---------------------------
# Um preço/câmbio inválido (0, negativo, NaN, ausente) NUNCA deve ser cacheado
# nem devolvido: além de aparecer errado ao utilizador, ENVENENA o fallback
# "último valor conhecido" (_cache_get_stale) — passa a ser o valor de reserva.
# Estas guardas rejeitam o valor mau, registam o evento, e deixam o fluxo cair
# no último valor bom.

def _price_ok(usd) -> bool:
    """True se `usd` é um número finito e positivo."""
    try:
        p = float(usd)
    except (TypeError, ValueError):
        return False
    return math.isfinite(p) and p > 0


# Câmbios por USD aceitáveis (banda relativa ao fallback): rejeita valores
# absurdos (0, negativos, ou N vezes fora do esperado) que 150x-avaliariam
# uma posição. Chave -> (min, max).
_FX_FALLBACK = {
    "USD": 1.0, "EUR": 0.92, "GBP": 0.79, "CHF": 0.88,
    "JPY": 155.0, "BRL": 5.0, "CAD": 1.37, "AUD": 1.52,
}


def _fx_ok(code: str, value) -> bool:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return False
    base = _FX_FALLBACK.get(code)
    if not base or not math.isfinite(v) or v <= 0:
        return False
    return base * 0.2 <= v <= base * 5.0


def _record_data_issue(source: str, key: str, reason: str) -> None:
    """Regista um valor rejeitado para o health-check (in-memory, barato) e
    emite um log greppable ('[data-health]') para alertas nos logs do Render."""
    try:
        issues = _cache_get_stale("data_health:issues") or []
        issues.append({
            "source": source, "key": key, "reason": reason,
            "ts": datetime.now(timezone.utc).isoformat(),
        })
        _cache_set("data_health:issues", issues[-200:])
        _maybe_alert_spike(issues)
    except Exception:
        pass
    logger.warning(f"[data-health] {source}:{key} rejeitado ({reason})")


# Aviso proativo: se muitos valores forem rejeitados numa janela curta, é sinal
# de uma fonte em baixo (não de um ativo pontual). Notifica o dono por email,
# com throttle para não fazer spam.
_SPIKE_WINDOW = 600      # 10 min
_SPIKE_THRESHOLD = 20    # rejeitados na janela para disparar
_ALERT_THROTTLE = 3600   # no máximo 1 email/hora


def _maybe_alert_spike(issues: list) -> None:
    now = datetime.now(timezone.utc)
    recent = 0
    for it in reversed(issues):
        try:
            ts = datetime.fromisoformat(it["ts"])
        except Exception:
            continue
        if (now - ts).total_seconds() > _SPIKE_WINDOW:
            break
        recent += 1
    if recent < _SPIKE_THRESHOLD:
        return
    last = _cache_get_stale("data_health:last_alert")
    if last:
        try:
            if (now - datetime.fromisoformat(last)).total_seconds() < _ALERT_THROTTLE:
                return
        except Exception:
            pass
    _cache_set("data_health:last_alert", now.isoformat())  # marca ANTES de agendar (evita duplo disparo no mesmo burst)
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_send_data_health_alert(recent))
    except RuntimeError:
        pass  # sem loop a correr (ex.: chamada sincrona isolada) — ignora


async def _send_data_health_alert(count: int) -> None:
    try:
        from core import ADMIN_EMAILS
        from email_utils import send_email
        health = get_data_health()
        by = health.get("issues_by_source", {})
        rows = "".join(f"<li><b>{s}</b>: {n}</li>" for s, n in by.items()) or "<li>—</li>"
        html = (
            f"<p>O Wallet76 rejeitou <b>{count}</b> valores de dados nos últimos "
            f"{_SPIKE_WINDOW // 60} minutos (preços/câmbios inválidos vindos de fontes externas).</p>"
            f"<ul>{rows}</ul>"
            f"<p>Os valores inválidos foram <b>bloqueados</b> — os utilizadores continuam a ver o "
            f"último valor bom — mas convém verificar as fontes. Detalhe em <i>Admin → Dados</i>.</p>"
        )
        for email in ADMIN_EMAILS:
            await send_email(email, "⚠️ Wallet76 — pico de dados rejeitados", html)
        logger.warning(f"[data-health] alerta de pico enviado ({count} rejeitados)")
    except Exception as e:
        logger.warning(f"[data-health] falha a enviar alerta: {e}")


def get_data_health() -> dict:
    """Snapshot da saúde dos dados para o endpoint admin /data-health."""
    issues = _cache_get_stale("data_health:issues") or []
    fx_age = _cache_age("fx:rates")
    from collections import Counter
    by_source = Counter(i.get("source") for i in issues)
    return {
        "recent_issues": issues[-50:],
        "issue_count_total": len(issues),
        "issues_by_source": dict(by_source),
        "fx_age_seconds": fx_age,
        "fx_stale": fx_age is None or fx_age > 3600,
        "cached_stock_prices": _cache_count_prefix("stock_price:"),
        "cached_crypto_prices": _cache_count_prefix("crypto_price:"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _cg_headers() -> dict:
    """Header com a chave demo do CoinGecko em TODAS as chamadas (não só na de
    preço). Sem isto, as chamadas de nome/pesquisa/detalhe continuam a apanhar
    429 no IP partilhado do Render mesmo com COINGECKO_API_KEY definida."""
    key = os.environ.get("COINGECKO_API_KEY", "").strip()
    return {"x-cg-demo-api-key": key} if key else {}


# --- Stale-while-revalidate + dedup de pedidos em voo (28 jul 2026) --------
# Medido no dashboard em producao: de 60 em 60s o /portfolio e o /prices/live
# batiam no mesmo instante em que a cache de 120s expirava e ficavam ambos
# ~9,6s parados a espera da MESMA batch do yfinance. Duas correcoes:
#
# 1) stale-while-revalidate — quem apanha a cache acabada de expirar recebe
#    JA o ultimo valor conhecido (segundos de idade, nao minutos) e a
#    atualizacao vai para segundo plano. So se espera mesmo quando nao ha
#    valor nenhum (simbolo novo) ou quando o que ha e velho demais.
# 2) dedup de pedidos em voo — dois pedidos simultaneos para o mesmo simbolo
#    lancavam duas batches identicas a fonte externa. Agora o segundo espera
#    pelo resultado da primeira.
#
# Nota importante sobre a cache: `_cache_get` APAGA a entrada quando ela esta
# expirada. Por isso aqui a frescura e avaliada com `_cache_age` +
# `_cache_get_stale` e nunca com `_cache_get` — assim o valor antigo sobrevive
# e o fallback "ultimo valor conhecido" no fim das duas funcoes (a protecao
# contra o falso -100% de PnL) passa finalmente a ter alguma coisa para servir.

STOCK_TTL = 120         # idade a partir da qual um preco de acao e refrescado
STOCK_STALE_MAX = 900   # acima disto nao servimos stale: esperamos pelo novo
CRYPTO_TTL = 60
CRYPTO_STALE_MAX = 600

_bg_tasks: set = set()
_inflight_yf: dict = {}
_inflight_cg: dict = {}


def _spawn_bg(coro) -> None:
    """Lanca `coro` em segundo plano sem atrasar a resposta ao utilizador.

    Guarda uma referencia forte a task porque o asyncio so lhes guarda
    referencias fracas — sem isto o GC pode mata-la a meio. Fora de um event
    loop (scripts, testes) fecha a coroutine em vez de rebentar."""
    try:
        task = asyncio.ensure_future(coro)
    except RuntimeError:
        coro.close()
        return
    _bg_tasks.add(task)
    task.add_done_callback(_bg_tasks.discard)


def _split_by_freshness(prefix: str, keys: List[str], ttl: int, stale_max: int):
    """Divide `keys` em frescos / stale-servivel / frios.

    Devolve (result, warm, cold): `result` ja traz os frescos E os stale
    (servem-se imediatamente), `warm` sao os stale que devem ser refrescados
    em segundo plano, `cold` sao os que nao tem valor utilizavel nenhum e
    obrigam mesmo a esperar pela fonte externa."""
    result, warm, cold = {}, [], []
    for k in keys:
        ck = f"{prefix}{k}"
        val = _cache_get_stale(ck)
        age = _cache_age(ck)
        if val is None or age is None:
            cold.append(k)
        elif age < ttl:
            result[k] = val
        elif age < stale_max:
            result[k] = val
            warm.append(k)
        else:
            cold.append(k)
    return result, warm, cold


async def _batch_dedup(inflight: dict, keys: List[str], fetch) -> dict:
    """Corre `fetch(chaves)` garantindo UMA chamada por chave em voo.

    Se outro pedido ja tem uma batch a decorrer que inclui a chave X, este
    nao lanca uma segunda para X: espera pelo resultado da primeira."""
    if not keys:
        return {}
    loop = asyncio.get_running_loop()
    mine, waiting = [], {}
    for k in keys:
        fut = inflight.get(k)
        if fut is not None and not fut.done():
            waiting[k] = fut
        else:
            inflight[k] = loop.create_future()
            mine.append(k)

    out = {}
    if mine:
        data = {}
        try:
            data = await fetch(mine)
        except Exception as e:
            logger.error(f"batch fetch error: {e}")
        finally:
            # Resolver SEMPRE os futuros — mesmo em erro ou cancelamento —
            # senao quem esta a espera fica pendurado para sempre.
            for k in mine:
                fut = inflight.pop(k, None)
                if fut is not None and not fut.done():
                    fut.set_result((data or {}).get(k))
        out.update(data or {})

    if waiting:
        # shield: se ESTE pedido for cancelado (utilizador fechou o
        # separador), nao queremos cancelar o future partilhado e deixar os
        # outros a espera sem resposta.
        got = await asyncio.gather(
            *[asyncio.shield(f) for f in waiting.values()], return_exceptions=True)
        for k, val in zip(list(waiting.keys()), got):
            if isinstance(val, dict):
                out[k] = val
    return out


# --- Crypto prices ---
async def _cg_fetch_prices(ids: List[str]) -> dict:
    """Uma chamada ao CoinGecko para `ids`, com validacao e escrita na cache.

    Extraido de dentro do get_crypto_prices para poder ser reutilizado pelo
    refresh em segundo plano do stale-while-revalidate."""
    out = {}
    if not ids:
        return out
    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {
        "ids": ",".join(ids),
        "vs_currencies": "usd,eur",
        "include_24hr_change": "true",
    }
    # Chave demo gratuita da CoinGecko (30 req/min dedicados em vez do limite
    # partilhado por IP, que IPs de cloud como o Render apanham quase sempre em
    # 429). Definir COINGECKO_API_KEY no ambiente ativa-a; sem ela funciona
    # como antes.
    headers = _cg_headers()
    try:
        async with httpx.AsyncClient(timeout=15) as client_http:
            r = await client_http.get(url, params=params, headers=headers)
            r.raise_for_status()
            data = r.json()
            for cid, val in data.items():
                if _price_ok((val or {}).get("usd")):
                    _cache_set(f"crypto_price:{cid}", val)
                    out[cid] = val
                else:
                    _record_data_issue("crypto", cid, "preco invalido do CoinGecko")
    except Exception as e:
        logger.error(f"CoinGecko error: {e}")
    return out


async def _refresh_crypto_prices(ids: List[str]) -> None:
    """Refresh em segundo plano (stale-while-revalidate)."""
    try:
        await _batch_dedup(_inflight_cg, ids, _cg_fetch_prices)
    except Exception as e:
        logger.warning(f"refresh crypto prices falhou: {e}")


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

    # Frescos e stale saem daqui ja servidos; so os "cold" (sem valor
    # nenhum) e que obrigam a esperar pelo CoinGecko.
    result, warm, cold = _split_by_freshness(
        "crypto_price:", ids, CRYPTO_TTL, CRYPTO_STALE_MAX)
    if warm:
        _spawn_bg(_refresh_crypto_prices(warm))

    missing = cold
    if not missing:
        return result

    result.update(await _batch_dedup(_inflight_cg, missing, _cg_fetch_prices))

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
# Empresas que mudaram de ticker — o Yahoo já só reconhece o novo. Consultamos
# pelo novo, mas mantemos o símbolo original do utilizador na carteira. Juntar
# aqui novos casos à medida que aparecem nos logs/Sentry.
_TICKER_ALIASES = {
    "SQ": "XYZ",     # Block, Inc. — SQ -> XYZ (jan 2025)
    "PARA": "PSKY",  # Paramount -> Paramount Skydance (PSKY) (ago 2025)
}


def yf_query_symbol(symbol: str) -> str:
    """Símbolo a usar na consulta ao Yahoo (aplica mudanças de ticker)."""
    return _TICKER_ALIASES.get((symbol or "").upper(), symbol)


def _yf_fetch(symbols: List[str]) -> dict:
    """Sync yfinance fetch (run in thread). Returns { symbol: { usd, prev_close, change_pct } }"""
    out = {}
    if not symbols:
        return out
    # Mapeia símbolos com ticker mudado para o atual (SQ->XYZ, PARA->PSKY),
    # mas guarda o resultado com o símbolo ORIGINAL do utilizador.
    query_map = {s: yf_query_symbol(s) for s in symbols}
    try:
        tickers = yf.Tickers(" ".join(query_map.values()))
        for sym in symbols:
            q = query_map[sym]
            try:
                t = tickers.tickers.get(q) or yf.Ticker(q)
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


async def _yf_fetch_async(symbols: List[str]) -> dict:
    """`_yf_fetch` fora do event loop (e bloqueante: rede sincrona)."""
    return await asyncio.to_thread(_yf_fetch, symbols)


async def _refresh_stock_prices(symbols: List[str]) -> None:
    """Refresh em segundo plano (stale-while-revalidate)."""
    try:
        data = await _batch_dedup(_inflight_yf, symbols, _yf_fetch_async)
        for sym, val in (data or {}).items():
            if _price_ok((val or {}).get("usd")):
                _cache_set(f"stock_price:{sym}", val)
            else:
                _record_data_issue("stock", sym, "preco invalido do yfinance")
    except Exception as e:
        logger.warning(f"refresh stock prices falhou: {e}")


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

    # Frescos e stale saem daqui ja servidos (stale-while-revalidate); so os
    # "cold" — sem valor nenhum utilizavel — e que obrigam a esperar pela
    # batch do yfinance, que e a chamada de ~9,6s que estava a travar o
    # dashboard de 60 em 60s.
    result, warm, cold = _split_by_freshness(
        "stock_price:", syms, STOCK_TTL, STOCK_STALE_MAX)
    if warm:
        _spawn_bg(_refresh_stock_prices(warm))

    missing = cold
    if not missing:
        return result

    data = await _batch_dedup(_inflight_yf, missing, _yf_fetch_async)
    for sym, val in data.items():
        if _price_ok((val or {}).get("usd")):
            _cache_set(f"stock_price:{sym}", val)
            result[sym] = val
        else:
            _record_data_issue("stock", sym, "preco invalido do yfinance")

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
            resolved_data = await _batch_dedup(_inflight_yf, new_syms, _yf_fetch_async)
            for orig, real in resolved_pairs:
                if real in resolved_data and _price_ok(resolved_data[real].get("usd")):
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
    rates = dict(_FX_FALLBACK)
    got_live = False
    try:
        async with httpx.AsyncClient(timeout=10) as ch:
            r = await ch.get("https://open.er-api.com/v6/latest/USD")
            if r.status_code == 200:
                data = r.json().get("rates", {})
                for c in ("EUR", "GBP", "CHF", "JPY", "BRL", "CAD", "AUD"):
                    v = data.get(c)
                    if v is None:
                        continue
                    if _fx_ok(c, v):
                        rates[c] = float(v)
                        got_live = True
                    else:
                        _record_data_issue("fx", c, f"cambio fora de banda ({v})")
    except Exception as e:
        logger.warning(f"FX rate fetch failed: {e}")
    if not got_live:
        # Nada de fiavel ao vivo -> preferir o ULTIMO cambio bom (live) em cache
        # aos valores fixos no codigo (que envelhecem), se existir.
        stale = _cache_get_stale("fx:rates")
        if stale:
            return stale
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


async def resolve_sector(symbol: str) -> str | None:
    """Setor (GICS) do símbolo. Tenta o quoteSummary do Yahoo e, se falhar,
    recorre ao yfinance (.info). Cache 30 dias SÓ em sucesso — se não obtiver
    setor, não cacheia (volta a tentar no próximo load em vez de ficar preso)."""
    sym = (symbol or "").upper().strip()
    if not sym:
        return None
    cache_key = f"asset_sector:{sym}"
    cached = _cache_get(cache_key, ttl=2_592_000)  # 30 dias (só sucessos)
    if cached is not None:
        return cached.get("sector")

    sector = None
    # 1) HTTP quoteSummary
    try:
        async with httpx.AsyncClient(timeout=10, headers=_YF_HEADERS_TYPE) as ch:
            for host in ("query2.finance.yahoo.com", "query1.finance.yahoo.com"):
                r = await ch.get(
                    f"https://{host}/v10/finance/quoteSummary/{sym}",
                    params={"modules": "assetProfile", "corsDomain": "finance.yahoo.com", "formatted": "true"},
                )
                if r.status_code != 200:
                    continue
                result = (r.json().get("quoteSummary", {}) or {}).get("result") or []
                if not result:
                    continue
                sector = ((result[0].get("assetProfile") or {}).get("sector") or "") or None
                if sector:
                    break
    except Exception as e:
        logger.warning(f"resolve_sector http({sym}): {e}")

    # 2) fallback yfinance (.info) — corre em thread (yf é síncrono). Para ETFs/
    # fundos não há setor GICS, por isso usa-se a CATEGORIA (ex.: "Trading--
    # Inverse Equity") como equivalente.
    if not sector:
        try:
            info = await asyncio.to_thread(lambda: yf.Ticker(sym).info)
            info = info or {}
            sector = (info.get("sector") or info.get("category") or "") or None
        except Exception as e:
            logger.warning(f"resolve_sector yf({sym}): {e}")

    if sector:
        _cache_set(cache_key, {"sector": sector})
    return sector


async def resolve_sectors_bulk(symbols: List[str]) -> dict:
    """Setores de vários símbolos em paralelo (só busca os não-cacheados)."""
    uniq = list({s.upper() for s in symbols if s})
    results = await asyncio.gather(*[resolve_sector(s) for s in uniq], return_exceptions=True)
    return {s: (r if isinstance(r, str) else None) for s, r in zip(uniq, results)}


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
            r = await ch.get("https://api.coingecko.com/api/v3/search", params={"query": symbol}, headers=_cg_headers())
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


async def get_crypto_images(coingecko_ids: list) -> dict:
    """{ coingecko_id -> URL do logótipo } para os ícones das holdings. Usa o
    top de mercado da CoinGecko (mesma fonte já usada para resolver ids), em
    cache 24h — um id fora do top não tem imagem aqui (o frontend cai para o
    CDN por símbolo / iniciais)."""
    ids = [c for c in {x for x in (coingecko_ids or []) if x}]
    if not ids:
        return {}
    cache_key = "cg_id_to_image_map"
    img_map = _cache_get(cache_key, ttl=86_400)
    if not img_map:
        img_map = {}
        try:
            async with httpx.AsyncClient(timeout=15, headers=_cg_headers()) as ch:
                for page in (1, 2):
                    r = await ch.get(
                        "https://api.coingecko.com/api/v3/coins/markets",
                        params={"vs_currency": "usd", "order": "market_cap_desc",
                                "per_page": 250, "page": page, "sparkline": "false"},
                    )
                    if r.status_code != 200:
                        break
                    for x in r.json():
                        cid = x.get("id")
                        img = x.get("image")
                        if cid and img:
                            img_map[cid] = img
            if img_map:
                _cache_set(cache_key, img_map)
        except Exception as e:
            logger.warning(f"get_crypto_images error: {e}")
    return {cid: img_map[cid] for cid in ids if cid in (img_map or {})}


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
                async with httpx.AsyncClient(timeout=15, headers=_cg_headers()) as ch:
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
                headers=_cg_headers(),
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


# Corretoras de CRIPTO. Vive ao nivel do modulo porque duas auto-curas
# precisam da mesma lista e com copias separadas elas iam divergir: a
# `fix_exchange_asset_types` usa-a para dizer "aqui dentro e tudo cripto", e a
# `fix_crypto_typed_equities` usa-a para o contrario — nao mexer no que veio
# de uma exchange.
CRYPTO_EXCHANGES = ["bybit", "okx", "kucoin", "bitget", "mexc", "cryptocom",
                    "gateio", "htx", "binance", "coinbase", "kraken"]

# Um `_broker` que nao seja exchange de cripto: ou o campo nem existe (entrada
# manual), ou existe e nao esta na lista. Escrito uma vez para as duas queries
# de baixo ficarem obrigatoriamente iguais.
NOT_CRYPTO_EXCHANGE = [{"_broker": {"$exists": False}},
                       {"_broker": None},
                       {"_broker": {"$nin": CRYPTO_EXCHANGES}}]


async def fix_exchange_asset_types(user_id: str) -> dict:
    """Auto-cura da classificação em transações importadas de EXCHANGES de
    cripto: stablecoins/fiat -> caixa (cash/liquidez), tudo o resto -> cripto.
    Corre ao carregar o portfólio (cache 1h) para não depender de uma nova
    sincronização manual. Não toca em corretoras de ações (DEGIRO/IBKR/T212/
    XTB) nem no manual — só nos brokers de cripto."""
    cache_key = f"fix_exch_types:{user_id}"
    if _cache_get(cache_key, ttl=3600):
        return {"updated": 0, "cached": True}

    crypto_exchanges = CRYPTO_EXCHANGES
    stable_fiat = ["USDT", "USDC", "USD", "DAI", "TUSD", "FDUSD", "BUSD", "USDP",
                   "PYUSD", "EUR", "GBP", "CHF", "JPY", "BRL", "CAD", "AUD"]

    updated = 0
    r1 = await db.transactions.update_many(
        {"user_id": user_id, "_broker": {"$in": crypto_exchanges},
         "asset_type": {"$ne": "cash"}, "symbol": {"$in": stable_fiat}},
        {"$set": {"asset_type": "cash"}},
    )
    r2 = await db.transactions.update_many(
        {"user_id": user_id, "_broker": {"$in": crypto_exchanges},
         "asset_type": {"$ne": "crypto"}, "symbol": {"$nin": stable_fiat}},
        {"$set": {"asset_type": "crypto"}},
    )
    updated = (r1.modified_count or 0) + (r2.modified_count or 0)
    _cache_set(cache_key, True)
    if updated:
        logger.info(f"fix_exchange_asset_types user={user_id}: {updated} txns")
    return {"updated": updated}


def _yf_detect_equity_strict(symbols: List[str]) -> dict:
    """Sync: { simbolo: 'etf' | 'fund' | 'stock' } SO para os simbolos que o
    Yahoo reconhece explicitamente como instrumento de capital.

    A diferenca para o `_yf_detect_types` e o silencio. Aquele assume `stock`
    quando nao sabe, e pode dar-se ao luxo disso porque so refina uma linha que
    JA e `stock`. Aqui quem chama vai reclassificar uma linha de cripto, e
    assumir por omissao seria transformar uma cripto obscura numa acao so
    porque o Yahoo esteve em baixo. Simbolo desconhecido nao entra no
    resultado."""
    out = {}
    if not symbols:
        return out
    try:
        tickers = yf.Tickers(" ".join(symbols))
    except Exception as e:
        logger.warning(f"_yf_detect_equity_strict Tickers error: {e}")
        tickers = None
    for sym in symbols:
        try:
            t = (tickers.tickers.get(sym) if tickers else None) or yf.Ticker(sym)
            info = t.info or {}
            qt = (info.get("quoteType") or "").upper()
            if not qt:
                fi = getattr(t, "fast_info", None) or {}
                qt = (fi.get("quoteType") or fi.get("quote_type") or "").upper()
            if qt == "ETF":
                out[sym] = "etf"
            elif qt in ("MUTUALFUND", "FUND"):
                out[sym] = "fund"
            elif qt == "EQUITY":
                out[sym] = "stock"
        except Exception:
            continue

    # Rede de recurso para quando o `quoteType` simplesmente não vem. Ver o
    # `_yf_probe_equity_chart` para o porquê.
    unresolved = [s for s in symbols if s not in out]
    if unresolved:
        probed = _yf_probe_equity_chart(unresolved)
        if probed:
            logger.info(f"_yf_detect_equity_strict: sem quoteType para {unresolved}; "
                        f"{probed} confirmados por cotação no Yahoo (chart) - assumidos como stock")
        for sym in probed:
            out[sym] = "stock"
    return out


def _yf_probe_equity_chart(symbols: List[str]) -> List[str]:
    """Sync: dos `symbols`, quais é que têm cotação no Yahoo para o símbolo
    simples. Um lote só, pela API de gráficos (v8) — a mesma que o
    `yf.download` usa e que não pede autenticação.

    Existe porque a fonte preferida desta família, o `quoteType`, vem do
    `quoteSummary`, e o `quoteSummary` começou a responder **HTTP 401** (visto
    a 29 jul 2026 no `SPY` e no `ADA`). Com o 401, o `_yf_detect_equity_strict`
    devolvia sempre vazio e a auto-cura ficava inerte: uma ação gravada como
    cripto continuava a valer $0,00 e a -100% indefinidamente, que é
    exatamente o problema que a auto-cura foi escrita para resolver.

    O que esta sonda responde não é "que instrumento é este" mas "existe
    cotação para o símbolo simples". É menos informação do que o `quoteType`,
    e por isso devolve sempre `stock`: a `detect_and_fix_equity_types` apura
    depois para ETF/fundo, quando o `quoteSummary` voltar. É o mesmo
    compromisso já assumido no caminho da importação, onde um Yahoo em baixo
    faz entrar tudo como `stock` para ser corrigido a seguir.

    Isto afrouxa de propósito a condição 2 das três da
    `fix_crypto_typed_equities`: "o Yahoo confirma o tipo" passa a poder ser
    "o Yahoo tem cotação para o símbolo simples". As outras duas continuam
    inteiras e são elas que carregam a segurança — a posição já não tem preço
    em fonte nenhuma (nem CoinGecko pelo id, nem cache, nem `SÍMBOLO-USD`) e
    não veio de uma exchange de cripto. Uma cripto verdadeira com preço nunca
    chega aqui."""
    out = []
    if not symbols:
        return out
    try:
        data = yf.download(symbols, period="5d", interval="1d", group_by="ticker",
                           auto_adjust=False, progress=False, threads=False)
    except Exception as e:
        logger.warning(f"_yf_probe_equity_chart error: {e}")
        return out
    try:
        if data is None or data.empty:
            return out
        multi = data.columns.nlevels > 1
        lvl0 = set(data.columns.get_level_values(0)) if multi else set()
        for sym in symbols:
            try:
                if multi:
                    if sym not in lvl0:
                        continue
                    df = data[sym]
                else:
                    df = data
                if df is None or df.empty:
                    continue
                closes = df["Close"].dropna()
                if len(closes) and float(closes.iloc[-1]) > 0:
                    out.append(sym)
            except Exception:
                continue
    finally:
        del data
    return out


async def fix_crypto_typed_equities(user_id: str) -> dict:
    """Auto-cura do caso que deixou o `SPY` a $0,00 e a -100% (29 jul 2026):
    uma acao ou um ETF gravados com `asset_type = "crypto"`.

    Quem e cripto e avaliado pela CoinGecko; se o `coingecko_id` nao existir, a
    posicao fica a valer zero e aparece como perda total — e esse zero entra no
    total da carteira, por isso o dinheiro desaparece de um sitio onde ninguem
    o procura. As duas portas por onde a classificacao errada entrava ja foram
    fechadas, mas as linhas que ficaram na base nao se corrigem sozinhas. E
    isto que esta funcao faz.

    Esta e a terceira irma da familia: a `detect_and_fix_equity_types` apura
    `stock` -> ETF/fundo, a `fix_exchange_asset_types` trata do que vem das
    exchanges, e esta trata do sentido contrario, cripto -> capital.

    Tres condicoes, todas obrigatorias, porque a reclassificacao errada no
    sentido inverso (uma cripto verdadeira convertida em acao) seria igualmente
    ma:

      1. a posicao nao tem preco em fonte nenhuma. O `get_crypto_prices` ja
         tenta a CoinGecko pelo id, o ultimo preco conhecido em cache e ainda
         `SIMBOLO-USD` no Yahoo; se depois disso continua sem preco, nao e uma
         cripto que a CoinGecko conhece. Uma cripto real com preco nunca chega
         a ser candidata — e por isso que esta condicao vem primeiro: o `BTC` e
         tambem um ticker de bolsa e nunca chega ao teste do Yahoo;
      2. o Yahoo confirma o simbolo simples: ou diz explicitamente o tipo
         (`quoteType` = ETF/fundo/acao), ou — se o `quoteType` nao vier, que e
         o que acontece desde que o `quoteSummary` comecou a devolver 401 —
         tem cotacao para o simbolo simples na API de graficos, e nesse caso
         assume-se `stock` e a `detect_and_fix_equity_types` apura depois.
         Silencio total do Yahoo continua a nao contar como sim;
      3. a transacao nao veio de uma exchange de cripto. Numa exchange tudo o
         que la esta e cripto por definicao, e uma coincidencia de ticker com a
         bolsa nao muda isso.

    Cache de 1 h por utilizador, como as irmas. O `coingecko_id` e limpo junto
    com a reclassificacao: a partir dai so confundia a origem do preco."""
    cache_key = f"fix_cry_eq:{user_id}"
    if _cache_get(cache_key, ttl=3600):
        return {"updated": 0, "cached": True}

    txns = await db.transactions.find(
        {"user_id": user_id, "asset_type": "crypto", "$or": NOT_CRYPTO_EXCHANGE},
        {"_id": 0, "symbol": 1, "coingecko_id": 1},
    ).to_list(5000)
    if not txns:
        _cache_set(cache_key, True)
        return {"updated": 0}

    # simbolo -> coingecko_id. Sem id, o id efetivo e o simbolo em minusculas —
    # exatamente o que o /portfolio faz ao montar o pedido de precos, senao
    # estariamos a testar um caminho diferente daquele que produz o zero.
    by_sym = {}
    for t in txns:
        sym = (t.get("symbol") or "").upper().strip()
        if sym:
            by_sym.setdefault(sym, (t.get("coingecko_id") or "").lower().strip() or sym.lower())

    symbol_map = {cg: sym for sym, cg in by_sym.items()}
    prices = await get_crypto_prices(list(symbol_map.keys()), symbol_map)

    candidates = [sym for sym, cg in by_sym.items()
                  if float((prices.get(cg) or {}).get("usd") or 0) <= 0]
    if not candidates:
        _cache_set(cache_key, True)
        return {"updated": 0}

    detected = await asyncio.to_thread(_yf_detect_equity_strict, candidates)
    if not detected:
        # Sem preco e sem resposta do Yahoo: fica o aviso, mas nao se mexe.
        logger.warning(f"[data-health] user={user_id}: {candidates} sem preco e "
                       f"sem tipo confirmado pelo Yahoo - continuam como cripto")
        _cache_set(cache_key, True)
        return {"updated": 0}

    total = 0
    for sym, new_type in detected.items():
        res = await db.transactions.update_many(
            {"user_id": user_id, "asset_type": "crypto", "symbol": sym,
             "$or": NOT_CRYPTO_EXCHANGE},
            {"$set": {"asset_type": new_type, "coingecko_id": None}},
        )
        total += res.modified_count or 0

    _cache_set(cache_key, True)
    if total:
        logger.info(f"fix_crypto_typed_equities user={user_id}: {total} txns ({detected})")
    return {"updated": total, "changes": detected}


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

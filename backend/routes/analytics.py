"""Analytics endpoint — portfolio performance, benchmark, metrics."""
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional

import yfinance as yf

from core import db, get_current_user, _cache_get, _cache_set, logger
from fastapi import APIRouter, Depends, Query

router = APIRouter()


# ── helpers ───────────────────────────────────────────────────────────────────

def _fetch_closes_sync(yf_sym: str, period: str = "max") -> dict:
    """Fetch daily closes for a symbol. Returns {date_iso: price}."""
    ck = f"analy_closes:{yf_sym}:{period}"
    cached = _cache_get(ck, ttl=3600)
    if cached is not None:
        return cached
    try:
        import pandas as pd
        hist = yf.Ticker(yf_sym).history(period=period, interval="1d")
        if hist.empty:
            _cache_set(ck, {})
            return {}
        series = {}
        for ts, row in hist.iterrows():
            close = row.get("Close")
            if pd.notna(close):
                series[ts.date().isoformat()] = float(close)
        _cache_set(ck, series)
        return series
    except Exception as e:
        logger.warning(f"closes {yf_sym}: {e}")
        _cache_set(ck, {})
        return {}


def _compute_metrics(series: list[dict]) -> dict:
    """
    series: [{ts, value, cost}] sorted ascending.
    Returns total_return_pct, cagr_pct (None if < 1 year), history_days,
            max_drawdown_pct, best_month, worst_month, months.
    """
    if len(series) < 2:
        return {}

    values = [s["value"] for s in series]
    start_val = values[0]
    end_val = values[-1]

    # Total return
    total_return_pct = ((end_val - start_val) / start_val * 100) if start_val > 0 else 0

    # CAGR — only meaningful when history >= 1 year
    start_date = datetime.fromisoformat(series[0]["ts"]).date()
    end_date   = datetime.fromisoformat(series[-1]["ts"]).date()
    history_days = (end_date - start_date).days
    years = history_days / 365.25

    if years >= 1.0 and start_val > 0:
        cagr_pct = (((end_val / start_val) ** (1.0 / years)) - 1) * 100
    else:
        cagr_pct = None  # not enough history — frontend shows N/D

    # Max drawdown
    peak = values[0]
    max_dd = 0.0
    for v in values:
        if v > peak:
            peak = v
        dd = (peak - v) / peak if peak > 0 else 0
        if dd > max_dd:
            max_dd = dd

    # Monthly returns
    monthly: dict[str, list[float]] = {}
    for s in series:
        ym = s["ts"][:7]
        monthly.setdefault(ym, []).append(s["value"])

    month_returns = []
    ym_list = sorted(monthly.keys())
    for i in range(1, len(ym_list)):
        prev_vals = monthly[ym_list[i - 1]]
        curr_vals = monthly[ym_list[i]]
        if prev_vals and curr_vals and prev_vals[-1] > 0:
            prev_v = prev_vals[-1]
            curr_v = curr_vals[-1]
            ret = (curr_v - prev_v) / prev_v * 100
            month_returns.append({
                "month": ym_list[i],
                "pct": round(ret, 2),
                "abs": round(curr_v - prev_v, 2),
            })

    best_month  = max(month_returns, key=lambda x: x["pct"]) if month_returns else None
    worst_month = min(month_returns, key=lambda x: x["pct"]) if month_returns else None

    # Weekly returns (ISO week, last 104 weeks max)
    from datetime import date as date_cls
    weekly: dict[str, list[float]] = {}
    for s in series:
        d = datetime.fromisoformat(s["ts"]).date()
        iso = d.isocalendar()
        wk = f"{iso[0]}-W{iso[1]:02d}"
        weekly.setdefault(wk, []).append(s["value"])

    week_returns = []
    wk_list = sorted(weekly.keys())
    for i in range(1, len(wk_list)):
        prev_vals = weekly[wk_list[i - 1]]
        curr_vals = weekly[wk_list[i]]
        if prev_vals and curr_vals and prev_vals[-1] > 0:
            prev_v = prev_vals[-1]
            curr_v = curr_vals[-1]
            ret = (curr_v - prev_v) / prev_v * 100
            week_returns.append({
                "week": wk_list[i],
                "pct": round(ret, 2),
                "abs": round(curr_v - prev_v, 2),
            })
    week_returns = week_returns[-104:]  # last 2 years of weeks

    # Annual returns
    yearly: dict[str, list[float]] = {}
    for s in series:
        yr = s["ts"][:4]
        yearly.setdefault(yr, []).append(s["value"])

    year_returns = []
    yr_list = sorted(yearly.keys())
    for i in range(1, len(yr_list)):
        prev_vals = yearly[yr_list[i - 1]]
        curr_vals = yearly[yr_list[i]]
        if prev_vals and curr_vals and prev_vals[-1] > 0:
            prev_v = prev_vals[-1]
            curr_v = curr_vals[-1]
            ret = (curr_v - prev_v) / prev_v * 100
            year_returns.append({
                "year": yr_list[i],
                "pct": round(ret, 2),
                "abs": round(curr_v - prev_v, 2),
            })
    # Also include current partial year if at least 1 full year exists
    if yr_list:
        last_yr = yr_list[-1]
        curr_yr = str(date_cls.today().year)
        if curr_yr not in yr_list and year_returns:
            # partial current year vs last snapshot of previous year
            prev_v = yearly[last_yr][-1]
            curr_v = series[-1]["value"]
            if prev_v > 0:
                ret = (curr_v - prev_v) / prev_v * 100
                year_returns.append({
                    "year": f"{curr_yr}*",
                    "pct": round(ret, 2),
                    "abs": round(curr_v - prev_v, 2),
                })

    return {
        "total_return_pct": round(total_return_pct, 2),
        "cagr_pct":         round(cagr_pct, 2) if cagr_pct is not None else None,
        "history_days":     history_days,
        "max_drawdown_pct": round(max_dd * 100, 2),
        "best_month":       best_month,
        "worst_month":      worst_month,
        "months":           month_returns,
        "weeks":            week_returns,
        "years":            year_returns,
    }


# ── main endpoint ─────────────────────────────────────────────────────────────

# Benchmarks à escolha (7 jul 2026 — antes fixo em SPY, o que não fazia
# sentido para quem investe fora dos EUA). Allowlist curta em vez de
# freeform: evita o utilizador escrever um ticker inválido/sem histórico e
# ficar sem gráfico nenhum, e cobre os índices mais pedidos na pesquisa de
# mercado (S&P 500, mundial, europeu, tecnológico).
BENCHMARK_CHOICES = {
    "SPY": "SPY",           # S&P 500
    "VWCE.DE": "VWCE.DE",   # Vanguard FTSE All-World (proxy MSCI World, negociado na Xetra)
    "^STOXX50E": "^STOXX50E",  # Euro Stoxx 50
    "QQQ": "QQQ",           # Nasdaq 100
}


@router.get("/analytics")
async def get_analytics(
    user=Depends(get_current_user),
    wallet_id: Optional[str] = Query(None),
    benchmark: str = Query("SPY", max_length=20),
):
    """
    Returns:
      series: [{ts, value, cost, benchmark}]  — daily, full history
      metrics: {total_return_pct, cagr_pct, history_days, max_drawdown_pct, ...}
      benchmark_metrics: same shape for the chosen benchmark
      benchmark_symbol: qual dos BENCHMARK_CHOICES foi usado
      class_returns: {asset_type: return_pct} — retorno simples (valor atual
        vs. custo) por classe (ações/etf/crypto/...), calculado no fecho da
        série (não é uma série temporal por classe, só o ponto atual — pedido
        7 jul 2026 para complementar o benchmark único com uma quebra por
        tipo de ativo)
      realized_pnl_usd: total realized gains
      unrealized_pnl_usd: current unrealized
    """
    wid = wallet_id if wallet_id and wallet_id != "all" else None
    benchmark_sym = BENCHMARK_CHOICES.get(benchmark, "SPY")
    cache_key = f"analytics:{user['id']}:{wid or 'global'}:{benchmark_sym}"
    cached = _cache_get(cache_key, ttl=7200)
    if cached:
        return cached

    # ── 1. load transactions ─────────────────────────────────────────────────
    query: dict = {"user_id": user["id"]}
    if wid:
        query["wallet_id"] = wid

    txns = await db.transactions.find(query, {"_id": 0}).to_list(5000)
    if not txns:
        return {"series": [], "metrics": {}, "benchmark_metrics": {}, "benchmark_symbol": benchmark_sym, "class_returns": {}, "fees_this_year_usd": 0, "fees_all_time_usd": 0, "realized_pnl_usd": 0, "unrealized_pnl_usd": 0}

    txns.sort(key=lambda t: t.get("date", ""))
    first_date = txns[0].get("date", "")[:10]
    try:
        start = datetime.fromisoformat(first_date).date()
    except (TypeError, ValueError):
        return {"series": [], "metrics": {}, "benchmark_metrics": {}, "benchmark_symbol": benchmark_sym, "class_returns": {}, "fees_this_year_usd": 0, "fees_all_time_usd": 0, "realized_pnl_usd": 0, "unrealized_pnl_usd": 0}

    # Comissões pagas (7 jul 2026 — "transparência de comissões") — soma do
    # campo fee já gravado em cada transação, convertido a USD; separado em
    # "este ano" e "total" para dar contexto sem precisar de mais um filtro
    # de período na UI.
    current_year = str(datetime.now(timezone.utc).year)
    fees_this_year = 0.0
    fees_all_time = 0.0
    for t in txns:
        fx = float(t.get("fx_to_usd") or 1.0)
        fee_usd = float(t.get("fee", 0) or 0) * fx
        fees_all_time += fee_usd
        if (t.get("date") or "")[:4] == current_year:
            fees_this_year += fee_usd

    end = datetime.now(timezone.utc).date()
    days = []
    cur = start
    while cur <= end:
        days.append(cur)
        cur += timedelta(days=1)

    # ── 2. unique assets → fetch price histories in parallel ─────────────────
    # Caixa (7 jul 2026) — o código da moeda (ex. "EUR") não é um ticker de
    # ação/ETF válido no Yahoo Finance; tentar buscá-lo devolvia sempre vazio
    # e o valor de caixa ficava a 0 na reconstrução (afetava Retornos por
    # Classe). Já não pedimos ao Yahoo para chaves "cash" — o preço vem do
    # fx_to_usd da própria transação (ver loop de replay abaixo).
    asset_keys = list({(t["asset_type"], t["symbol"].upper()) for t in txns})
    non_cash_keys = [k for k in asset_keys if k[0] != "cash"]
    yf_syms = [f"{k[1]}-USD" if k[0] == "crypto" else k[1] for k in non_cash_keys]

    closes_list, spy_closes = await asyncio.gather(
        asyncio.gather(*[asyncio.to_thread(_fetch_closes_sync, s) for s in yf_syms]),
        asyncio.to_thread(_fetch_closes_sync, benchmark_sym),
    )
    closes_map = {k: c for k, c in zip(non_cash_keys, closes_list)}

    # ── 3. replay transactions day by day ────────────────────────────────────
    qty  = {k: 0.0 for k in asset_keys}
    cost = {k: 0.0 for k in asset_keys}
    last_price = {k: 0.0 for k in asset_keys}
    realized = 0.0

    txns_by_day: dict[str, list] = {}
    for t in txns:
        txns_by_day.setdefault(t.get("date", "")[:10], []).append(t)

    series = []
    spy_start_price = None

    for day in days:
        day_iso = day.isoformat()

        for t in txns_by_day.get(day_iso, []):
            key = (t["asset_type"], t["symbol"].upper())
            fx  = float(t.get("fx_to_usd") or 1.0)
            q   = float(t["quantity"])
            p_usd = float(t["price"]) * fx

            if key[0] == "cash":
                # 1 unidade da moeda vale sempre `fx` USD — sem isto, o preço
                # ficava a 0 (ver comentário acima) e a caixa aparecia com
                # -100% de "retorno" em vez do valor real depositado.
                last_price[key] = fx

            if t["type"] == "BUY":
                qty[key]  += q
                cost[key] += q * p_usd + float(t.get("fee", 0)) * fx
            else:
                sell_q = min(q, qty[key])
                if qty[key] > 0:
                    avg = cost[key] / qty[key]
                    realized += sell_q * (p_usd - avg)
                    cost[key] -= avg * sell_q
                qty[key] -= sell_q
                if qty[key] < 1e-9:
                    qty[key] = 0.0
                    cost[key] = 0.0

        # Portfolio value this day
        total_v = 0.0
        total_c = 0.0
        for k in asset_keys:
            if qty[k] <= 0:
                continue
            series_data = closes_map.get(k, {})
            price = series_data.get(day_iso)
            if price is None:
                price = last_price[k]
            else:
                last_price[k] = price
            total_v += qty[k] * (price or 0)
            total_c += cost[k]

        if total_v <= 0:
            continue

        # SPY benchmark value (normalised to portfolio start)
        spy_price = spy_closes.get(day_iso)
        spy_val   = None
        if spy_price:
            if spy_start_price is None:
                spy_start_price = spy_price
            spy_val = (spy_price / spy_start_price) * total_v if spy_start_price else None

        series.append({
            "ts":        day_iso,
            "value":     round(total_v, 2),
            "cost":      round(total_c, 2),
            "benchmark": round(spy_val, 2) if spy_val else None,
        })

    unrealized = series[-1]["value"] - series[-1]["cost"] if series else 0

    metrics           = _compute_metrics(series)
    benchmark_series  = [{"ts": s["ts"], "value": s["benchmark"]} for s in series if s.get("benchmark")]
    benchmark_metrics = _compute_metrics(benchmark_series) if len(benchmark_series) > 1 else {}

    # Retorno simples por classe de ativo (valor atual vs. custo, no fecho da
    # série) — reaproveita os mesmos qty/cost/last_price já calculados acima
    # pela reconstrução dia-a-dia, não é uma segunda passagem pelos dados.
    class_agg: dict[str, dict] = {}
    for k in asset_keys:
        if qty[k] <= 0:
            continue
        cls = k[0]
        agg = class_agg.setdefault(cls, {"value": 0.0, "cost": 0.0})
        agg["value"] += qty[k] * (last_price[k] or 0)
        agg["cost"]  += cost[k]
    class_returns = {
        cls: round((agg["value"] - agg["cost"]) / agg["cost"] * 100, 2)
        for cls, agg in class_agg.items() if agg["cost"] > 0
    }

    result = {
        "series":             series,
        "metrics":            metrics,
        "benchmark_metrics":  benchmark_metrics,
        "benchmark_symbol":   benchmark_sym,
        "class_returns":      class_returns,
        "fees_this_year_usd": round(fees_this_year, 2),
        "fees_all_time_usd":  round(fees_all_time, 2),
        "realized_pnl_usd":   round(realized, 2),
        "unrealized_pnl_usd": round(unrealized, 2),
    }
    _cache_set(cache_key, result)
    return result


# ── Tax report endpoint ───────────────────────────────────────────────────────

@router.get("/analytics/tax-report")
async def get_tax_report(
    user=Depends(get_current_user),
    wallet_id: Optional[str] = Query(None),
):
    """Ganhos/perdas realizados agrupados por ano civil e por ativo (7 jul
    2026 — pedido de "relatório fiscal"). Deliberadamente genérico: cada
    país tem regras de mais-valias diferentes (FIFO vs. custo médio, isenções,
    taxas por prazo de detenção) e mudam todos os anos — NÃO tentamos
    replicar o formulário de nenhuma administração fiscal específica, só
    agregamos os ganhos/perdas já calculados (mesmo custo médio ponderado
    usado em get_analytics acima) por ano em que a venda ocorreu. O
    frontend mostra sempre um aviso fixo (não dispensável) a dizer que isto
    é um ponto de partida, não substitui um contabilista, e que as regras
    variam por país/ano — ver 'settings.backup_subtitle'-style disclaimer
    em I18nContext.jsx (analytics.tax_report_disclaimer).

    Não faz chamadas a yfinance (usa só o preço já gravado em cada
    transação), por isso é rápido e não tem cache TTL como o /analytics.
    """
    wid = wallet_id if wallet_id and wallet_id != "all" else None
    query: dict = {"user_id": user["id"]}
    if wid:
        query["wallet_id"] = wid

    txns = await db.transactions.find(query, {"_id": 0}).to_list(5000)
    txns.sort(key=lambda t: t.get("date", ""))

    qty: dict = {}
    cost: dict = {}
    by_year: dict = {}

    for t in txns:
        key = (t.get("asset_type", "stock"), t["symbol"].upper())
        fx = float(t.get("fx_to_usd") or 1.0)
        q = float(t["quantity"])
        p_usd = float(t["price"]) * fx
        year = (t.get("date") or "")[:4] or "?"

        if t["type"] == "BUY":
            qty[key]  = qty.get(key, 0.0) + q
            cost[key] = cost.get(key, 0.0) + q * p_usd + float(t.get("fee", 0)) * fx
        else:
            held = qty.get(key, 0.0)
            sell_q = min(q, held)
            if held > 0:
                avg = cost[key] / held
                realized = sell_q * (p_usd - avg)
                cost[key] -= avg * sell_q
                yr_bucket = by_year.setdefault(year, {})
                asset_bucket = yr_bucket.setdefault(key, 0.0)
                yr_bucket[key] = asset_bucket + realized
            qty[key] = held - sell_q
            if qty[key] < 1e-9:
                qty[key] = 0.0
                cost[key] = 0.0

    years_out = []
    for year in sorted(by_year.keys(), reverse=True):
        assets = by_year[year]
        total = sum(assets.values())
        by_asset = sorted(
            (
                {"asset_type": k[0], "symbol": k[1], "realized_usd": round(v, 2)}
                for k, v in assets.items()
            ),
            key=lambda a: -a["realized_usd"],
        )
        years_out.append({"year": year, "total_realized_usd": round(total, 2), "by_asset": by_asset})

    return {"years": years_out}


# ── Dividends endpoint ────────────────────────────────────────────────────────

@router.get("/analytics/dividends")
async def get_dividends(
    user=Depends(get_current_user),
    wallet_id: Optional[str] = Query(None),
):
    """Returns dividend info for currently-held equity/ETF assets."""
    wid = wallet_id if wallet_id and wallet_id != "all" else None
    cache_key = f"dividends:{user['id']}:{wid or 'global'}"
    cached = _cache_get(cache_key, ttl=3600)
    if cached:
        return cached

    query: dict = {"user_id": user["id"]}
    if wid:
        query["wallet_id"] = wid

    txns = await db.transactions.find(query, {"_id": 0}).to_list(5000)
    if not txns:
        return {"dividends": [], "total_annual_income": 0, "total_received": 0}

    # Build current quantities per asset
    qty: dict = {}
    first_date: dict = {}
    for t in sorted(txns, key=lambda x: x.get("date", "")):
        key = (t.get("asset_type", "stock"), t["symbol"].upper())
        q = float(t.get("quantity", 0))
        if t["type"] == "BUY":
            qty[key] = qty.get(key, 0.0) + q
            if key not in first_date:
                first_date[key] = t.get("date", "")[:10]
        else:
            qty[key] = max(0.0, qty.get(key, 0.0) - q)

    # Only equities/ETFs/funds with qty > 0
    held = [
        (k, v) for k, v in qty.items()
        if v > 1e-9 and k[0] not in ("crypto", "cash")
    ]
    if not held:
        return {"dividends": [], "total_annual_income": 0, "total_received": 0}

    def _fetch_div(sym: str, qty_held: float, since_iso: str) -> dict | None:
        try:
            import pandas as pd
            ticker = yf.Ticker(sym)
            info = ticker.info or {}

            div_rate  = info.get("dividendRate") or info.get("trailingAnnualDividendRate") or 0
            div_yield = info.get("dividendYield") or info.get("trailingAnnualDividendYield") or 0

            if not div_rate or div_rate <= 0:
                return None

            divs = ticker.dividends
            if divs is None or len(divs) == 0:
                return None

            # Dividends since first purchase
            try:
                since_ts = pd.Timestamp(since_iso, tz="UTC")
                recent   = divs[divs.index >= since_ts]
            except Exception:
                recent = divs[-4:]

            total_received = float(qty_held * recent.sum()) if len(recent) else 0.0

            # Detect frequency from average gap between last payments
            if len(divs) >= 2:
                gaps = [(divs.index[i] - divs.index[i - 1]).days
                        for i in range(max(1, len(divs) - 8), len(divs))]
                avg_gap = sum(gaps) / len(gaps) if gaps else 90
            else:
                avg_gap = 90

            if avg_gap <= 45:
                freq, freq_days = "monthly", 30
            elif avg_gap <= 120:
                freq, freq_days = "quarterly", 91
            elif avg_gap <= 240:
                freq, freq_days = "semi-annual", 182
            else:
                freq, freq_days = "annual", 365

            last_div_date   = divs.index[-1].strftime("%Y-%m-%d") if len(divs) else None
            last_div_amount = float(divs.iloc[-1]) if len(divs) else None

            next_date = None
            if last_div_date:
                from datetime import timedelta
                last_dt  = datetime.strptime(last_div_date, "%Y-%m-%d")
                next_dt  = last_dt + timedelta(days=freq_days)
                next_date = next_dt.strftime("%Y-%m-%d")

            # Extract typical payment months + day from last 2 years of history
            MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
            pay_months: list[str] = []
            pay_month_days: dict = {}
            try:
                cutoff2y = pd.Timestamp.now(tz="UTC") - pd.DateOffset(years=2)
                recent2y = divs[divs.index >= cutoff2y]
                if len(recent2y) > 0:
                    months_seen = sorted(set(d.month for d in recent2y.index))
                    pay_months = [MONTH_ABBR[m - 1] for m in months_seen]
                    # Typical day per month (median of occurrences)
                    day_groups: dict = {}
                    for d in recent2y.index:
                        abbr = MONTH_ABBR[d.month - 1]
                        day_groups.setdefault(abbr, []).append(d.day)
                    pay_month_days = {k: round(sum(v) / len(v)) for k, v in day_groups.items()}
            except Exception:
                pay_months = []
                pay_month_days = {}

            # Trailing 12-month dividend sum — most accurate annual rate
            try:
                cutoff_1y = pd.Timestamp.now(tz="UTC") - pd.DateOffset(years=1)
                divs_1y = divs[divs.index >= cutoff_1y]
                trailing_annual = float(divs_1y.sum()) if len(divs_1y) > 0 else float(div_rate)
            except Exception:
                trailing_annual = float(div_rate)

            freq_per_year = {"monthly": 12, "quarterly": 4, "semi-annual": 2, "annual": 1}.get(freq, 4)
            rate_per_payment = round(trailing_annual / freq_per_year, 4) if trailing_annual else None

            current_price = (
                info.get("regularMarketPrice") or
                info.get("currentPrice") or
                info.get("previousClose") or 0
            )
            if current_price and trailing_annual:
                yield_pct = round(trailing_annual / float(current_price) * 100, 2)
            elif div_yield:
                raw = float(div_yield)
                yield_pct = round((raw if raw <= 0.30 else raw / 100) * 100, 2)
            else:
                yield_pct = None

            # How many years has this asset been paying dividends?
            try:
                first_div_year = divs.index[0].year
                years_paying = pd.Timestamp.now().year - first_div_year
            except Exception:
                years_paying = 0

            return {
                "symbol":           sym,
                "frequency":        freq,
                "yield_pct":        yield_pct,
                "annual_income":    round(float(qty_held) * trailing_annual, 2),
                "rate_per_payment": rate_per_payment,
                "total_received":   round(total_received, 2),
                "last_div_date":    last_div_date,
                "last_div_amount":  last_div_amount,
                "next_est_date":    next_date,
                "pay_months":       pay_months,
                "pay_month_days":   pay_month_days,
                "years_paying":     years_paying,
            }
        except Exception as exc:
            logger.warning(f"Dividend fetch failed for {sym}: {exc}")
            return None

    # Run fetches in thread pool (yfinance is synchronous)
    loop = asyncio.get_event_loop()
    tasks = [
        loop.run_in_executor(None, _fetch_div, sym, qty_held, first_date.get((atype, sym), ""))
        for (atype, sym), qty_held in held
    ]
    results = await asyncio.gather(*tasks)

    dividends = [r for r in results if r is not None]
    dividends.sort(key=lambda x: x.get("annual_income", 0), reverse=True)

    total_annual = round(sum(d.get("annual_income", 0) for d in dividends), 2)
    total_received = round(sum(d.get("total_received", 0) for d in dividends), 2)

    payload = {
        "dividends":          dividends,
        "total_annual_income": total_annual,
        "total_received":     total_received,
    }
    # Correção (16 jul 2026) — cache_set(key, data) não aceita `ttl` (a TTL é
    # aplicada na LEITURA, via _cache_get(cache_key, ttl=3600) na linha ~468).
    # O `ttl=3600` aqui lançava TypeError, fazendo /analytics/dividends dar 500
    # em cada pedido depois de calcular tudo. Removido para casar com o padrão
    # usado no resto do ficheiro (ex.: _cache_set(cache_key, result) na linha ~379).
    _cache_set(cache_key, payload)
    return payload

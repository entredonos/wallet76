import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, TrendingUp, TrendingDown, Plus, Bell, Globe,
  BarChart2, Layers, Coins, ExternalLink, ChevronUp, ChevronDown,
  DollarSign,
} from "lucide-react";
import {
  ComposedChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { api } from "../lib/api";
import { useI18n } from "../context/I18nContext";
import { fmtCurrency, fmtCompact, fmtNum, convert } from "../lib/format";
import AssetIcon from "../components/AssetIcon";
import Candle, { CandleTooltip } from "../components/CandlestickBar";
import { renderDayBoundaries, renderWeekendBands } from "../components/ChartAnnotations";
import { getDayBoundaries, getWeekendBands } from "../lib/chartGaps";
import { CHART_RANGES, CHART_RANGES_SHOW_DATE, CHART_RANGES_DAY_MARKERS, CHART_RANGES_WEEKEND_SHADING } from "../constants/chartRanges";

// ── helpers ──────────────────────────────────────────────────────────────────
const REC_MAP = {
  strong_buy:  { label: "Strong Buy",  cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  buy:         { label: "Buy",         cls: "bg-green-500/20  text-green-300  border-green-500/30"    },
  hold:        { label: "Hold",        cls: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"   },
  sell:        { label: "Sell",        cls: "bg-red-500/20    text-red-300    border-red-500/30"      },
  strong_sell: { label: "Strong Sell", cls: "bg-rose-500/20   text-rose-300   border-rose-500/30"    },
};

const TYPE_INFO = {
  stock:  { label: "Stock",  Icon: TrendingUp, cls: "text-blue-400"    },
  etf:    { label: "ETF",    Icon: Layers,      cls: "text-indigo-400"  },
  fund:   { label: "Fund",   Icon: BarChart2,   cls: "text-purple-400" },
  crypto: { label: "Crypto", Icon: Coins,       cls: "text-amber-400"  },
};

function fmt(v, currency = "USD", fxRates = {}) {
  const usd = v ?? null;
  if (usd === null) return "—";
  return fmtCurrency(convert(usd, currency, fxRates), currency);
}

function fmtCompactX(v, currency = "USD", fxRates = {}) {
  if (v === null || v === undefined) return "—";
  return fmtCompact(convert(v, currency, fxRates), currency);
}

function Stat({ label, value, sub }) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl px-4 py-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{label}</div>
      <div className="text-sm font-mono font-bold text-zinc-100">{value ?? "—"}</div>
      {sub && <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>}
    </div>
  );
}

function RecBar({ dist }) {
  if (!dist) return null;
  const total = (dist.strongBuy + dist.buy + dist.hold + dist.sell + dist.strongSell) || 1;
  const pct = (v) => ((v / total) * 100).toFixed(0);
  const bars = [
    { key: "strongBuy",  label: "Strong Buy",  color: "bg-emerald-500", v: dist.strongBuy },
    { key: "buy",        label: "Buy",         color: "bg-green-500",   v: dist.buy       },
    { key: "hold",       label: "Hold",        color: "bg-yellow-500",  v: dist.hold      },
    { key: "sell",       label: "Sell",        color: "bg-red-400",     v: dist.sell      },
    { key: "strongSell", label: "Strong Sell", color: "bg-rose-600",    v: dist.strongSell},
  ];
  return (
    <div className="space-y-2">
      {/* Stacked bar */}
      <div className="h-2.5 w-full flex rounded-full overflow-hidden gap-px">
        {bars.map(b => b.v > 0 && (
          <div key={b.key} className={`${b.color} transition-all`} style={{ width: `${pct(b.v)}%` }} />
        ))}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {bars.filter(b => b.v > 0).map(b => (
          <div key={b.key} className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400">
            <span className={`w-2 h-2 rounded-sm ${b.color}`} />
            {b.label} <span className="text-zinc-600">({b.v})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AssetDetail({ currency = "USD" }) {
  const { symbol } = useParams();
  const nav = useNavigate();
  const { t } = useI18n();

  const [detail, setDetail] = useState(null);
  const [chart, setChart] = useState([]);
  const [range, setRange] = useState("1d");
  const [coingeckoId, setCoingeckoId] = useState("");
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState(null);

  const fxRates = useMemo(() => ({ USD: 1, EUR: 0.92, CHF: 0.88, BRL: 5.0 }), []);

  // Load asset detail
  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    api.get(`/asset/${symbol}`)
      .then(r => setDetail(r.data))
      .catch(e => setError(e.response?.data?.detail || "Asset not found"))
      .finally(() => setLoading(false));
  }, [symbol]);

  // Crypto needs a CoinGecko id (not just the ticker) for accurate history —
  // look it up from the portfolio/watchlist entry, same as AssetChart.jsx.
  useEffect(() => {
    if (!symbol || detail?.asset_type !== "crypto") return;
    (async () => {
      try {
        const { data: p } = await api.get("/portfolio");
        const found = (p.assets || []).find((a) => a.symbol.toUpperCase() === symbol.toUpperCase() && a.asset_type === "crypto");
        if (found?.coingecko_id) { setCoingeckoId(found.coingecko_id); return; }
        const { data: wl } = await api.get("/watchlists");
        const w = (wl || []).find((x) => x.symbol.toUpperCase() === symbol.toUpperCase() && x.asset_type === "crypto");
        if (w?.coingecko_id) setCoingeckoId(w.coingecko_id);
      } catch { /* falls back to symbol-based lookup server-side */ }
    })();
  }, [symbol, detail?.asset_type]);

  // Load chart data — same endpoint, same range tokens (5m/15m/.../all) as
  // every other price chart in the app.
  useEffect(() => {
    if (!symbol || !detail?.asset_type) return;
    let cancelled = false;
    setChartLoading(true);
    api.get("/asset/history", { params: { symbol, asset_type: detail.asset_type, coingecko_id: coingeckoId, range } })
      .then(r => { if (!cancelled) setChart(r.data || []); })
      .catch(() => { if (!cancelled) setChart([]); })
      .finally(() => { if (!cancelled) setChartLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, detail?.asset_type, coingeckoId, range]);

  // Candles carry o/h/l/c — YAxis must fit the full high/low range.
  const chartYDomain = useMemo(() => {
    if (!chart.length) return ["auto", "auto"];
    const highs = chart.map((d) => d.h ?? d.c);
    const lows = chart.map((d) => d.l ?? d.c);
    const max = Math.max(...highs);
    const min = Math.min(...lows);
    const pad = (max - min) * 0.08 || max * 0.01 || 1;
    return [min - pad, max + pad];
  }, [chart]);

  // Day boundaries, detected straight from timestamps — no calendar needed.
  // Gated by range: on 1D-or-coarser ranges every candle already starts its
  // own day, so the marker would draw on every single candle — meaningless,
  // and on wide ranges (many candles, e.g. "ALL") heavy enough to visibly
  // lag the chart on hover (Recharts re-renders every marker on each move).
  const chartDayBoundaries = useMemo(
    () => (CHART_RANGES_DAY_MARKERS.has(range) ? getDayBoundaries(chart, "t") : []),
    [chart, range]
  );

  // Crypto trades 24/7, so its chart legitimately has weekend candles —
  // tint them instead of stripping (stocks/ETFs never have weekend rows to
  // begin with: Yahoo simply doesn't return data for closed-market days).
  // Also gated by range — meaningless once a candle already spans a week+.
  const chartWeekendBands = useMemo(
    () => (detail?.asset_type === "crypto" && CHART_RANGES_WEEKEND_SHADING.has(range) ? getWeekendBands(chart, "t") : []),
    [chart, detail?.asset_type, range]
  );

  const rec = detail?.analyst?.recommendation;
  const recStyle = REC_MAP[rec] || null;
  const typeInfo = TYPE_INFO[detail?.asset_type] || TYPE_INFO.stock;

  const pos = detail?.position;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh] text-zinc-600 text-sm font-mono">
      <div className="animate-pulse">Loading…</div>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="text-zinc-500 font-mono text-sm">{error}</div>
      <button onClick={() => nav(-1)} className="text-blue-400 text-sm hover:underline flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
    </div>
  );

  const price = detail?.price;
  const change = detail?.change;
  const changePct = detail?.change_pct;
  const isUp = (changePct ?? 0) >= 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* ── Back + breadcrumb ─────────────────────────────────────── */}
      <button onClick={() => nav(-1)} className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
        <ArrowLeft className="w-4 h-4" />
        {t("common.back") || "Back"}
      </button>

      {/* ── Header card ───────────────────────────────────────────── */}
      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Left: name + type */}
          <div className="flex items-start gap-4">
            {detail && (
              <AssetIcon
                asset={{ symbol: detail.symbol, asset_type: detail.asset_type }}
                size={52}
                rounded="rounded-xl"
              />
            )}
            <div>
            <div className="flex items-center gap-3 mb-1">
              <typeInfo.Icon className={`w-4 h-4 ${typeInfo.cls}`} />
              <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">{typeInfo.label}</span>
              {detail?.exchange && (
                <span className="text-xs font-mono text-zinc-700">· {detail.exchange}</span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-zinc-100">{detail?.name}</h1>
            <div className="text-sm font-mono text-zinc-500 mt-0.5">{symbol}</div>
            {detail?.sector && (
              <div className="text-xs text-zinc-600 mt-1">{detail.sector}{detail.industry ? ` · ${detail.industry}` : ""}</div>
            )}
            </div>{/* /name info */}
          </div>{/* /logo + name wrapper */}

          {/* Right: price + actions */}
          <div className="sm:text-right">
            <div className="text-3xl font-mono font-bold text-zinc-100">
              {price ? fmt(price, currency, fxRates) : "—"}
            </div>
            <div className={`flex sm:justify-end items-center gap-1 mt-1 text-sm font-mono ${isUp ? "text-emerald-400" : "text-red-400"}`}>
              {isUp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {change ? fmt(Math.abs(change), currency, fxRates) : "—"}
              {changePct != null && ` (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%)`}
            </div>

            <div className="flex sm:justify-end gap-2 mt-3">
              <Link
                to={`/transactions?prefill=${symbol}&type=${detail?.asset_type}${price ? `&price=${price}` : ""}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {t("asset.add_transaction") || "Add to portfolio"}
              </Link>
              <Link
                to={`/alerts?prefill=${symbol}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono transition-colors"
              >
                <Bell className="w-3.5 h-3.5" />
                {t("asset.set_alert") || "Alert"}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── My Position (only if held) ────────────────────────────── */}
      {pos && (
        <div className="bg-zinc-900/40 border border-blue-500/20 rounded-2xl p-5">
          <div className="text-xs font-mono uppercase tracking-widest text-blue-400 mb-3">
            {t("asset.my_position") || "My Position"}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label={t("asset.quantity") || "Quantity"}   value={fmtNum(pos.quantity)} />
            <Stat label={t("asset.avg_cost")  || "Avg Cost"}  value={fmt(pos.avg_cost_usd, currency, fxRates)} />
            <Stat label={t("asset.value")     || "Value"}     value={fmtCompactX(pos.value_usd, currency, fxRates)} />
            <Stat
              label={t("asset.pnl") || "P&L"}
              value={
                <span className={pos.pnl_usd >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {fmt(Math.abs(pos.pnl_usd), currency, fxRates)}
                </span>
              }
              sub={`${pos.pnl_pct >= 0 ? "+" : ""}${pos.pnl_pct.toFixed(2)}%`}
            />
          </div>
        </div>
      )}

      {/* ── Chart ─────────────────────────────────────────────────── */}
      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-mono text-zinc-400">{t("asset.price_chart") || "Price Chart"}</div>
          <div className="flex flex-wrap gap-1">
            {CHART_RANGES.map(r => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
                  range === r.value
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-600 hover:text-zinc-400"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-52 sm:h-64">
          {chartLoading ? (
            <div className="h-full flex items-center justify-center text-zinc-700 text-xs font-mono animate-pulse">
              Loading chart…
            </div>
          ) : chart.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="t"
                  type="category"
                  tickFormatter={v => {
                    try {
                      // Tick mais à direita = candle mais recente ("agora") —
                      // mostrar "Hoje" em vez da data de início do seu
                      // bucket, que em ranges largos (1M/1Y) pode ficar
                      // meses/anos no passado.
                      const isLastTick = chart.length > 0 && v === chart[chart.length - 1].t;
                      if (isLastTick && CHART_RANGES_SHOW_DATE.has(range)) {
                        return t("common.today");
                      }
                      const d = new Date(v);
                      if (range === "1y" || range === "all")
                        return d.toLocaleDateString([], { month: "short", year: "2-digit" });
                      // Ano incluído também em 1w/1m/1d: a regra dos 70
                      // candles permite estes ranges cruzarem mais de um ano,
                      // e sem o ano duas datas iguais em anos diferentes
                      // ficam indistinguíveis no eixo.
                      if (CHART_RANGES_SHOW_DATE.has(range))
                        return d.toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" });
                      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    } catch { return v; }
                  }}
                  tick={{ fill: "#52525b", fontSize: 10, fontFamily: "JetBrains Mono" }}
                  axisLine={false} tickLine={false}
                  minTickGap={CHART_RANGES_SHOW_DATE.has(range) ? 80 : 50}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={chartYDomain}
                  tickFormatter={v => fmtCompact(v)}
                  tick={{ fill: "#52525b", fontSize: 10, fontFamily: "JetBrains Mono" }}
                  axisLine={false} tickLine={false} width={60}
                />
                <Tooltip content={<CandleTooltip formatValue={(v) => fmt(v, currency, fxRates)} />} />
                {renderWeekendBands(chartWeekendBands)}
                {renderDayBoundaries(chartDayBoundaries)}
                <Bar dataKey={(d) => [d.l ?? d.c, d.h ?? d.c]} shape={<Candle />} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-700 text-xs font-mono">
              No chart data
            </div>
          )}
        </div>
      </div>

      {/* ── Key Metrics ───────────────────────────────────────────── */}
      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-5">
        <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-4">
          {t("asset.key_metrics") || "Key Metrics"}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <Stat label={t("asset.market_cap")   || "Market Cap"}    value={fmtCompactX(detail?.market_cap, currency, fxRates)} />
          <Stat label={t("asset.volume")        || "Volume"}        value={detail?.volume ? fmtCompact(detail.volume) : "—"} />
          <Stat label={t("asset.avg_volume")    || "Avg Volume"}    value={detail?.avg_volume ? fmtCompact(detail.avg_volume) : "—"} />
          <Stat label="52W High"                                     value={fmt(detail?.week_52_high, currency, fxRates)} />
          <Stat label="52W Low"                                      value={fmt(detail?.week_52_low, currency, fxRates)} />
          <Stat label={t("asset.open")          || "Open"}          value={fmt(detail?.open, currency, fxRates)} />
          <Stat label={t("asset.day_high")      || "Day High"}      value={fmt(detail?.day_high, currency, fxRates)} />
          <Stat label={t("asset.day_low")       || "Day Low"}       value={fmt(detail?.day_low, currency, fxRates)} />
          {detail?.pe_ratio    != null && <Stat label="P/E"          value={detail.pe_ratio.toFixed(2)} />}
          {detail?.forward_pe  != null && <Stat label="Fwd P/E"      value={detail.forward_pe.toFixed(2)} />}
          {detail?.eps         != null && <Stat label="EPS"          value={fmt(detail.eps, currency, fxRates)} />}
          {detail?.dividend_yield != null && !detail?.div_yield_trailing && (
            <Stat label={t("asset.dividend") || "Dividend Yield"} value={`${(detail.dividend_yield * 100).toFixed(2)}%`} />
          )}
          {detail?.beta        != null && <Stat label="Beta"         value={detail.beta.toFixed(2)} />}
        </div>
      </div>

      {/* ── Dividends card ────────────────────────────────────────── */}
      {detail?.div_yield_trailing != null && (
        <div className="bg-zinc-900/40 border border-emerald-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <div className="text-xs font-mono uppercase tracking-widest text-emerald-400">
              {t("asset.dividends") || "Dividends"}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Yield */}
            <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl px-4 py-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">
                {t("asset.dividend") || "Yield"}
              </div>
              <div className="text-lg font-mono font-bold text-emerald-400">
                {detail.div_yield_trailing.toFixed(2)}%
              </div>
              <div className="text-[10px] text-zinc-600 mt-0.5">trailing 12m</div>
            </div>

            {/* Frequency */}
            {detail.div_frequency && (() => {
              const FREQ_CFG = {
                "monthly":    { label: t("analytics.dividends_freq_monthly")    || "Monthly",    cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
                "quarterly":  { label: t("analytics.dividends_freq_quarterly")  || "Quarterly",  cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
                "semi-annual":{ label: t("analytics.dividends_freq_semiannual") || "Semi-annual", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
                "annual":     { label: t("analytics.dividends_freq_annual")     || "Annual",     cls: "bg-zinc-700/40 text-zinc-400 border-zinc-600/40" },
              };
              const fc = FREQ_CFG[detail.div_frequency] || { label: detail.div_frequency, cls: "bg-zinc-700/40 text-zinc-400 border-zinc-600/40" };
              return (
                <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl px-4 py-3">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">
                    {t("asset.div_frequency") || "Frequency"}
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-mono font-medium border ${fc.cls}`}>
                    {fc.label}
                  </span>
                  {detail.div_rate_per_payment != null && (
                    <div className="text-[10px] text-zinc-600 mt-1.5">
                      {t("asset.div_per_payment") || "Per payment"}: ${detail.div_rate_per_payment.toFixed(4)}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Payment months */}
            {detail.div_pay_months?.length > 0 && (
              <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl px-4 py-3 col-span-2 sm:col-span-1">
                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
                  {t("asset.div_pay_months") || "Payment months"}
                </div>
                <div className="flex flex-wrap gap-1">
                  {detail.div_pay_months.map((m) => {
                    const day = detail.div_pay_month_days?.[m];
                    return (
                      <span
                        key={m}
                        className="inline-flex flex-col items-center px-1.5 py-0.5 rounded bg-zinc-800/60 border border-zinc-700/50"
                        style={{ minWidth: 28 }}
                      >
                        <span className="text-[10px] text-zinc-400 leading-tight">{m}</span>
                        {day && <span className="text-[9px] text-zinc-600 leading-tight">{day}</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Analyst Recommendations ───────────────────────────────── */}
      {/* -- Analyst Recommendations ---------------------------------------- */}
      {detail?.analyst?.n_analysts > 0 && (
        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-5">
          <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-4">
            {t("asset.analyst_rec") || "Analyst Recommendations"}
          </div>

          <div className="flex flex-col sm:flex-row gap-6">
            {/* Consensus badge + score */}
            <div className="flex flex-col items-center justify-center gap-2 min-w-[120px]">
              {recStyle && (
                <span className={`px-3 py-1.5 rounded-lg text-sm font-mono font-bold border ${recStyle.cls}`}>
                  {recStyle.label}
                </span>
              )}
              {detail.analyst.mean_score != null && (
                <div className="text-xs text-zinc-600 font-mono">
                  {t("asset.mean_score") || "Score"}: {detail.analyst.mean_score.toFixed(1)}/5
                </div>
              )}
              <div className="text-xs text-zinc-600">
                {detail.analyst.n_analysts} {t("asset.analysts") || "analysts"}
              </div>
            </div>

            {/* Target prices */}
            <div className="flex-1 space-y-3">
              {(detail.analyst.target_mean || detail.analyst.target_high || detail.analyst.target_low) && (
                <div className="grid grid-cols-3 gap-2">
                  <Stat label={t("asset.target_low")  || "Target Low"}  value={fmt(detail.analyst.target_low,  currency, fxRates)} />
                  <Stat label={t("asset.target_mean") || "Target Avg"}  value={fmt(detail.analyst.target_mean, currency, fxRates)}
                    sub={price && detail.analyst.target_mean
                      ? `${detail.analyst.target_mean >= price ? "+" : ""}${Math.abs((detail.analyst.target_mean - price) / price * 100).toFixed(1)}% vs now`
                      : undefined
                    }
                  />
                  <Stat label={t("asset.target_high") || "Target High"} value={fmt(detail.analyst.target_high, currency, fxRates)} />
                </div>
              )}
              {detail.analyst.distribution && <RecBar dist={detail.analyst.distribution} />}
            </div>
          </div>

          {/* Recent upgrades/downgrades */}
          {detail.analyst.upgrades?.length > 0 && (
            <div className="mt-5">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-2">
                {t("asset.recent_ratings") || "Recent Ratings"}
              </div>
              <div className="space-y-1.5">
                {detail.analyst.upgrades.map((u, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs font-mono text-zinc-400">
                    <span className="text-zinc-600 shrink-0">{u.date}</span>
                    <span className="font-bold text-zinc-300 shrink-0">{u.firm}</span>
                    {u.from_grade && <span className="text-zinc-600">{u.from_grade} &rarr;</span>}
                    <span className={
                      (u.action || "").toLowerCase().includes("up") ? "text-emerald-400" :
                      (u.action || "").toLowerCase().includes("down") ? "text-red-400" : "text-zinc-300"
                    }>{u.to_grade}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* -- About ------------------------------------------------------------- */}
      {detail?.description && (
        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-5">
          <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-3">
            {t("asset.about") || "About"}
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">{detail.description}</p>
          {detail.website && (
            <a
              href={detail.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 mt-3 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              <Globe className="w-3 h-3" /> {detail.website}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

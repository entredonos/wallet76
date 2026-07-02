import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ResponsiveContainer, ComposedChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { getDayBoundaries, getWeekendBands } from "../lib/chartGaps";
import { renderDayBoundaries, renderWeekendBands } from "../components/ChartAnnotations";
import { ArrowLeft, ArrowUp, ArrowDown, Bell, ShoppingCart, TrendingUp, Layers, Coins, BarChart2 } from "lucide-react";
import AssetIcon from "../components/AssetIcon";
import Candle, { CandleTooltip } from "../components/CandlestickBar";
import { fmtCurrency, fmtPct, curSymbol, convert, fmtCompact } from "../lib/format";
import { useI18n } from "../context/I18nContext";
import { CHART_RANGES as RANGES, CHART_RANGES_SHOW_DATE as SHOW_DATE_RANGES, CHART_RANGES_DAY_MARKERS, CHART_RANGES_WEEKEND_SHADING } from "../constants/chartRanges";

function Stat({ label, value, sub }) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl px-4 py-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{label}</div>
      <div className="text-sm font-mono font-bold text-zinc-100">{value ?? "—"}</div>
      {sub && <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>}
    </div>
  );
}

const REC_MAP = {
  strong_buy:  { label: "Strong Buy",  cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  buy:         { label: "Buy",         cls: "bg-green-500/20  text-green-300  border-green-500/30"    },
  hold:        { label: "Hold",        cls: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"   },
  sell:        { label: "Sell",        cls: "bg-red-500/20    text-red-300    border-red-500/30"      },
  strong_sell: { label: "Strong Sell", cls: "bg-rose-500/20   text-rose-300   border-rose-500/30"    },
};

export default function AssetChart({ currency }) {
  const { assetType, symbol } = useParams();
  const nav = useNavigate();
  const { t } = useI18n();
  const [range, setRange] = useState("1d");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [portfolioInfo, setPortfolioInfo] = useState(null);
  const [coingeckoId, setCoingeckoId] = useState("");
  const [detail, setDetail] = useState(null);

  // Portfolio context
  useEffect(() => {
    (async () => {
      try {
        const { data: p } = await api.get("/portfolio");
        const found = (p.assets || []).find(
          (a) => a.symbol.toUpperCase() === symbol?.toUpperCase() && a.asset_type === assetType
        );
        if (found) { setPortfolioInfo(found); setCoingeckoId(found.coingecko_id || ""); return; }
        const { data: wl } = await api.get("/watchlists");
        const w = (wl || []).find(
          (x) => x.symbol.toUpperCase() === symbol?.toUpperCase() && x.asset_type === assetType
        );
        if (w?.coingecko_id) setCoingeckoId(w.coingecko_id);
        if (w) setPortfolioInfo({ symbol: w.symbol, name: w.name, asset_type: w.asset_type, price_usd: w.price_usd });
      } catch {}
    })();
  }, [symbol, assetType]);

  // Key metrics + analyst data
  useEffect(() => {
    if (!symbol) return;
    api.get(`/asset/${symbol.toUpperCase()}`)
      .then(r => setDetail(r.data))
      .catch(() => {});
  }, [symbol]);

  // Chart data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: pts } = await api.get("/asset/history", {
          params: { symbol, asset_type: assetType, coingecko_id: coingeckoId, range },
        });
        if (!cancelled) setData(pts || []);
      } catch { if (!cancelled) setData([]); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [symbol, assetType, coingeckoId, range]);

  const minMax = useMemo(() => {
    if (!data.length) return { change: 0, changePct: 0 };
    const change = data[data.length - 1].p - data[0].p;
    const changePct = data[0].p ? (change / data[0].p) * 100 : 0;
    return { change, changePct };
  }, [data]);

  const positive = minMax.change >= 0;
  const sym = curSymbol(currency);
  const fxRates = useMemo(() => ({ USD: 1, EUR: 0.92, CHF: 0.88, BRL: 5.0 }), []);
  const currentPrice = data.length ? data[data.length - 1].p : (portfolioInfo?.price_usd || 0);

  // Candles carry o/h/l/c — YAxis must fit the full high/low range, not just close.
  const yDomain = useMemo(() => {
    if (!data.length) return ["auto", "auto"];
    const highs = data.map((d) => d.h ?? d.p);
    const lows = data.map((d) => d.l ?? d.p);
    const max = Math.max(...highs);
    const min = Math.min(...lows);
    const pad = (max - min) * 0.08 || max * 0.01 || 1;
    return [min - pad, max + pad];
  }, [data]);

  // Day boundaries (new day, including overnight/weekend closes) computed
  // straight from the data's own timestamps, no calendar needed. Gated by
  // range: on 1D-or-coarser ranges every candle already starts its own day,
  // so the marker would draw on every single candle — meaningless, and on
  // wide ranges (many candles) heavy enough to visibly lag the chart on
  // hover (Recharts re-renders every marker on each mouse move).
  const dayBoundaries = useMemo(
    () => (CHART_RANGES_DAY_MARKERS.has(range) ? getDayBoundaries(data, "t") : []),
    [data, range]
  );

  // Crypto trades 24/7, so its chart legitimately has weekend candles —
  // tint them instead of stripping (stocks/ETFs never have weekend rows to
  // begin with: Yahoo simply doesn't return data for closed-market days).
  // Also gated by range — meaningless once a candle already spans a week+.
  const weekendBands = useMemo(
    () => (assetType === "crypto" && CHART_RANGES_WEEKEND_SHADING.has(range) ? getWeekendBands(data, "t") : []),
    [data, assetType, range]
  );

  // X-axis: sub-hour/hour candles → HH:MM; 4h → "Jan 5 14:00"; daily+ → date only
  const tickFmt = (ts) => {
    try {
      // Tick mais à direita = candle mais recente ("agora") — mostrar "Hoje"
      // em vez da data de início do seu bucket, que em ranges largos (1M/1Y)
      // pode ficar meses/anos no passado.
      const isLastTick = data.length > 0 && ts === data[data.length - 1].t;
      if (isLastTick && range !== "15m" && range !== "30m" && range !== "1h") {
        return t("common.today");
      }
      const d = new Date(ts);
      if (range === "1y" || range === "all")
        return d.toLocaleDateString([], { month: "short", year: "2-digit" });
      // Ano incluído em 1m/1w também: a regra dos 70 candles permite estes
      // ranges cruzarem mais de um ano (ex. "1W" = até 70 semanas), e sem o
      // ano "18 Dez" no início e "18 Dez" um ano depois ficam idênticos.
      if (range === "1m" || range === "1w" || range === "1d")
        return d.toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" });
      if (range === "4h")
        return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " +
               d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  };

  const pos = portfolioInfo && Number(portfolioInfo.quantity) > 0 ? portfolioInfo : null;

  const TypeIcon = assetType === "crypto" ? Coins :
                   assetType === "etf"    ? Layers :
                   assetType === "fund"   ? BarChart2 : TrendingUp;
  const typeColor = assetType === "crypto" ? "text-amber-400" :
                    assetType === "etf"    ? "text-indigo-400" :
                    assetType === "fund"   ? "text-purple-400" : "text-blue-400";

  return (
    <div className="space-y-6 fade-in max-w-4xl mx-auto">

      {/* Back */}
      <button onClick={() => nav(-1)} className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
        <ArrowLeft className="w-4 h-4" /> {t("common.back") || "Back"}
      </button>

      {/* Header */}
      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <AssetIcon asset={{ asset_type: assetType, symbol, coingecko_id: coingeckoId }} size={48} rounded="rounded-xl" />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <TypeIcon className={`w-4 h-4 ${typeColor}`} />
                <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">{assetType}</span>
              </div>
              <h1 className="text-2xl font-bold text-zinc-100">
                {detail?.name || portfolioInfo?.name || symbol?.toUpperCase()}
              </h1>
              <div className="text-sm font-mono text-zinc-500 mt-0.5">{symbol?.toUpperCase()}</div>
              {detail?.sector && (
                <div className="text-xs text-zinc-600 mt-1">
                  {detail.sector}{detail.industry ? ` · ${detail.industry}` : ""}
                </div>
              )}
            </div>
          </div>

          <div className="sm:text-right">
            <div className="text-3xl font-mono font-bold text-zinc-100">
              {fmtCurrency(convert(currentPrice, currency, fxRates), currency)}
            </div>
            <div className={`flex sm:justify-end items-center gap-1 mt-1 text-sm font-mono ${positive ? "text-emerald-400" : "text-rose-400"}`}>
              {positive ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
              {fmtCurrency(Math.abs(minMax.change), "USD")} ({fmtPct(minMax.changePct)})
            </div>
            <div className="flex sm:justify-end gap-2 mt-3">
              <Link
                to={`/transactions?prefill=${symbol}&type=${assetType}${currentPrice ? `&price=${currentPrice}` : ""}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono transition-colors"
              >
                <ShoppingCart className="w-3.5 h-3.5" /> {t("common.buy")} / {t("common.sell")}
              </Link>
              <Link
                to={`/alerts?prefill=${symbol}&type=${assetType}${currentPrice ? `&price=${currentPrice}` : ""}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono transition-colors"
              >
                <Bell className="w-3.5 h-3.5" /> {t("common.alerts") || "Alert"}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* My Position */}
      {pos && (
        <div className="bg-zinc-900/40 border border-blue-500/20 rounded-2xl p-5">
          <div className="text-xs font-mono uppercase tracking-widest text-blue-400 mb-3">
            {t("asset.my_position") || "My Position"}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label={t("asset.quantity") || "Quantity"} value={Number(pos.quantity).toLocaleString()} />
            <Stat label={t("asset.avg_cost") || "Avg Cost"}
              value={pos.avg_cost_usd ? fmtCurrency(convert(pos.avg_cost_usd, currency, fxRates), currency) : "\u2014"} />
            <Stat label={t("asset.value") || "Value"}
              value={pos.value_usd ? fmtCurrency(convert(pos.value_usd, currency, fxRates), currency) : "\u2014"} />
            <Stat
              label={t("asset.pnl") || "P&L"}
              value={pos.pnl_usd != null ? (
                <span className={pos.pnl_usd >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {fmtCurrency(convert(Math.abs(pos.pnl_usd), currency, fxRates), currency)}
                </span>
              ) : "\u2014"}
              sub={pos.pnl_pct != null ? `${pos.pnl_pct >= 0 ? "+" : ""}${Number(pos.pnl_pct).toFixed(2)}%` : undefined}
            />
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="text-sm font-mono text-zinc-400">{t("asset.price_chart") || "Price Chart"}</div>
          <div className="flex flex-wrap border border-zinc-800 rounded-md overflow-hidden" data-testid="asset-range-selector">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`px-2.5 py-1 text-xs font-mono transition-colors ${range === r.value ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"}`}
                data-testid={`asset-range-${r.value}`}
              >{r.label}</button>
            ))}
          </div>
        </div>
        <div className="h-72 sm:h-80" data-testid="asset-chart">
          {loading ? (
            <div className="h-full flex items-center justify-center text-zinc-500 font-mono text-sm animate-pulse">
              {t("common.loading")}
            </div>
          ) : data.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t" type="category"
                  tickFormatter={tickFmt}
                  minTickGap={SHOW_DATE_RANGES.has(range) ? 80 : 50}
                  interval="preserveStartEnd"
                  tick={{ fill: "#52525b", fontSize: 10, fontFamily: "JetBrains Mono" }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  domain={yDomain}
                  tickFormatter={(v) => `${sym}${v >= 1000 ? (v/1000).toFixed(1)+"K" : v.toFixed(2)}`}
                  tick={{ fill: "#52525b", fontSize: 10, fontFamily: "JetBrains Mono" }}
                  axisLine={false} tickLine={false} width={68}
                />
                <Tooltip content={<CandleTooltip formatValue={(v) => fmtCurrency(v, "USD")} />} />
                {renderWeekendBands(weekendBands)}
                {renderDayBoundaries(dayBoundaries)}
                <Bar dataKey={(d) => [d.l ?? d.p, d.h ?? d.p]} shape={<Candle />} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-600 font-mono text-sm">
              {t("common.no_data")}
            </div>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      {detail && (
        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-5">
          <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-4">
            {t("asset.key_metrics") || "Key Metrics"}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {detail.market_cap   && <Stat label="Market Cap" value={fmtCompact(convert(detail.market_cap, currency, fxRates), currency)} />}
            {detail.volume       && <Stat label="Volume"     value={fmtCompact(detail.volume)} />}
            {detail.avg_volume   && <Stat label="Avg Volume" value={fmtCompact(detail.avg_volume)} />}
            {detail.week_52_high && <Stat label="52W High"   value={fmtCurrency(convert(detail.week_52_high, currency, fxRates), currency)} />}
            {detail.week_52_low  && <Stat label="52W Low"    value={fmtCurrency(convert(detail.week_52_low,  currency, fxRates), currency)} />}
            {detail.open         && <Stat label="Open"       value={fmtCurrency(convert(detail.open,         currency, fxRates), currency)} />}
            {detail.day_high     && <Stat label="Day High"   value={fmtCurrency(convert(detail.day_high,     currency, fxRates), currency)} />}
            {detail.day_low      && <Stat label="Day Low"    value={fmtCurrency(convert(detail.day_low,      currency, fxRates), currency)} />}
            {detail.pe_ratio    != null && <Stat label="P/E"      value={detail.pe_ratio.toFixed(2)} />}
            {detail.forward_pe  != null && <Stat label="Fwd P/E"  value={detail.forward_pe.toFixed(2)} />}
            {detail.eps         != null && <Stat label="EPS"      value={fmtCurrency(detail.eps, "USD")} />}
            {detail.dividend_yield != null && <Stat label="Dividend" value={`${(detail.dividend_yield*100).toFixed(2)}%`} />}
            {detail.beta        != null && <Stat label="Beta"     value={detail.beta.toFixed(2)} />}
          </div>
        </div>
      )}

      {/* Analyst */}
      {detail?.analyst?.n_analysts > 0 && (() => {
        const rec = detail.analyst.recommendation;
        const recStyle = REC_MAP[rec];
        return (
          <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-5">
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-4">
              {t("asset.analyst_rec") || "Analyst Recommendations"}
            </div>
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="flex flex-col items-center justify-center gap-2 min-w-[120px]">
                {recStyle && (
                  <span className={`px-3 py-1.5 rounded-lg text-sm font-mono font-bold border ${recStyle.cls}`}>
                    {recStyle.label}
                  </span>
                )}
                <div className="text-xs text-zinc-600">{detail.analyst.n_analysts} analysts</div>
              </div>
              {(detail.analyst.target_mean || detail.analyst.target_low || detail.analyst.target_high) && (
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <Stat label="Target Low"  value={detail.analyst.target_low  ? fmtCurrency(detail.analyst.target_low,  "USD") : "\u2014"} />
                  <Stat label="Target Avg"  value={detail.analyst.target_mean ? fmtCurrency(detail.analyst.target_mean, "USD") : "\u2014"}
                    sub={currentPrice && detail.analyst.target_mean
                      ? `${detail.analyst.target_mean >= currentPrice ? "\u2191" : "\u2193"} ${Math.abs((detail.analyst.target_mean-currentPrice)/currentPrice*100).toFixed(1)}% vs now`
                      : undefined}
                  />
                  <Stat label="Target High" value={detail.analyst.target_high ? fmtCurrency(detail.analyst.target_high, "USD") : "\u2014"} />
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* About */}
      {detail?.description && (
        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-5">
          <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-3">
            {t("asset.about") || "About"}
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">{detail.description}</p>
        </div>
      )}
    </div>
  );
}

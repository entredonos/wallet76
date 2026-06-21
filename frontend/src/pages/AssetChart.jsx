import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { ArrowLeft, ArrowUp, ArrowDown, Bell, ShoppingCart } from "lucide-react";
import AssetIcon from "../components/AssetIcon";
import { fmtCurrency, fmtPct, curSymbol, convert } from "../lib/format";
import { useI18n } from "../context/I18nContext";

const RANGES = [
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "30m", label: "30m" },
  { value: "1h", label: "1h" },
  { value: "2h", label: "2h" },
  { value: "4h", label: "4h" },
  { value: "1d", label: "1D" },
  { value: "1w", label: "1W" },
  { value: "1m", label: "1M" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "ALL" },
];

export default function AssetChart({ currency }) {
  const { assetType, symbol } = useParams();
  const nav = useNavigate();
  const { t } = useI18n();
  const [range, setRange] = useState("1d");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [portfolioInfo, setPortfolioInfo] = useState(null);
  const [coingeckoId, setCoingeckoId] = useState("");

  // Try to find this asset in user's portfolio for context
  useEffect(() => {
    (async () => {
      try {
        const { data: p } = await api.get("/portfolio");
        const found = (p.assets || []).find((a) => a.symbol.toUpperCase() === symbol?.toUpperCase() && a.asset_type === assetType);
        if (found) {
          setPortfolioInfo(found);
          setCoingeckoId(found.coingecko_id || "");
        } else {
          // try watchlists
          const { data: wl } = await api.get("/watchlists");
          const w = (wl || []).find((x) => x.symbol.toUpperCase() === symbol?.toUpperCase() && x.asset_type === assetType);
          if (w?.coingecko_id) setCoingeckoId(w.coingecko_id);
          if (w) setPortfolioInfo({ symbol: w.symbol, name: w.name, asset_type: w.asset_type, price_usd: w.price_usd, change_24h: w.change_24h });
        }
      } catch {}
    })();
  }, [symbol, assetType]);

  // Load chart data
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
    if (!data.length) return { min: 0, max: 0, change: 0, changePct: 0 };
    const prices = data.map((d) => d.p);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const change = data[data.length - 1].p - data[0].p;
    const changePct = data[0].p ? (change / data[0].p) * 100 : 0;
    return { min, max, change, changePct };
  }, [data]);

  const positive = minMax.change >= 0;
  const stroke = positive ? "#10b981" : "#ef4444";
  const sym = curSymbol(currency);
  const currentPrice = data.length ? data[data.length - 1].p : (portfolioInfo?.price_usd || 0);

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="p-2 border border-zinc-800 rounded-md text-zinc-300 hover:bg-zinc-800" data-testid="back-btn">
          <ArrowLeft className="w-4 h-4"/>
        </button>
        <AssetIcon asset={{ asset_type: assetType, symbol, coingecko_id: coingeckoId }} size={40}/>
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h1 className="font-display text-3xl text-zinc-100">{symbol?.toUpperCase()}</h1>
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-500">{assetType}</span>
          </div>
          <div className="text-sm text-zinc-500">{portfolioInfo?.name || ""}</div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link to={`/transactions?sell=${symbol}&type=${assetType}`}>
            <Button variant="outline" size="sm" className="bg-zinc-900/50 border-zinc-800 text-zinc-300" data-testid="asset-sell-btn">
              <ShoppingCart className="w-4 h-4 mr-1"/> {t("common.buy")} / {t("common.sell")}
            </Button>
          </Link>
          <Link to="/alerts">
            <Button variant="outline" size="sm" className="bg-zinc-900/50 border-zinc-800 text-zinc-300" data-testid="asset-alert-btn">
              <Bell className="w-4 h-4 mr-1"/> {t("common.alerts")}
            </Button>
          </Link>
        </div>
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-500">{sym} USD</div>
            <div className="font-mono text-3xl text-zinc-50 mt-1">{fmtCurrency(convert(currentPrice, currency, { EUR: 0.92, CHF: 0.88 }), currency)}</div>
            <div className={`text-sm font-mono mt-1 ${positive ? "text-emerald-400" : "text-rose-400"}`}>
              {positive ? <ArrowUp className="inline w-3 h-3"/> : <ArrowDown className="inline w-3 h-3"/>} {fmtCurrency(minMax.change, currency)} ({fmtPct(minMax.changePct)})
            </div>
          </div>
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
        <div className="h-80" data-testid="asset-chart">
          {loading ? (
            <div className="h-full flex items-center justify-center text-zinc-500 font-mono text-sm">{t("common.loading")}</div>
          ) : data.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="assetGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stroke} stopOpacity={0.35}/>
                    <stop offset="100%" stopColor={stroke} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false}/>
                <XAxis dataKey="t" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false}
                  tickFormatter={(t) => {
                    try {
                      const d = new Date(t);
                      if (["5m","15m","30m","1h","2h","4h","1d"].includes(range))
                        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                      return d.toLocaleDateString([], { month: "short", day: "numeric" });
                    } catch { return t; }
                  }}
                  minTickGap={40}
                />
                <YAxis stroke="#52525b" fontSize={11} tickLine={false} axisLine={false}
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v) => `${sym}${v >= 1000 ? (v/1000).toFixed(2)+"K" : v.toFixed(2)}`}
                />
                <Tooltip
                  contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 8, fontFamily: "JetBrains Mono" }}
                  formatter={(v) => fmtCurrency(v, "USD")}
                  labelFormatter={(t) => { try { return new Date(t).toLocaleString(); } catch { return t; } }}
                />
                <Area type="monotone" dataKey="p" stroke={stroke} strokeWidth={2} fill="url(#assetGrad)"/>
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-600 font-mono text-sm">{t("common.no_data")}</div>
          )}
        </div>
      </div>
    </div>
  );
}

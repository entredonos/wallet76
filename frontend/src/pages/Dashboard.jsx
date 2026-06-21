import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import {
  AreaChart, Area, LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  RefreshCw, ArrowUpRight, ArrowDownRight, Receipt, Bell, ChevronUp, ChevronDown,
  DollarSign, BarChart3, Activity, TrendingDown, ShoppingCart, Trash2, Eye, EyeOff, Settings2,
} from "lucide-react";
import AssetIcon from "../components/AssetIcon";
import FlashingPrice from "../components/FlashingPrice";
import Sparkline from "../components/Sparkline";
import { useBinanceStream } from "../hooks/useBinanceStream";
import { fmtCurrency, fmtPct, fmtNum, fmtCompact, convert, curSymbol } from "../lib/format";
import { useI18n } from "../context/I18nContext";
import { usePrivacy } from "../context/PrivacyContext";

const PIE_COLORS = ["#3b82f6", "#10b981", "#a855f7", "#eab308", "#ef4444", "#06b6d4", "#f97316", "#8b5cf6"];
const RANGES = [
  { value: "30m", label: "30min" },
  { value: "1h", label: "1h" },
  { value: "2h", label: "2h" },
  { value: "4h", label: "4h" },
  { value: "1d", label: "1D" },
  { value: "1w", label: "1W" },
  { value: "1m", label: "1M" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "ALL" },
];

const SORT_OPTIONS = [
  { key: "value_usd", label: "Value", default: "desc" },
  { key: "symbol", label: "Asset", default: "asc" },
  { key: "price_usd", label: "Price", default: "desc" },
  { key: "quantity", label: "Holdings", default: "desc" },
  { key: "avg_cost_usd", label: "Avg cost", default: "desc" },
  { key: "pnl_usd", label: "P&L $", default: "desc" },
  { key: "pnl_pct", label: "P&L %", default: "desc" },
  { key: "change_24h", label: "24h %", default: "desc" },
  { key: "allocation", label: "% portfolio", default: "desc" },
];

// Columns user can toggle on the assets table
const ALL_COLUMNS = [
  { key: "price",    labelKey: "common.price",      always: false },
  { key: "qty",      labelKey: "common.quantity",   always: false },
  { key: "value",    labelKey: "common.value",      always: false },
  { key: "avg_cost", labelKey: "common.avg_cost",   always: false },
  { key: "pnl",      labelKey: "dash.pnl",          always: false },
  { key: "alloc",    labelKey: "common.allocation", always: false },
  { key: "change",   labelKey: "common.change_24h", always: false },
  { key: "spark",    labelKey: "common.change_24h", always: false, suffix: " chart" },
  { key: "wallet",   labelKey: "common.wallet",     always: false },
];
const DEFAULT_VISIBLE_COLS = ["price","qty","value","avg_cost","pnl","alloc","change","spark","wallet"];

export default function Dashboard({ currency }) {
  const { t } = useI18n();
  const { hidden: hideValues, toggle: togglePrivacy } = usePrivacy();
  const mask = (formatted) => (hideValues ? "•••••" : formatted);
  const [visibleCols, setVisibleCols] = useState(() => {
    try {
      const raw = localStorage.getItem("folio-dash-cols");
      return raw ? JSON.parse(raw) : DEFAULT_VISIBLE_COLS;
    } catch { return DEFAULT_VISIBLE_COLS; }
  });
  const [colMenuOpen, setColMenuOpen] = useState(false);
  useEffect(() => {
    try { localStorage.setItem("folio-dash-cols", JSON.stringify(visibleCols)); } catch (e) { /* noop */ }
  }, [visibleCols]);
  const colVisible = (k) => visibleCols.includes(k);
  const toggleCol = (k) => setVisibleCols((arr) => arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);
  const [portfolio, setPortfolio] = useState(null);
  const [history, setHistory] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [sparklines, setSparklines] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterWallet, setFilterWallet] = useState("all");
  const [range, setRange] = useState("1w");
  const [sortKey, setSortKey] = useState("value_usd");
  const [sortDir, setSortDir] = useState("desc");
  const seenAlertsRef = useRef(new Set());
  const loc = useLocation();

  // Read ?wallet= from URL to set initial filter
  useEffect(() => {
    const p = new URLSearchParams(loc.search);
    const w = p.get("wallet");
    if (w) setFilterWallet(w);
  }, [loc.search]);

  const load = async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [p, h, sp] = await Promise.all([
        api.get("/portfolio"),
        api.get(`/history?range=${range}`),
        api.get("/sparklines"),
      ]);
      setPortfolio(p.data);
      setWallets(p.data.wallets || []);
      setHistory(h.data || []);
      setSparklines(sp.data || {});
      // Handle triggered alerts
      (p.data.triggered_alerts || []).forEach((al) => {
        if (seenAlertsRef.current.has(al.id)) return;
        seenAlertsRef.current.add(al.id);
        const dir = al.condition === "above" ? "↑" : "↓";
        const msg = `${al.symbol} is ${al.condition} $${al.target_price_usd.toFixed(2)} — now $${al.triggered_price_usd.toFixed(2)}`;
        toast(`🔔 Alert ${dir} ${al.symbol}`, { description: msg, duration: 8000 });
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          try { new Notification(`${al.symbol} ${dir} ${al.target_price_usd.toFixed(2)}`, { body: msg, icon: "/favicon.ico" }); } catch {}
        }
      });
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to load portfolio");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range]);
  useEffect(() => {
    const t = setInterval(() => { load(true); }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fxRates = useMemo(
    () => portfolio?.summary?.fx_rates || { USD: 1, EUR: portfolio?.summary?.eur_rate || 0.92, CHF: portfolio?.summary?.chf_rate || 0.88 },
    [portfolio]
  );

  const cryptoHoldings = useMemo(
    () => (portfolio?.assets || []).filter((a) => a.asset_type === "crypto" && a.quantity > 0),
    [portfolio]
  );
  const livePrices = useBinanceStream(cryptoHoldings);

  const getLivePrice = (a) => {
    if (a.asset_type === "crypto") {
      const key = (a.coingecko_id || a.symbol || "").toLowerCase();
      const live = livePrices[key];
      if (live?.price) return { price: live.price, live: true };
    }
    return { price: a.price_usd, live: false };
  };

  const allHoldings = useMemo(() => {
    const list = (portfolio?.assets || []).filter((a) => a.quantity > 0);
    return list.map((a) => {
      const { price, live } = getLivePrice(a);
      const value = price * a.quantity;
      const pnl = value - a.cost_usd;
      const pnl_pct = a.cost_usd > 0 ? (pnl / a.cost_usd) * 100 : 0;
      return { ...a, live_price_usd: price, live, value_usd: value, pnl_usd: pnl, pnl_pct };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio, livePrices]);

  const filtered = useMemo(() => {
    return allHoldings.filter((a) => {
      if (filterType !== "all" && a.asset_type !== filterType) return false;
      if (filterWallet !== "all" && a.wallet_id !== filterWallet) return false;
      return true;
    });
  }, [allHoldings, filterType, filterWallet]);

  const totalForAlloc = filtered.reduce((s, a) => s + a.value_usd, 0) || 1;
  const withAlloc = useMemo(
    () => filtered.map((a) => ({ ...a, allocation: (a.value_usd / totalForAlloc) * 100 })),
    [filtered, totalForAlloc]
  );

  const sorted = useMemo(() => {
    const arr = [...withAlloc];
    arr.sort((a, b) => {
      let va = a[sortKey];
      let vb = b[sortKey];
      if (typeof va === "string") {
        va = va.toLowerCase(); vb = (vb || "").toLowerCase();
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      va = Number(va || 0); vb = Number(vb || 0);
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withAlloc, sortKey, sortDir]);

  const summary = useMemo(() => {
    const total = filtered.reduce((s, a) => s + a.value_usd, 0);
    const cost = filtered.reduce((s, a) => s + a.cost_usd, 0);
    const pnl = total - cost;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    const daily = filtered.reduce((s, a) => s + (a.daily_change_usd || 0), 0);
    const dailyPct = total > 0 ? (daily / total) * 100 : 0;
    const realized = filtered.reduce((s, a) => s + (a.realized_pnl_usd || 0), 0);
    return { total, cost, pnl, pnlPct, daily, dailyPct, realized };
  }, [filtered]);

const performance = useMemo(() => {
  if (!history || history.length < 2) {
    return { selected: 0 };
  }

  const current = history[history.length - 1]?.total_usd || 0;
  const first = history[0]?.total_usd || current;

  return {
    selected: first > 0 ? ((current - first) / first) * 100 : 0,
  };
}, [history]);

  const pieData = useMemo(() => {
    const agg = {};
    filtered.forEach((a) => { agg[a.symbol] = (agg[a.symbol] || 0) + a.value_usd; });
    return Object.entries(agg).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [filtered]);

  const lineData = useMemo(() => {
    return (history || []).map((s) => ({
      ts: s.ts || s.date,
      value: convert(s.total_usd, currency, fxRates),
    }));
  }, [history, currency, fxRates]);

  const bestPerformer = useMemo(() => {
  if (!allHoldings.length) return null;
  return [...allHoldings].sort((a, b) => b.pnl_pct - a.pnl_pct)[0];
}, [allHoldings]);

const worstPerformer = useMemo(() => {
  if (!allHoldings.length) return null;
  return [...allHoldings].sort((a, b) => a.pnl_pct - b.pnl_pct)[0];
}, [allHoldings]);

  const totalCount = allHoldings.length;
  const walletCount = (wallets || []).length;

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      const opt = SORT_OPTIONS.find((o) => o.key === key);
      setSortDir(opt?.default || "desc");
    }
  };

  if (loading) {
    return <div className="text-zinc-500 font-mono text-sm" data-testid="dashboard-loading">Loading portfolio…</div>;
  }

  return (
    <div className="space-y-6 fade-in">
      {/* Title row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-light tracking-tight text-zinc-50">{t("dash.title")}</h1>
          <p className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-500 mt-1.5" data-testid="dashboard-subtitle">
            {t("dash.subtitle", { count: totalCount, wallets: walletCount })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={togglePrivacy}
            className={`p-2 border rounded-md transition-colors ${hideValues ? "border-amber-500/40 text-amber-300 bg-amber-500/10" : "border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"}`}
            data-testid="privacy-toggle"
            title={hideValues ? "Show values" : "Hide values (privacy mode)"}
          >
            {hideValues ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
          </button>
          <Link to="/alerts">
            <Button variant="outline" size="sm" className="bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100" data-testid="alerts-btn">
              <Bell className="w-4 h-4 mr-2"/> {t("common.alerts")}
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing} className="bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100" data-testid="refresh-btn">
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}/> {t("common.refresh")}
          </Button>
          <Link to="/transactions">
            <Button size="sm" className="bg-blue-500 hover:bg-blue-400 text-zinc-950 font-medium" data-testid="goto-tx-btn">
              <Receipt className="w-4 h-4 mr-2"/> + {t("common.add")}
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<DollarSign className="w-4 h-4"/>}
          label={t("dash.balance")}
          value={mask(fmtCompact(convert(summary.total, currency, fxRates), currency))}
          delta={fmtPct(summary.cost > 0 ? ((summary.total - summary.cost) / summary.cost) * 100 : 0)}
          positive={(summary.total - summary.cost) >= 0}          testId="card-total-balance"
          tint="blue"
        />
        <SummaryCard
          icon={<BarChart3 className="w-4 h-4"/>}
          label={t("dash.invested")}
          value={mask(fmtCompact(convert(summary.cost, currency, fxRates), currency))}
          testId="card-cost-basis"
          tint="amber"
        />
        <SummaryCard
          icon={summary.pnl >= 0 ? <ArrowUpRight className="w-4 h-4"/> : <TrendingDown className="w-4 h-4"/>}
          label={t("dash.pnl")}
          value={mask(fmtCurrency(convert(summary.pnl, currency, fxRates), currency))}
          delta={hideValues ? "•••" : fmtPct(summary.pnlPct)}
          positive={summary.pnl >= 0}
          testId="card-total-pnl"
          tint={summary.pnl >= 0 ? "emerald" : "rose"}
        />
        <SummaryCard
          icon={<Activity className="w-4 h-4"/>}
          label={t("dash.daily")}
          value={mask(fmtCurrency(convert(summary.daily, currency, fxRates), currency))}
          delta={hideValues ? "•••" : fmtPct(summary.dailyPct)}
          positive={summary.daily >= 0}
          testId="card-daily-change"
          tint={summary.daily >= 0 ? "emerald" : "rose"}
        />
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterPill active={filterType === "all" && filterWallet === "all"} onClick={() => { setFilterType("all"); setFilterWallet("all"); }} testId="filter-all" color="zinc">▦ {t("common.global")}</FilterPill>
        <FilterPill active={filterType === "crypto"} onClick={() => { setFilterType("crypto"); }} testId="filter-crypto" color="amber">₿ {t("common.crypto")}</FilterPill>
        <FilterPill active={filterType === "stock"} onClick={() => { setFilterType("stock"); }} testId="filter-stock" color="blue">{t("common.stocks")}</FilterPill>
        <div className="w-px h-5 bg-zinc-800 mx-1"/>
        {wallets.map((w, i) => {
          const dotColors = ["bg-amber-400", "bg-blue-400", "bg-purple-400", "bg-emerald-400", "bg-rose-400", "bg-cyan-400"];
          const dot = dotColors[i % dotColors.length];
          return (
            <FilterPill
              key={w.id}
              active={filterWallet === w.id}
              onClick={() => setFilterWallet(filterWallet === w.id ? "all" : w.id)}
              testId={`filter-wallet-${w.id}`}
              color="blue"
            >
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${dot}`}/> {w.name}
            </FilterPill>
          );
        })}
      </div>

      {/* Top movers (my portfolio) */}
      {sorted.length >= 2 && (() => {
        const ranked = [...sorted].filter((a) => typeof a.change_24h === "number").sort((a, b) => (b.change_24h || 0) - (a.change_24h || 0));
        const topUp = ranked.slice(0, 3);
        const topDown = ranked.slice(-3).reverse();
        const TopMover = ({ a, positive }) => (
          <Link
            to={`/asset/${a.asset_type}/${a.symbol}`}
            className="flex items-center gap-3 px-3 py-2 rounded-md bg-zinc-900/60 border border-zinc-800/60 hover:border-zinc-700 transition-colors"
            data-testid={`top-mover-${positive ? "up" : "down"}-${a.symbol}`}
          >
            <AssetIcon asset={a} size={24}/>
            <div className="min-w-0 flex-1">
              <div className="font-mono text-zinc-100 text-sm leading-none">{a.symbol}</div>
              <div className="text-[10px] font-mono text-zinc-500 leading-none mt-1">{mask(fmtCurrency(convert(a.value_usd, currency, fxRates), currency))}</div>
            </div>
            <div className={`font-mono text-sm shrink-0 ${positive ? "text-emerald-400" : "text-rose-400"}`}>
              {positive ? <ArrowUpRight className="inline w-3 h-3"/> : <ArrowDownRight className="inline w-3 h-3"/>}
              {fmtPct(a.change_24h || 0)}
            </div>
          </Link>
        );
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="top-movers-widget">
            <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <ArrowUpRight className="w-4 h-4 text-emerald-400"/>
                <div className="text-xs font-mono uppercase tracking-[0.15em] text-emerald-400">{t("dash.top_movers_up")}</div>
              </div>
              <div className="space-y-1.5">
                {topUp.map((a) => <TopMover key={a.symbol+a.wallet_id} a={a} positive/>)}
              </div>
            </div>
            <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <ArrowDownRight className="w-4 h-4 text-rose-400"/>
                <div className="text-xs font-mono uppercase tracking-[0.15em] text-rose-400">{t("dash.top_movers_down")}</div>
              </div>
              <div className="space-y-1.5">
                {topDown.map((a) => <TopMover key={a.symbol+a.wallet_id} a={a} positive={false}/>)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-zinc-300">{t("dash.evolution")}</div>
            <div className="flex border border-zinc-800 rounded-md overflow-hidden" data-testid="range-selector">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRange(r.value)}
                  className={`px-2 sm:px-2.5 py-1 text-[10px] sm:text-xs font-mono transition-colors ${
                    range === r.value ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                  data-testid={`range-${r.value}`}
                >{r.label}</button>
              ))}
            </div>
          </div>
          <div className="h-64 sm:h-72" data-testid="evolution-chart">
            {lineData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={lineData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradBlue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4}/>
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false}/>
                  <XAxis dataKey="ts" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false}
                    tickFormatter={(t) => {
                      try {
                        const d = new Date(t);
                        if (range === "30m" || range === "1h" || range === "2h" || range === "4h") {
                          return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                        }
                        return d.toLocaleDateString([], { month: "short", day: "numeric" });
                      } catch { return t; }
                    }}
                    minTickGap={30}
                  />
                  <YAxis stroke="#52525b" fontSize={11} tickLine={false} axisLine={false}
                    tickFormatter={(v) => hideValues ? "•••" : `${curSymbol(currency)}${(v/1000).toFixed(2)}K`}
                  />
                  <Tooltip
                    contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 8, fontFamily: "JetBrains Mono", color: "#fafafa" }}
                    labelStyle={{ color: "#fafafa" }}
                    itemStyle={{ color: "#fafafa" }}
                    formatter={(v) => hideValues ? "•••••" : fmtCurrency(v, currency)}
                    labelFormatter={(tval) => { try { return new Date(tval).toLocaleString(); } catch { return tval; } }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#gradBlue)"/>
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-600 text-sm font-mono text-center px-6">
                Dados de evolução vão aparecer aqui. Continua a usar a aplicação — os snapshots são guardados a cada 15 min.
              </div>
            )}
          </div>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5">
          <div className="text-sm font-medium text-zinc-300 mb-4">{t("dash.allocation")}</div>
          <div className="h-64 sm:h-72" data-testid="allocation-chart">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" innerRadius={55} outerRadius={90} paddingAngle={2} stroke="#09090b">
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}/>)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 8, fontFamily: "JetBrains Mono", color: "#fafafa" }}
                    itemStyle={{ color: "#fafafa" }}
                    labelStyle={{ color: "#fafafa" }}
                    formatter={(v, name) => [hideValues ? "•••••" : `${fmtCurrency(convert(v, currency, fxRates), currency)} (${((v/totalForAlloc)*100).toFixed(2)}%)`, name]}
                  />
                  <Legend
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, fontFamily: "JetBrains Mono", color: "#a1a1aa" }}
                    formatter={(v, e) => {
                      const pct = ((e.payload.value / totalForAlloc) * 100).toFixed(2);
                      return <span className="text-zinc-300">{v} <span className="text-zinc-500 ml-2">{pct}%</span></span>;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-600 text-sm font-mono">No assets yet</div>
            )}
          </div>
        </div>
      </div>

{bestPerformer && worstPerformer && (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <SummaryCard
      icon={<ArrowUpRight className="w-4 h-4" />}
      label={t("dash.best_performer")}
      value={bestPerformer.symbol}
      delta={fmtPct(bestPerformer.pnl_pct)}
      positive={bestPerformer.pnl_pct >= 0}
      testId="card-best-performer"
      tint="emerald"
    />

    <SummaryCard
      icon={<ArrowDownRight className="w-4 h-4" />}
      label={t("dash.worst_performer")}
      value={worstPerformer.symbol}
      delta={fmtPct(worstPerformer.pnl_pct)}
      positive={worstPerformer.pnl_pct >= 0}
      testId="card-worst-performer"
      tint="rose"
    />
  </div>
)}

      {/* Holdings table */}
      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800/50 flex items-center justify-between">
          <div className="text-sm font-medium text-zinc-300">{t("dash.assets")}</div>
          <div className="flex items-center gap-3">
            <div className="text-xs font-mono text-zinc-500" data-testid="assets-count">{sorted.length} {sorted.length === 1 ? "item" : "itens"}</div>
            <div className="relative">
              <button
                onClick={() => setColMenuOpen((v) => !v)}
                className="p-1.5 border border-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 transition-colors"
                data-testid="columns-gear-btn"
                title="Configure columns"
              >
                <Settings2 className="w-4 h-4"/>
              </button>
              {colMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setColMenuOpen(false)}/>
                  <div className="absolute right-0 top-full mt-2 z-40 w-56 bg-zinc-950 border border-zinc-800 rounded-md shadow-2xl p-2" data-testid="columns-menu">
                    <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-500 px-2 py-1.5">Columns</div>
                    {ALL_COLUMNS.map((c) => (
                      <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-900 rounded cursor-pointer" data-testid={`col-toggle-${c.key}`}>
                        <input
                          type="checkbox"
                          checked={colVisible(c.key)}
                          onChange={() => toggleCol(c.key)}
                          className="accent-blue-500"
                        />
                        <span>{t(c.labelKey)}{c.suffix || ""}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" data-testid="assets-table">
            <thead>
              <tr className="text-xs font-mono uppercase tracking-[0.1em] text-zinc-500 border-b border-zinc-800/30">
                <SortableTH label={t("dash.assets")} k="symbol" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} testId="sort-symbol" className="text-left px-5 py-3"/>
                {colVisible("price") && <SortableTH label={t("common.price")} k="price_usd" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} testId="sort-price" className="text-right px-4 py-3"/>}
                {colVisible("qty") && <SortableTH label={t("common.quantity")} k="quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} testId="sort-qty" className="text-right px-4 py-3"/>}
                {colVisible("value") && <SortableTH label={t("common.value")} k="value_usd" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} testId="sort-value" className="text-right px-4 py-3"/>}
                {colVisible("avg_cost") && <SortableTH label={t("common.avg_cost")} k="avg_cost_usd" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} testId="sort-avg" className="text-right px-4 py-3"/>}
                {colVisible("pnl") && <SortableTH label="P&L" k="pnl_usd" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} testId="sort-pnl" className="text-right px-4 py-3"/>}
                {colVisible("alloc") && <SortableTH label={t("common.allocation")} k="allocation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} testId="sort-alloc" className="text-right px-4 py-3"/>}
                {colVisible("change") && <SortableTH label={t("common.change_24h")} k="change_24h" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} testId="sort-24h" className="text-right px-4 py-3"/>}
                {colVisible("spark") && <th className="text-right px-3 py-3 font-normal">24h Chart</th>}
                {colVisible("wallet") && <th className="text-left px-4 py-3 font-normal">{t("common.wallet")}</th>}
                <th className="text-right px-4 py-3 font-normal">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={visibleCols.length + 2} className="text-center text-zinc-600 py-12 text-sm font-mono" data-testid="no-assets">
                  Sem ativos. Vai a <Link to="/transactions" className="text-zinc-300 underline">Transactions</Link> para registar uma compra.
                </td></tr>
              )}
              {sorted.map((a) => {
                const walletName = wallets.find((w) => w.id === a.wallet_id)?.name || "—";
                const pos = a.pnl_usd >= 0;
                const pos24 = (a.change_24h || 0) >= 0;
                const sym = curSymbol(currency);
                const formatPrice = (n) => `${sym}${convert(n, currency, fxRates).toLocaleString("en-US",{minimumFractionDigits:2, maximumFractionDigits:2})}`;
                return (
                  <tr key={`${a.symbol}-${a.wallet_id}-${a.asset_type}`} className="border-b border-zinc-800/30 hover:bg-zinc-900/40 transition-colors" data-testid={`asset-row-${a.symbol}-${a.wallet_id}`}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <AssetIcon asset={a}/>
                        <div>
                          <div className="font-mono font-medium text-zinc-100">{a.symbol}</div>
                          <div className="text-xs text-zinc-500 flex items-center gap-1.5">
                            {a.name}
                            <span className="text-[9px] font-mono uppercase border border-zinc-800 rounded px-1 py-0.5 text-zinc-500">{a.asset_type === "crypto" ? "Crypto" : "Stock"}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    {colVisible("price") && (
                      <td className="px-4 py-4 text-right">
                        <FlashingPrice
                          value={a.live_price_usd}
                          formatted={formatPrice(a.live_price_usd)}
                          live={a.live}
                          testId={`price-${a.symbol}`}
                        />
                      </td>
                    )}
                    {colVisible("qty") && <td className="px-4 py-4 text-right font-mono text-zinc-300">{mask(fmtNum(a.quantity, 4))}</td>}
                    {colVisible("value") && <td className="px-4 py-4 text-right font-mono text-zinc-100">{mask(fmtCurrency(convert(a.value_usd, currency, fxRates), currency))}</td>}
                    {colVisible("avg_cost") && <td className="px-4 py-4 text-right font-mono text-zinc-500">{fmtCurrency(convert(a.avg_cost_usd, currency, fxRates), currency)}</td>}
                    {colVisible("pnl") && (
                      <td className={`px-4 py-4 text-right font-mono ${pos ? "text-emerald-400" : "text-rose-400"}`}>
                        <div>{mask(fmtCurrency(convert(a.pnl_usd, currency, fxRates), currency))}</div>
                        <div className="text-xs">{fmtPct(a.pnl_pct)}</div>
                      </td>
                    )}
                    {colVisible("alloc") && <td className="px-4 py-4 text-right font-mono text-zinc-300">{a.allocation.toFixed(2)}%</td>}
                    {colVisible("change") && (
                      <td className={`px-4 py-4 text-right font-mono text-sm ${pos24 ? "text-emerald-400" : "text-rose-400"}`}>
                        <div className="inline-flex items-center gap-1">
                          {pos24 ? <ArrowUpRight className="w-3 h-3"/> : <ArrowDownRight className="w-3 h-3"/>}
                          {fmtPct(a.change_24h || 0)}
                        </div>
                      </td>
                    )}
                    {colVisible("spark") && (
                      <td className="px-3 py-4 text-right" data-testid={`sparkline-${a.symbol}`}>
                        <div className="inline-block">
                          <Sparkline data={sparklines[`${a.asset_type}:${a.symbol.toUpperCase()}`]} positive={(a.change_24h || 0) >= 0} />
                        </div>
                      </td>
                    )}
                    {colVisible("wallet") && (
                      <td className="px-4 py-4">
                        <span className="text-xs font-mono text-zinc-300 border border-zinc-800 rounded px-2 py-1">{walletName}</span>
                      </td>
                    )}
                    <td className="px-4 py-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Link
                          to={`/transactions?sell=${a.symbol}&type=${a.asset_type}&wallet=${a.wallet_id}`}
                          className="p-1.5 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          data-testid={`action-sell-${a.symbol}`}
                          title="Sell"
                        >
                          <ShoppingCart className="w-4 h-4"/>
                        </Link>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Delete ALL transactions for ${a.symbol} in this wallet?`)) return;
                            try {
                              const { data: txns } = await api.get("/transactions");
                              const toDelete = (txns || []).filter((t) => t.symbol.toUpperCase() === a.symbol.toUpperCase() && t.wallet_id === a.wallet_id && t.asset_type === a.asset_type);
                              await Promise.all(toDelete.map((t) => api.delete(`/transactions/${t.id}`)));
                              toast.success(`Deleted ${toDelete.length} transactions`);
                              load(true);
                            } catch { toast.error("Failed to delete"); }
                          }}
                          className="p-1.5 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          data-testid={`action-delete-${a.symbol}`}
                          title="Delete all transactions for this asset"
                        >
                          <Trash2 className="w-4 h-4"/>
                        </button>
                        <Link
                          to={`/asset/${a.asset_type}/${a.symbol}`}
                          className="p-1.5 rounded-md text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                          data-testid={`action-chart-${a.symbol}`}
                          title="Open chart"
                        >
                          <Eye className="w-4 h-4"/>
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, delta, positive, testId, tint = "zinc" }) {
  const tints = {
    blue: "bg-blue-500/10 text-blue-300 border-blue-500/30",
    amber: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    emerald: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    rose: "bg-rose-500/10 text-rose-300 border-rose-500/30",
    zinc: "bg-zinc-800/40 text-zinc-300 border-zinc-700",
  };
  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 hover:border-zinc-700/60 transition-colors rounded-xl p-5" data-testid={testId}>
      <div className="flex items-start justify-between">
        <div className="text-xs font-medium text-zinc-400">{label}</div>
        <div className={`w-7 h-7 rounded-md border flex items-center justify-center ${tints[tint] || tints.zinc}`}>{icon}</div>
      </div>
        <div className="mt-3 font-mono text-base sm:text-lg lg:text-lg tracking-tight text-zinc-50 whitespace-nowrap overflow-hidden text-ellipsis leading-tight">
          {value}
        </div>
      {delta != null && (
        <div className={`mt-2 font-mono text-[11px] sm:text-xxs ${positive ? "text-emerald-400" : "text-rose-400"}`}>
          {delta}
        </div>
      )}
    </div>
  );
}

function FilterPill({ children, active, onClick, testId }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`text-xs font-mono px-3 py-1.5 rounded-md border transition-colors ${
        active ? "bg-blue-500 border-blue-500 text-zinc-950 font-medium" : "bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
      }`}
    >{children}</button>
  );
}

function SortableTH({ label, k, sortKey, sortDir, onSort, className = "", testId }) {
  const active = sortKey === k;
  return (
    <th className={`${className} font-normal cursor-pointer select-none`} onClick={() => onSort(k)} data-testid={testId}>
      <span className={`inline-flex items-center gap-1 ${active ? "text-zinc-200" : "text-zinc-500"} hover:text-zinc-300`}>
        {label}
        {active && (sortDir === "asc" ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>)}
      </span>
    </th>
  );
}

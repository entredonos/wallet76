import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "../components/ui/dialog";
import { toast } from "sonner";
import {
  ComposedChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";
import { getDayBoundaries, getWeekendBands, bucketOHLC } from "../lib/chartGaps";
import { renderDayBoundaries, renderWeekendBands } from "../components/ChartAnnotations";
import { AreaTooltip } from "../components/CandlestickBar";
import { CHART_RANGES, CHART_RANGES_SHOW_DATE, CHART_RANGE_BUCKET_MS, CHART_RANGES_DAY_MARKERS, CHART_RANGES_WEEKEND_SHADING, N_BARS } from "../constants/chartRanges";
import {
  RefreshCw, ArrowUpRight, ArrowDownRight, Receipt, Bell, ChevronUp, ChevronDown,
  DollarSign, BarChart3, Activity, TrendingDown, ShoppingCart, Trash2, Eye, EyeOff, Settings2,
  Share2, Link as LinkIcon, X, Check, GripVertical, LayoutDashboard, Tag,
} from "lucide-react";
import DashboardWidgetDrawer from "../components/DashboardWidgetDrawer";
import AssetIcon from "../components/AssetIcon";
import FlashingPrice from "../components/FlashingPrice";
import DashboardSkeleton from "../components/DashboardSkeleton";
import OnboardingFlow from "../components/OnboardingFlow";
import Sparkline from "../components/Sparkline";
import { useBinanceStream } from "../hooks/useBinanceStream";
import { fmtCurrency, fmtPct, fmtNum, fmtCompact, convert, curSymbol } from "../lib/format";
import { useI18n } from "../context/I18nContext";
import { usePrivacy } from "../context/PrivacyContext";
import { usePlan } from "../hooks/usePlan";
import { WALLET_COLOR_KEYS, WALLET_DOT_CLASS, walletColorKey } from "../lib/walletColors";
import { ALLOCATION_CLASSES, ALLOCATION_CLASS_LABEL_KEY, ALLOCATION_CLASS_COLOR, effectiveClass, aggregateByClass, redistributeAllocationTargets } from "../lib/allocation";

// Returns true if NYSE is currently open (Mon–Fri 09:30–16:00 US/Eastern)
function isNYSEOpen() {
  const now = new Date();
  // Convert to US Eastern time (ET = UTC-5 standard, UTC-4 daylight)
  // Use Intl to get correct offset at any time of year
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const et = new Date(etStr);
  const day = et.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const h = et.getHours();
  const m = et.getMinutes();
  const mins = h * 60 + m;
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

const TYPE_LABELS = {
  crypto: "Crypto",
  stock:  "Stock",
  etf:    "ETF",
  fund:   "Fund",
  bond:   "Bond",
  cash:   "Cash",
  reit:   "REIT",
};

// Config for the type filter pills — shared between the always-visible
// "Global" row and each wallet's own inline pills (see filter pills section
// in Dashboard()). `icon` is a literal prefix, not a lucide component, to
// match the existing "₿ Crypto" style.
const TYPE_PILL_DEFS = [
  { key: "crypto", color: "amber", icon: "₿ ", labelKey: "common.crypto" },
  { key: "stock",  color: "blue",  icon: "",   labelKey: "common.stocks" },
  { key: "etf",    color: "blue",  icon: "",   labelKey: "common.etfs" },
  { key: "fund",   color: "blue",  icon: "",   labelKey: "common.funds" },
  { key: "cash",   color: "blue",  icon: "",   labelKey: "common.cash" },
];

const PIE_COLORS = ["#3b82f6", "#10b981", "#a855f7", "#eab308", "#ef4444", "#06b6d4", "#f97316", "#8b5cf6"];

// "UPGRADE v1.0" — percentage labels drawn directly on the pie/donut slices
// (task #89), instead of only in the legend below. Skips slivers too thin
// to fit a legible label so the chart doesn't turn into overlapping text.
function renderPieSliceLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.04) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#fafafa"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={10}
      fontWeight={700}
      fontFamily="JetBrains Mono"
      pointerEvents="none"
      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
    >
      {`${Math.round(percent * 100)}%`}
    </text>
  );
}

const RANGES = CHART_RANGES;

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
  { key: "type",     labelKey: "dash.col_type",     always: false },
  { key: "price",    labelKey: "common.price",      always: false },
  { key: "qty",      labelKey: "common.quantity",   always: false },
  { key: "value",    labelKey: "common.value",      always: false },
  { key: "avg_cost", labelKey: "common.avg_cost",   always: false },
  { key: "pnl",      labelKey: "dash.pnl",          always: false },
  { key: "alloc",    labelKey: "common.allocation", always: false },
  { key: "change",   labelKey: "common.change_24h", always: false },
  { key: "spark",    labelKey: "common.chart_24h",  always: false },
  { key: "wallet",   labelKey: "common.wallet",     always: false },
];
const DEFAULT_VISIBLE_COLS = ["type","price","qty","value","avg_cost","pnl","alloc","change","spark","wallet"];

// ── Widget system ────────────────────────────────────────────────────────────
const WIDGET_DEFS = [
  { id: "summary",    labelKey: "dash.widget_summary" },
  { id: "top_movers", labelKey: "dash.widget_top_movers" },
  { id: "performers", labelKey: "dash.widget_performers" },  // sub-row inside top_movers
  { id: "evolution",  labelKey: "dash.widget_evolution" },
  { id: "allocation", labelKey: "dash.widget_allocation" },
  { id: "assets",     labelKey: "dash.widget_assets" },
];
const DEFAULT_WIDGETS = WIDGET_DEFS.map((d) => ({ id: d.id, enabled: true }));

// ── SummaryCard ──────────────────────────────────────────────────────────────
const TINT_CLASSES = {
  blue:    { icon: "bg-blue-500/10 text-blue-400",    border: "border-blue-500/20"    },
  amber:   { icon: "bg-amber-500/10 text-amber-400",  border: "border-amber-500/20"  },
  emerald: { icon: "bg-emerald-500/10 text-emerald-400", border: "border-emerald-500/20" },
  rose:    { icon: "bg-rose-500/10 text-rose-400",    border: "border-rose-500/20"    },
  zinc:    { icon: "bg-zinc-700/40 text-zinc-400",    border: "border-zinc-700/40"    },
};

function SummaryCard({ icon, label, value, delta, positive, testId, tint = "zinc", sparkline }) {
  const tc = TINT_CLASSES[tint] || TINT_CLASSES.zinc;
  return (
    <div
      data-testid={testId}
      className={`relative flex flex-col gap-3 rounded-xl border bg-zinc-900/60 p-4 backdrop-blur-sm hover:bg-zinc-900/80 transition-colors ${tc.border}`}
    >
      <div className="flex items-center justify-between">
        <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${tc.icon}`}>
          {icon}
        </div>
        {sparkline && (
          <div className="opacity-70">{sparkline}</div>
        )}
      </div>
      <div>
        <div className="text-xs font-mono uppercase tracking-[0.12em] text-zinc-500 mb-1">{label}</div>
        <div className="text-xl font-semibold text-zinc-100 font-mono truncate">{value}</div>
        {delta != null && (
          // No extra "+" prepended here — every caller already formats delta
          // via fmtPct() (or a string built from it), which adds its own "+"
          // sign for positive values. Doing it again here doubled up to
          // "++2.2%" on every positive card.
          <div className={`text-xs font-mono mt-1 ${positive ? "text-emerald-400" : "text-rose-400"}`}>
            {delta}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard({ currency }) {
  const { t } = useI18n();
  const { hidden: hideValues, toggle: togglePrivacy } = usePrivacy();
  const { isPro } = usePlan();
  const mask = (formatted) => (hideValues ? "•••••" : formatted);
  const [visibleCols, setVisibleCols] = useState(() => {
    try {
      const raw = localStorage.getItem("folio-dash-cols-v2");
      if (raw) {
        const saved = JSON.parse(raw);
        // Ensure new columns are added if missing from saved config
        const merged = [...DEFAULT_VISIBLE_COLS.filter(c => !saved.includes(c)), ...saved];
        return merged;
      }
      return DEFAULT_VISIBLE_COLS;
    } catch { return DEFAULT_VISIBLE_COLS; }
  });
  const [colMenuOpen, setColMenuOpen] = useState(false);
  useEffect(() => {
    try { localStorage.setItem("folio-dash-cols-v2", JSON.stringify(visibleCols)); } catch (e) { /* noop */ }
  }, [visibleCols]);

  // Widget config — persisted in localStorage
  const [widgetConfig, setWidgetConfig] = useState(() => {
    try {
      const raw = localStorage.getItem("w76-dash-widgets");
      if (raw) {
        const saved = JSON.parse(raw);
        const ids = new Set(saved.map((w) => w.id));
        // Add any new widgets not yet in saved config
        const merged = [...saved, ...WIDGET_DEFS.filter((d) => !ids.has(d.id)).map((d) => ({ id: d.id, enabled: true }))];
        return merged;
      }
    } catch { /* noop */ }
    return DEFAULT_WIDGETS.map((w) => ({ ...w }));
  });
  const [widgetDrawer, setWidgetDrawer] = useState(false);

  // Filter pill visibility (read from localStorage, updated by DashboardWidgetDrawer)
  const [hiddenTypePills, setHiddenTypePills] = useState(() => {
    try { return JSON.parse(localStorage.getItem("w76-hidden-type-pills") || "[]"); } catch { return []; }
  });
  const [hiddenWalletPills, setHiddenWalletPills] = useState(() => {
    try { return JSON.parse(localStorage.getItem("w76-hidden-wallet-pills") || "[]"); } catch { return []; }
  });

  // Sync pill visibility when drawer closes
  const syncPillVisibility = () => {
    try {
      setHiddenTypePills(JSON.parse(localStorage.getItem("w76-hidden-type-pills") || "[]"));
      setHiddenWalletPills(JSON.parse(localStorage.getItem("w76-hidden-wallet-pills") || "[]"));
    } catch { /* noop */ }
  };

  const pillVisible = (type) => !hiddenTypePills.includes(type);
  const walletPillVisible = (id) => !hiddenWalletPills.includes(id);
  useEffect(() => {
    try { localStorage.setItem("w76-dash-widgets", JSON.stringify(widgetConfig)); } catch { /* noop */ }
  }, [widgetConfig]);

  // Widget helpers — defined AFTER widgetConfig state to avoid TDZ
  const wVisible = (id) => widgetConfig.find((w) => w.id === id)?.enabled !== false;
  const wOrder = (id) => {
    const idx = widgetConfig.findIndex((w) => w.id === id);
    return idx >= 0 ? idx * 10 + 20 : 990;
  };
  const chartsOrder = Math.min(wOrder("evolution"), wOrder("allocation"));
  const colVisible = (k) => visibleCols.includes(k);
  const toggleCol = (k) => setVisibleCols((arr) => arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);
  const [portfolio, setPortfolio] = useState(null);
  const [history, setHistory] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [sparklines, setSparklines] = useState({});
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [livePriceVersion, setLivePriceVersion] = useState(0);
  const [lastSync, setLastSync] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [backfilling, setBackfilling] = useState(false);
  const [sharePanel, setSharePanel] = useState(false);
  const [shareData, setShareData] = useState(null);   // { slug, hide_values } or null
  const [shareLoading, setShareLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filterWallet, setFilterWallet] = useState("all");
  const [range, setRange] = useState("1h");
  const [allocationMode, setAllocationMode] = useState("class");
  const [activeAllocation, setActiveAllocation] = useState(null);
  // "UPGRADE v1.0" — target allocation per class + manual reclassification.
  // A tiny, independent fetch (not part of the portfolio/history/sparklines
  // trio in load()): this is user configuration, not portfolio data, so it
  // doesn't need to re-fetch on range/wallet/type filter changes.
  const [allocTargets, setAllocTargets] = useState({});
  const [allocOverrides, setAllocOverrides] = useState({});
  const [showTargetDialog, setShowTargetDialog] = useState(false);
  const [reclassifyOpenKey, setReclassifyOpenKey] = useState(null);
  const [sortKey, setSortKey] = useState("value_usd");
  const [sortDir, setSortDir] = useState("desc");
  const [chartLoading, setChartLoading] = useState(true);
  const seenAlertsRef = useRef(new Set());
  // Bumped on every /history fetch kicked off by load(); a response only
  // gets applied to state if it's still the most recent one requested.
  // Without this, switching range/carteira/tipo while a slow request is
  // still in flight (e.g. delayed by CoinGecko 429 retries, which can take
  // several seconds) can let that stale response land AFTER a newer, faster
  // one and silently overwrite it — the chart then shows data for the
  // wrong range, or looks empty if the stale request itself came back empty.
  const historyReqIdRef = useRef(0);
  const loc = useLocation();
  const nav = useNavigate();

  // Sync filterWallet from ?wallet= on every URL change — must also reset
  // to "all" when the param is ABSENT (not just set it when present), or
  // clicking "Todas as carteiras" in the sidebar while already viewing a
  // filtered wallet does nothing: the Link only changes the query string
  // (Dashboard doesn't remount), so a set-only effect would leave the old
  // filterWallet value stuck.
  useEffect(() => {
    const p = new URLSearchParams(loc.search);
    const w = p.get("wallet");
    setFilterWallet(w || "all");
  }, [loc.search]);

  // Load the allocation target + reclassification overrides once. Optional
  // user config — if the request fails (or nothing's configured yet) we
  // just keep the empty defaults, which the widget already treats as "no
  // target set" (shows the plain pie, same as before this feature existed).
  const loadAllocationPrefs = async () => {
    try {
      const { data } = await api.get("/allocation");
      setAllocTargets(data?.targets || {});
      setAllocOverrides(data?.overrides || {});
    } catch { /* noop — optional config */ }
  };
  useEffect(() => { loadAllocationPrefs(); }, []);

  // "UPGRADE v1.0" (task #77) — saves/clears a symbol's manual class
  // override. `cls === null` clears it (falls back to asset_type again).
  // Applies globally across every wallet holding that symbol, per the
  // agreed design — never per individual row/holding.
  const saveOverride = async (symbol, cls) => {
    try {
      await api.put("/allocation/override", { symbol, class: cls });
      setAllocOverrides((prev) => {
        const next = { ...prev };
        const key = (symbol || "").toUpperCase();
        if (cls) next[key] = cls; else delete next[key];
        return next;
      });
      toast.success(t("alloc.toast_override_saved"));
    } catch (e) {
      toast.error(formatApiErrorDetail(e?.response?.data?.detail) || t("alloc.toast_override_failed"));
    } finally {
      setReclassifyOpenKey(null);
    }
  };

  // --- sessionStorage cache helpers ---
  const CACHE_TTL = 30_000; // 30 seconds
  const CACHE_VER = "v3"; // Bump to clear stale cache entries

  const cacheKey = (suffix) => `w76_dash_${CACHE_VER}_${suffix}_${filterWallet}_${filterType}_${range}`;

  const readCache = (suffix) => {
    try {
      const raw = sessionStorage.getItem(cacheKey(suffix));
      if (!raw) return null;
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts < CACHE_TTL) return data;
    } catch { /* noop */ }
    return null;
  };

  const writeCache = (suffix, data) => {
    try {
      sessionStorage.setItem(cacheKey(suffix), JSON.stringify({ data, ts: Date.now() }));
    } catch { /* noop — storage full or private mode */ }
  };

  const applyPortfolio = (data) => {
    setPortfolio(data);
    const ws = data.wallets || [];
    setWallets(ws);
    // Show onboarding for brand-new users (no wallets + never completed before)
    if (ws.length === 0) {
      try {
        if (!localStorage.getItem("w76_onboarding_done")) setShowOnboarding(true);
      } catch { /* noop */ }
    }
  };

  const handleTriggeredAlerts = (data) => {
    (data.triggered_alerts || []).forEach((al) => {
      if (seenAlertsRef.current.has(al.id)) return;
      seenAlertsRef.current.add(al.id);
      const dir = al.condition === "above" ? "↑" : "↓";
      const msg = `${al.symbol} is ${al.condition} $${al.target_price_usd.toFixed(2)} — now $${al.triggered_price_usd.toFixed(2)}`;
      toast(`🔔 Alert ${dir} ${al.symbol}`, { description: msg, duration: 8000 });
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try { new Notification(`${al.symbol} ${dir} ${al.target_price_usd.toFixed(2)}`, { body: msg, icon: "/favicon.ico" }); } catch {}
      }
    });
  };

  const load = async (silent = false) => {
    // Stale-while-revalidate: serve cache instantly, then refetch in background
    const cachedPortfolio = readCache("portfolio");
    const cachedHistory   = readCache("history");
    const cachedSparklines = readCache("sparklines");

    if (cachedPortfolio && cachedHistory && cachedSparklines) {
      // All three cached — show immediately, skip skeleton
      applyPortfolio(cachedPortfolio);
      setHistory(cachedHistory);
      setChartLoading(false);
      setSparklines(cachedSparklines);
      setLoading(false);
      // Still refetch silently to keep data fresh
      setRefreshing(true);
    } else {
      // No cache (first visit or expired) — show skeleton
      if (!silent) setLoading(true); else setRefreshing(true);
    }

    // Fetch portfolio first — it's the critical one; history/sparklines are decorative
    try {
      const p = await api.get("/portfolio");
      applyPortfolio(p.data);
      writeCache("portfolio", p.data);
      handleTriggeredAlerts(p.data);
    } catch (e) {
      const status = e.response?.status;
      if (status === 401) {
        toast.error(t("common.session_expired"), { id: "session-expired", duration: 8000 });
      } else if (!cachedPortfolio) {
        toast.error(formatApiErrorDetail(e.response?.data?.detail) || t("dash.load_error"), { id: "portfolio-error" });
      }
    }

    // History and sparklines can fail silently — they only affect charts.
    // Request-id guard: only apply this response if no newer /history fetch
    // has started in the meantime (see historyReqIdRef declaration above).
    const myReqId = ++historyReqIdRef.current;
    try {
      const h = await api.get(`/history?range=${range}${filterWallet !== "all" ? `&wallet_id=${filterWallet}` : ""}${filterType !== "all" ? `&asset_type=${filterType}` : ""}`);
      if (historyReqIdRef.current === myReqId) {
        setHistory(h.data || []);
        setChartLoading(false);
        writeCache("history", h.data || []);
      }
    } catch (e) {
      if (historyReqIdRef.current === myReqId) setChartLoading(false);
      if (e?.response?.status === 401) {
        toast.error(t("common.session_expired"), { id: "session-expired", duration: 8000 });
      }
      /* else noop — chart stays empty */
    }

    try {
      const sp = await api.get("/sparklines");
      const spData = sp.data || {};
      console.log("[sparklines] received keys:", Object.keys(spData));
      setSparklines(spData);
      // Only cache if we actually got data — empty response should be retried
      if (Object.keys(spData).length > 0) {
        writeCache("sparklines", spData);
      }
    } catch (e) {
      // Log sparkline errors to browser console to help debug
      console.warn("[sparklines] fetch failed:", e?.message || e);
    }

    setLastSync(new Date());
    setLoading(false);
    setRefreshing(false);
  };

  // Share link helpers
  const loadShareStatus = async () => {
    try {
      const { data } = await api.get("/share/status");
      setShareData(data.active ? data : null);
    } catch { /* noop */ }
  };

  const generateShare = async () => {
    setShareLoading(true);
    try {
      const { data } = await api.post("/share/generate");
      setShareData(data);
    } catch { toast.error("Failed to generate share link."); }
    finally { setShareLoading(false); }
  };

  const revokeShare = async () => {
    setShareLoading(true);
    try {
      await api.delete("/share");
      setShareData(null);
    } catch { toast.error("Failed to revoke share link."); }
    finally { setShareLoading(false); }
  };

  const toggleShareHideValues = async () => {
    if (!shareData) return;
    const next = !shareData.hide_values;
    try {
      await api.patch("/share/settings", { hide_values: next });
      setShareData((d) => ({ ...d, hide_values: next }));
    } catch { toast.error("Failed to update setting."); }
  };

  const copyShareLink = () => {
    const url = `${window.location.origin}/p/${shareData.slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => { loadShareStatus(); }, []);

  const runBackfill = async () => {
    setBackfilling(true);
    try {
      await api.post("/history/backfill-types");
      await load(true);
    } catch (e) {
      // silent — chart just stays empty
    } finally {
      setBackfilling(false);
    }
  };

  // Clear stale history immediately when range/carteira/tipo mudam, e marca
  // o gráfico como "a carregar" (ver chartLoading) em vez de deixá-lo cair
  // no estado "sem dados" enquanto o fetch novo ainda está em curso — os
  // dois eram visualmente idênticos antes desta mudança, o que fazia
  // qualquer resposta um pouco lenta (ex.: retries do CoinGecko 429, que
  // podem levar vários segundos) parecer um gráfico partido.
  useEffect(() => { setHistory([]); setChartLoading(true); }, [range, filterType, filterWallet]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range, filterWallet, filterType]);
  // Full reload every 5 minutes (history + sparklines + portfolio)
  useEffect(() => {
    const t = setInterval(() => { load(true); }, 300_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, filterWallet, filterType]);

  // Lightweight price-only refresh every 60s (stocks + crypto fallback)
  const livePriceOverlayState = React.useRef({});
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const r = await api.get("/prices/live");
        livePriceOverlayState.current = r.data || {};
        // Trigger re-render by updating a cheap counter state
        setLivePriceVersion(v => v + 1);
      } catch { /* noop */ }
    };
    fetchPrices(); // immediate on mount
    const t = setInterval(fetchPrices, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fxRates = useMemo(
    () => portfolio?.summary?.fx_rates || { USD: 1, EUR: portfolio?.summary?.eur_rate || 0.92, CHF: portfolio?.summary?.chf_rate || 0.88, BRL: portfolio?.summary?.brl_rate || 5.0 },
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
      if (live?.price) return { price: live.price, live: true, delayed: false };
      // Fallback: check livePriceOverlay for crypto too
      const overlay = livePriceOverlayState.current[`crypto:${(a.symbol || "").toUpperCase()}`];
      if (overlay?.price_usd) return { price: overlay.price_usd, live: true, delayed: false };
    }
    // Stocks/ETFs: check lightweight price overlay
    const EQUITY_TYPES = ["stock", "etf", "fund", "bond"];
    if (EQUITY_TYPES.includes(a.asset_type)) {
      const overlay = livePriceOverlayState.current[`stock:${(a.symbol || "").toUpperCase()}`];
      if (overlay?.price_usd) return { price: overlay.price_usd, live: false, delayed: true };
    }
    return { price: a.price_usd, live: false, delayed: a.asset_type !== "crypto" };
  };

  const allHoldings = useMemo(() => {
    const list = (portfolio?.assets || []).filter((a) => a.quantity > 0);

    return list.map((a) => {
      const { price, live, delayed } = getLivePrice(a);

      const safePrice = price > 0 ? price : Number(a.price_usd || 0);
      const value = Number(a.value_usd || safePrice * a.quantity || 0);
      const cost = Number(a.cost_usd || 0);
      const pnl = Number(a.pnl_usd ?? (value - cost));
      const pnl_pct = Number(a.pnl_pct ?? (cost > 0 ? (pnl / cost) * 100 : 0));

      return {
        ...a,
        live_price_usd: safePrice,
        live,
        delayed: delayed ?? false,
        value_usd: value,
        pnl_usd: pnl,
        pnl_pct,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio, livePrices, livePriceVersion]);

  // Holdings scoped by the selected wallet only (NOT by filterType — that
  // would be circular, since this is what decides which type pills even
  // exist). "Todas as carteiras" (filterWallet === "all") sees everything.
  const holdingsInWalletScope = useMemo(() => {
    if (filterWallet === "all") return allHoldings;
    return allHoldings.filter((a) => a.wallet_id === filterWallet);
  }, [allHoldings, filterWallet]);

  // Which asset types exist in the CURRENT wallet scope — used to hide
  // filter pills like "Crypto"/"ETFs" entirely when there's nothing of that
  // type to filter to. Scoped to the selected wallet, not the whole
  // portfolio: e.g. a wallet holding only crypto should only ever show the
  // "Crypto" pill, even if some other wallet holds stocks/ETFs. Selecting
  // "Todas as carteiras" shows the union across every wallet.
  const presentAssetTypes = useMemo(
    () => new Set(holdingsInWalletScope.map((a) => a.asset_type)),
    [holdingsInWalletScope]
  );

  // Union of asset types across the WHOLE portfolio (every wallet) — used
  // only for the "Global" row's type pills, which stay visible regardless
  // of which wallet (if any) is currently selected.
  const globalAssetTypes = useMemo(
    () => new Set(allHoldings.map((a) => a.asset_type)),
    [allHoldings]
  );

  // If the active type filter no longer has a matching pill after switching
  // wallets (e.g. filtering by "Stocks" then jumping to a crypto-only
  // wallet), fall back to "all" instead of silently showing an empty table
  // for a pill that isn't even visible anymore.
  useEffect(() => {
    if (filterType !== "all" && !presentAssetTypes.has(filterType)) {
      setFilterType("all");
    }
  }, [presentAssetTypes, filterType]);

  const filtered = useMemo(() => {
    return allHoldings.filter((a) => {
      if (filterType !== "all" && a.asset_type !== filterType) return false;
      if (filterWallet !== "all" && a.wallet_id !== filterWallet) return false;
      return true;
    });
  }, [allHoldings, filterType, filterWallet]);

  const selectedWallet = wallets.find((w) => w.id === filterWallet);

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

  filtered.forEach((a) => {
    // Raw class key kept alongside the translated label (in class mode) so
    // the pie's own slice colors can match ALLOCATION_CLASS_COLOR — the
    // same fixed palette used by the editable target rows underneath —
    // instead of the generic index-based PIE_COLORS.
    const rawCls = allocationMode === "class" ? (effectiveClass(a, allocOverrides) || "other") : null;
    const key =
      allocationMode === "class"
        ? ({
            crypto: t("common.crypto"),
            stock: t("common.stocks"),
            etf: t("common.etfs"),
            fund: t("common.funds"),
            bond: t("common.bonds"),
            cash: t("common.cash"),
          }[rawCls] || t("common.other"))
        : a.symbol;

    if (!agg[key]) {
      agg[key] = { value: 0, symbol: a.symbol, asset_type: a.asset_type, coingecko_id: a.coingecko_id, cls: rawCls };
    }
    agg[key].value += Number(a.value_usd || 0);
  });

  const total = Object.values(agg).reduce((s, v) => s + v.value, 0);

  if (!total) return [];

  const sorted = Object.entries(agg)
    .map(([name, meta]) => ({ name, value: meta.value, pct: (meta.value / total) * 100, symbol: meta.symbol, asset_type: meta.asset_type, coingecko_id: meta.coingecko_id, cls: meta.cls }))
    .sort((a, b) => b.value - a.value);

  // In asset mode with many items, group the tail into "Others"
  const MAX_ITEMS = 7;
  if (allocationMode !== "class" && sorted.length > MAX_ITEMS) {
    const top = sorted.slice(0, MAX_ITEMS);
    const othersValue = sorted.slice(MAX_ITEMS).reduce((s, x) => s + x.value, 0);
    if (othersValue > 0) {
      top.push({ name: t("common.other") || "Others", value: othersValue, pct: (othersValue / total) * 100 });
    }
    return top;
  }

  return sorted;
}, [filtered, allocationMode, allocOverrides, t]);

  const hasAllocationTarget = Object.keys(allocTargets).length > 0;

  // "UPGRADE v1.0" — live drag state for the Dashboard widget's own inline
  // sliders (auto-rebalancing across the other 4 classes, see
  // redistributeAllocationTargets). null when nothing is being dragged;
  // otherwise the in-progress redistributed targets, so the bars respond
  // immediately while dragging, before the change is committed on release.
  const [draftAllocTargets, setDraftAllocTargets] = useState(null);
  const effectiveAllocTargets = draftAllocTargets || allocTargets;

  const handleClassSliderDrag = (cls, rawVal) => {
    const base = draftAllocTargets || allocTargets;
    setDraftAllocTargets(redistributeAllocationTargets(base, cls, rawVal));
  };
  const commitClassSliderDrag = async () => {
    if (!draftAllocTargets) return;
    const targets = draftAllocTargets;
    setDraftAllocTargets(null);
    setAllocTargets(targets); // optimistic
    try {
      await api.put("/allocation/target", { targets });
    } catch (e) {
      toast.error(formatApiErrorDetail(e?.response?.data?.detail) || t("alloc.toast_target_failed"));
      loadAllocationPrefs(); // revert to server truth on failure
    }
  };

  // "UPGRADE v1.0" — target vs. actual per class, merged into the pie
  // legend itself (class mode) instead of a separate block. Built from
  // `filtered` — same scope as the pie chart above it — so the row you're
  // editing always matches the slice you're looking at (global by default,
  // or whichever wallet/type pill is active). The target values themselves
  // are still the one global setting (routes/allocation.py has no concept
  // of a per-wallet target), only "actual" varies with the filter.
  const classAllocationRows = useMemo(() => {
    if (!hasAllocationTarget) return [];
    const totals = aggregateByClass(filtered, allocOverrides);
    const totalValue = Object.values(totals).reduce((s, v) => s + v, 0);
    // Union of the 5 known classes + any class actually held (covers e.g.
    // legacy "bond" holdings with no target — shown with target 0%).
    const classes = new Set([...ALLOCATION_CLASSES, ...Object.keys(totals)]);
    return Array.from(classes)
      .map((cls) => {
        const targetPct = Number(effectiveAllocTargets[cls] || 0);
        const valueUsd = totals[cls] || 0;
        const actualPct = totalValue > 0 ? (valueUsd / totalValue) * 100 : 0;
        const deviation = actualPct - targetPct;
        const adjustmentUsd = totalValue > 0 ? ((targetPct - actualPct) / 100) * totalValue : 0;
        return {
          cls,
          labelKey: ALLOCATION_CLASS_LABEL_KEY[cls] || null,
          editable: ALLOCATION_CLASSES.includes(cls),
          targetPct, actualPct, deviation, valueUsd, adjustmentUsd,
        };
      })
      // Classes with nothing going on (no target, no holdings) are just
      // noise — hide them. A class you hold but haven't targeted (or vice
      // versa) stays visible since that IS the actionable info.
      .filter((row) => row.targetPct > 0 || row.actualPct > 0)
      .sort((a, b) => b.actualPct - a.actualPct || b.targetPct - a.targetPct);
  }, [hasAllocationTarget, filtered, effectiveAllocTargets, allocOverrides]);

  const lineData = useMemo(() => {
    const raw = (history || [])
      .map((s) => ({
        ts: s.ts || s.date,
        value: convert(s.total_usd, currency, fxRates),
      }))
      .filter((p) => Number(p.value) > 0);

    return raw;
  }, [history, currency, fxRates]);

  // Crypto trades 24/7, so a mixed or crypto-only view has real portfolio
  // movement through the weekend — keep those points and just tint them.
  // A pure stocks/ETFs/etc view never changes over the weekend (nothing
  // traded), so those points are dropped instead of shown as a flat line.
  const hasCrypto = useMemo(() => filtered.some((a) => a.asset_type === "crypto"), [filtered]);

  const strippedLineData = useMemo(() => {
    if (hasCrypto) return lineData;
    return lineData.filter((p) => {
      const day = new Date(p.ts).getDay();
      return day !== 0 && day !== 6;
    });
  }, [lineData, hasCrypto]);

  // Portfolio value candles — buckets the raw ~15min snapshots into OHLC
  // candles at whatever timeframe is selected, same idea as the per-asset
  // charts (see backend/routes/news.py _resample_ohlc).
  const candleData = useMemo(() => {
    const bucketed = bucketOHLC(strippedLineData, "ts", "value", CHART_RANGE_BUCKET_MS[range]);
    // Same cap the backend applies to every asset chart: last N_BARS
    // candles, or fewer if there isn't that much snapshot history yet.
    // "all" is the one exception — full history, uncapped.
    const sliced = range === "all" ? bucketed : bucketed.slice(-N_BARS);
    // Attach each candle's previous close (prevC) so the tooltip can always
    // show a change badge — comparing a bucket's own open vs close only
    // works when it has real intra-bucket movement, which single-point
    // buckets (common on coarse ranges like 1M/1Y) never do, since a lone
    // point has open === close. Comparing against the previous candle's
    // close instead basically always has something to show.
    return sliced.map((d, i) => (i > 0 ? { ...d, prevC: sliced[i - 1].c } : d));
  }, [strippedLineData, range]);

  // Gated by range: on 1D-or-coarser ranges every candle already starts its
  // own day/week/etc, so a "day changed" marker would draw on every single
  // candle — meaningless, and on "ALL" (a year+ of daily candles) heavy
  // enough to visibly lag the chart on hover. See CHART_RANGES_DAY_MARKERS.
  const lineDayBoundaries = useMemo(
    () => (CHART_RANGES_DAY_MARKERS.has(range) ? getDayBoundaries(candleData, "t") : []),
    [candleData, range]
  );
  const lineWeekendBands = useMemo(
    () => (CHART_RANGES_WEEKEND_SHADING.has(range) ? getWeekendBands(candleData, "t") : []),
    [candleData, range]
  );

  const candleYDomain = useMemo(() => {
    if (!candleData.length) return ["auto", "auto"];
    const highs = candleData.map((d) => d.h);
    const lows = candleData.map((d) => d.l);
    const max = Math.max(...highs);
    const min = Math.min(...lows);
    const pad = (max - min) * 0.08 || max * 0.01 || 1;
    return [min - pad, max + pad];
  }, [candleData]);

const bestPerformer = useMemo(() => {
  if (!filtered.length) return null;
  return [...filtered].sort((a, b) => b.pnl_pct - a.pnl_pct)[0];
}, [filtered]);

const worstPerformer = useMemo(() => {
  if (!filtered.length) return null;
  return [...filtered].sort((a, b) => a.pnl_pct - b.pnl_pct)[0];
}, [filtered]);

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
  const chartIsPositive =
    candleData.length > 1 &&
    Number(candleData[candleData.length - 1]?.c || 0) >= Number(candleData[0]?.c || 0);

  const summarySparkData = lineData.map((p) => ({
    t: p.ts,
    p: Number(p.value || 0),
  }));

  if (loading) {
    return <DashboardSkeleton data-testid="dashboard-loading" />;
  }

  return (
    <div className="flex flex-col gap-6 fade-in">
      {/* Widget settings drawer */}
      <DashboardWidgetDrawer
        open={widgetDrawer}
        onClose={() => { setWidgetDrawer(false); syncPillVisibility(); }}
        widgetConfig={widgetConfig}
        setWidgetConfig={setWidgetConfig}
        widgetDefs={WIDGET_DEFS}
        wallets={wallets}
      />

      {/* Free plan usage banner */}
      {!isPro && (() => {
        const assetCount = (portfolio?.assets || []).filter((a) => a.quantity > 0).length;
        const walletCount = wallets.length;
        if (assetCount < 8 && walletCount < 1) return null;
        const atAssetLimit = assetCount >= 10;
        const atWalletLimit = walletCount >= 1;
        return (
          <div className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border text-sm ${atAssetLimit ? "bg-rose-950/30 border-rose-800/50 text-rose-300" : "bg-amber-950/20 border-amber-800/40 text-amber-300"}`}>
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="uppercase tracking-widest opacity-60">Free plan</span>
              {atWalletLimit && <span className="px-1.5 py-0.5 rounded border border-current/30 bg-current/10">{walletCount}/1 wallets</span>}
              {assetCount >= 8 && <span className="px-1.5 py-0.5 rounded border border-current/30 bg-current/10">{assetCount}/10 assets</span>}
            </div>
            <Link to="/pricing" className="text-xs font-mono uppercase tracking-widest hover:opacity-80 transition-opacity">
              Upgrade →
            </Link>
          </div>
        );
      })()}

      {/* Onboarding overlay for new users */}
      {showOnboarding && (
        <OnboardingFlow
          onComplete={() => {
            setShowOnboarding(false);
            // Reload dashboard to pick up the newly created wallet + asset
            load();
          }}
        />
      )}
      {/* Title row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-light tracking-tight text-zinc-50">
            {selectedWallet ? selectedWallet.name : t("dash.title")}
          </h1> 
            <p className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-500 mt-1.5" data-testid="dashboard-subtitle">
              {selectedWallet
                ? t("dash.wallet_subtitle", {
                    count: filtered.length,
                  })
                : t("dash.subtitle", {
                    count: totalCount,
                    wallets: walletCount,
                  })}
            </p>
          </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setWidgetDrawer(true)}
            className="p-2 border border-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 transition-colors"
            title={t("dash.widgets_customize")}
          >
            <LayoutDashboard className="w-4 h-4" />
          </button>
          <button
            onClick={togglePrivacy}
            className={`p-2 border rounded-md transition-colors ${hideValues ? "border-amber-500/40 text-amber-300 bg-amber-500/10" : "border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"}`}
            data-testid="privacy-toggle"
            title={hideValues ? "Show values" : "Hide values (privacy mode)"}
          >
            {hideValues ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
          </button>
          <button
            onClick={() => setSharePanel((v) => !v)}
            className={`p-2 border rounded-md transition-colors ${sharePanel ? "border-blue-500/40 text-blue-300 bg-blue-500/10" : "border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"}`}
            title="Share portfolio"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <Link to="/alerts">
            <Button variant="outline" size="sm" className="bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100" data-testid="alerts-btn">
              <Bell className="w-4 h-4 mr-2"/> {t("common.alerts")}
            </Button>
          </Link>
          <div className="flex flex-col items-end gap-0.5">
            <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing} className="bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100" data-testid="refresh-btn">
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}/>
              {refreshing ? t("common.updating") : t("common.refresh")}
            </Button>
            {lastSync && !refreshing && (
              <span className="text-[10px] text-zinc-400 font-mono pr-0.5">
                {t("common.updated")} {(() => { const m = Math.round((Date.now() - lastSync.getTime()) / 60000); return m < 1 ? "< 1" : m; })()}min
              </span>
            )}
          </div>
          <Link to="/transactions">
            <Button size="sm" className="bg-blue-500 hover:bg-blue-400 text-zinc-950 font-medium" data-testid="goto-tx-btn">
              <Receipt className="w-4 h-4 mr-2"/> + {t("common.add")}
            </Button>
          </Link>
        </div>
      </div>

      {/* Share panel */}
      {sharePanel && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
              <Share2 className="w-4 h-4 text-blue-400" /> Share Portfolio
            </div>
            <button onClick={() => setSharePanel(false)} className="text-zinc-500 hover:text-zinc-300">
              <X className="w-4 h-4" />
            </button>
          </div>

          {shareData ? (
            <div className="space-y-3">
              {/* Link copy row */}
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-400 truncate">
                  {window.location.origin}/p/{shareData.slug}
                </div>
                <button
                  onClick={copyShareLink}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-400 text-white text-xs rounded-lg transition-colors font-medium"
                >
                  {copied ? <><Check className="w-3 h-3" /> Copied</> : <><LinkIcon className="w-3 h-3" /> Copy</>}
                </button>
              </div>

              {/* Hide values toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-zinc-400">Hide monetary values in public view</span>
                <button
                  onClick={toggleShareHideValues}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${shareData.hide_values ? "bg-blue-500" : "bg-zinc-700"}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${shareData.hide_values ? "translate-x-4" : "translate-x-1"}`} />
                </button>
              </label>

              {/* Revoke */}
              <button
                onClick={revokeShare}
                disabled={shareLoading}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Revoke link
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500 leading-relaxed">
                Generate a read-only link to share your portfolio publicly. Anyone with the link can view your holdings without logging in.
              </p>
              <button
                onClick={generateShare}
                disabled={shareLoading}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white text-sm rounded-lg transition-colors font-medium"
              >
                {shareLoading ? "Generating…" : "Generate share link"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Summary cards */}
      <div style={{ order: wOrder("summary"), display: wVisible("summary") ? undefined : "none" }}
           className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<DollarSign className="w-4 h-4"/>}
          label={t("dash.balance")}
          value={mask(fmtCompact(convert(summary.total, currency, fxRates), currency))}
          delta={fmtPct(summary.cost > 0 ? ((summary.total - summary.cost) / summary.cost) * 100 : 0)}
          positive={(summary.total - summary.cost) >= 0}
          testId="card-total-balance"
          tint="blue"
          sparkline={
            <Sparkline
              data={summarySparkData}
              positive={chartIsPositive}
              width={86}
              height={26}
            />
          }
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
          
          sparkline={
            <Sparkline
              data={summarySparkData}
              positive={summary.pnl >= 0}
              width={86}
              height={26}
            />
          }
        />
        <SummaryCard
          icon={<Activity className="w-4 h-4"/>}
          label={t("dash.daily")}
          value={mask(fmtCurrency(convert(summary.daily, currency, fxRates), currency))}
          delta={hideValues ? "•••" : fmtPct(summary.dailyPct)}
          positive={summary.daily >= 0}
          testId="card-daily-change"
          tint={summary.daily >= 0 ? "emerald" : "rose"}
          sparkline={
            <Sparkline
              data={summarySparkData}
              positive={summary.daily >= 0}
              width={86}
              height={26}
            />
          }
        />
      </div>

      {/* Filter pills — always visible, anchored just after summary.
          Order: Global, then Global's own type pills (always present,
          union across every wallet) — then each wallet, with THAT wallet's
          own type pills opening inline right after it, but only while it's
          the selected one (so switching wallets doesn't stack every
          wallet's pills into one giant row). */}
      <div style={{ order: wOrder("summary") + 1 }} className="flex flex-wrap items-center gap-2">
        {pillVisible("global") && (
          <FilterPill
            active={filterType === "all" && filterWallet === "all"}
            onClick={() => { setFilterType("all"); setFilterWallet("all"); nav("/dashboard"); }}
            testId="filter-all" color="blue"
          >▦ {t("common.global")}</FilterPill>
        )}
        {TYPE_PILL_DEFS.map(({ key, color, icon, labelKey }) => (
          pillVisible(key) && globalAssetTypes.has(key) && (
            <FilterPill
              key={`global-${key}`}
              active={filterWallet === "all" && filterType === key}
              onClick={() => { setFilterWallet("all"); setFilterType(key); nav("/dashboard"); }}
              testId={`filter-${key}`}
              color={color}
            >{icon}{t(labelKey)}</FilterPill>
          )
        ))}

        {wallets.some((w) => walletPillVisible(w.id)) && (
          <div className="w-px h-5 bg-zinc-800 mx-1" />
        )}

        {wallets.map((w, i) => {
          if (!walletPillVisible(w.id)) return null;
          const walletColor = WALLET_COLOR_KEYS[i % WALLET_COLOR_KEYS.length];
          const dot = WALLET_DOT_CLASS[walletColor];
          const isActive = filterWallet === w.id;
          return (
            <React.Fragment key={w.id}>
              <FilterPill
                active={isActive}
                onClick={() => {
                  if (isActive) { setFilterWallet("all"); nav("/dashboard"); }
                  else { setFilterWallet(w.id); nav(`/dashboard?wallet=${w.id}`); }
                }}
                testId={`filter-wallet-${w.id}`}
                color={walletColor}
              >
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${dot}`} /> {w.name}
              </FilterPill>
              {/* This wallet's own type pills — only while it's selected,
                  opening immediately to its right, in the SAME color as the
                  wallet itself (not the generic per-type color) so the
                  expanded group reads as one unit. presentAssetTypes is
                  already scoped to filterWallet, so when isActive is true
                  it's exactly this wallet's set. */}
              {isActive && TYPE_PILL_DEFS.map(({ key, icon, labelKey }) => (
                presentAssetTypes.has(key) && (
                  <FilterPill
                    key={`${w.id}-${key}`}
                    active={filterType === key}
                    onClick={() => setFilterType(key)}
                    testId={`filter-wallet-${w.id}-${key}`}
                    color={walletColor}
                    coloredBorder
                  >{icon}{t(labelKey)}</FilterPill>
                )
              ))}
            </React.Fragment>
          );
        })}
      </div>


      {/* Top movers (my portfolio) */}
      {/* Top movers + Best/Worst performers — combined performance block */}
      <div style={{ order: wOrder("top_movers"), display: wVisible("top_movers") ? undefined : "none" }}
           className="space-y-3" data-testid="top-movers-widget">
        {filtered.length > 0 && (() => {
          const ranked = [...sorted].filter((a) => Number.isFinite(Number(a.change_24h)));

          const topUp = ranked
            .filter((a) => Number(a.change_24h) > 0)
            .sort((a, b) => Number(b.change_24h) - Number(a.change_24h))
            .slice(0, 3);

          const topDown = ranked
            .filter((a) => Number(a.change_24h) < 0)
            .sort((a, b) => Number(a.change_24h) - Number(b.change_24h))
            .slice(0, 3);

          const topUpDisplay = topUp.length
            ? topUp
            : filtered
                .sort((a, b) => Number(b.pnl_pct) - Number(a.pnl_pct))
                .slice(0, 3)
                .map((a) => ({ ...a, change_24h: a.pnl_pct }));

          const topUpKeys = new Set(topUpDisplay.map((a) => `${a.symbol}-${a.wallet_id}`));

          const topDownDisplay = topDown.length
            ? topDown.filter((a) => !topUpKeys.has(`${a.symbol}-${a.wallet_id}`))
            : filtered
                .filter((a) => !topUpKeys.has(`${a.symbol}-${a.wallet_id}`))
                .sort((a, b) => Number(a.pnl_pct) - Number(b.pnl_pct))
                .slice(0, 3)
                .map((a) => ({ ...a, change_24h: a.pnl_pct }));

          return (
            <>
              {/* Row 1: 24h movers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowUpRight className="w-4 h-4 text-emerald-400"/>
                    <div className="text-xs font-mono uppercase tracking-[0.15em] text-emerald-400">{t("dash.top_movers_up")} 24h</div>
                  </div>
                  <div className="space-y-1.5">
                    {topUpDisplay.length ? (
                      topUpDisplay.map((a) => <TopMoverRow key={a.symbol + a.wallet_id} a={a} positive wallets={wallets} nav={nav} currency={currency} fxRates={fxRates} mask={mask} />)
                    ) : (
                      <div className="text-xs text-zinc-500 font-mono px-3 py-2">{t("dash.no_positive_movers")}</div>
                    )}
                  </div>
                </div>
                <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowDownRight className="w-4 h-4 text-rose-400"/>
                    <div className="text-xs font-mono uppercase tracking-[0.15em] text-rose-400">{t("dash.top_movers_down")} 24h</div>
                  </div>
                  <div className="space-y-1.5">
                    {topDownDisplay.length ? (
                      topDownDisplay.map((a) => <TopMoverRow key={a.symbol + a.wallet_id} a={a} positive={false} wallets={wallets} nav={nav} currency={currency} fxRates={fxRates} mask={mask} />)
                    ) : (
                      <div className="text-xs text-zinc-500 font-mono px-3 py-2">{t("dash.no_negative_movers")}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 2: Best / Worst performer (all-time) */}
              {wVisible("performers") && bestPerformer && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SummaryCard
                    icon={<AssetIcon asset={bestPerformer} size={22} />}
                    label={t("dash.best_performer")}
                    value={bestPerformer.symbol}
                    delta={`${mask(fmtCurrency(convert(bestPerformer.pnl_usd, currency, fxRates), currency))} · ${fmtPct(bestPerformer.pnl_pct)}`}
                    positive={bestPerformer.pnl_pct >= 0}
                    testId="card-best-performer"
                    tint="emerald"
                  />
                  {worstPerformer && worstPerformer.symbol !== bestPerformer.symbol && (
                    <SummaryCard
                      icon={<AssetIcon asset={worstPerformer} size={22} />}
                      label={t("dash.worst_performer")}
                      value={worstPerformer.symbol}
                      delta={`${mask(fmtCurrency(convert(worstPerformer.pnl_usd, currency, fxRates), currency))} · ${fmtPct(worstPerformer.pnl_pct)}`}
                      positive={worstPerformer.pnl_pct >= 0}
                      testId="card-worst-performer"
                      tint="rose"
                    />
                  )}
                </div>
              )}
            </>
          );
        })()}
      </div>{/* /top_movers+performers widget */}

      {/* Charts row — evolution + allocation share a responsive grid */}
      <div style={{ order: chartsOrder }}
           className={`grid gap-4 ${
             wVisible("evolution") && wVisible("allocation")
               ? "grid-cols-1 lg:grid-cols-3"
               : "grid-cols-1"
           } ${!wVisible("evolution") && !wVisible("allocation") ? "hidden" : ""}`}>
        <div className={`${wVisible("evolution") && wVisible("allocation") ? "lg:col-span-2" : "col-span-full"} bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5 ${!wVisible("evolution") ? "hidden" : ""}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium text-zinc-300">{t("dash.evolution")}</div>
              {filterType !== "all" && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400 bg-zinc-800/60">
                  {TYPE_LABELS[filterType] || filterType}
                </span>
              )}
            </div>

            <div className="flex border border-zinc-800 rounded-md overflow-hidden" data-testid="range-selector">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRange(r.value)}
                  className={`px-2 sm:px-2.5 py-1 text-[10px] sm:text-xs font-mono transition-colors ${
                    range === r.value
                      ? "bg-zinc-100 text-zinc-950"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                  data-testid={`range-${r.value}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-64 sm:h-72" data-testid="allocation-chart">
            {candleData.length > 1 ? (
              // minWidth/minHeight: sem isto, o Recharts por vezes mede o
              // contentor com width(-1)/height(-1) mesmo antes do layout da
              // grid assentar (mais notório ao trocar de carteira/tempo,
              // que remonta este ResponsiveContainer do zero) e não desenha
              // nada — mesmo com dados corretos. Garante sempre um tamanho
              // válido para o primeiro render.
              <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={180}>
                <ComposedChart data={candleData} margin={{ top: 8, right: 14, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="evoAreaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartIsPositive ? "#10b981" : "#ef4444"} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={chartIsPositive ? "#10b981" : "#ef4444"} stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    stroke="#27272a"
                    strokeDasharray="3 3"
                    vertical={false}
                    opacity={0.55}
                  />

                  <XAxis
                    dataKey="t"
                    type="category"
                    stroke="#52525b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={CHART_RANGES_SHOW_DATE.has(range) ? 60 : 32}
                    interval="preserveStartEnd"
                    tickFormatter={(v) => {
                      try {
                        // O tick mais à direita é sempre o candle mais recente
                        // (o "agora" do gráfico) — mostrar "Hoje" em vez da
                        // data de início do seu bucket, que em ranges largos
                        // (1M/1Y) pode ficar meses/anos no passado e não
                        // significa nada para quem está a ler o gráfico.
                        const isLastTick = candleData.length > 0 && v === candleData[candleData.length - 1].t;
                        if (isLastTick && CHART_RANGES_SHOW_DATE.has(range)) {
                          return t("common.today");
                        }
                        const d = new Date(v);
                        if (CHART_RANGES_SHOW_DATE.has(range)) {
                          // Ano incluído sempre que o range pode razoavelmente
                          // cruzar anos (1W/1M/1Y/ALL, dada a regra dos 70
                          // candles) — sem isto, "18 Dez" no início e "18 Dez"
                          // um ano depois no fim ficam visualmente idênticos.
                          return d.toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" });
                        }
                        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                      } catch {
                        return v;
                      }
                    }}
                  />

                  <YAxis
                    stroke="#52525b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={58}
                    domain={candleYDomain}
                    tickFormatter={(v) =>
                      hideValues
                        ? "•••"
                        : `${curSymbol(currency)}${(v / 1000).toFixed(1)}K`
                    }
                  />

                  <Tooltip content={<AreaTooltip formatValue={(v) => (hideValues ? "•••••" : fmtCurrency(v, currency))} positive={chartIsPositive} />} />

                  {renderWeekendBands(lineWeekendBands)}
                  {renderDayBoundaries(lineDayBoundaries)}

                  <Area
                    type="monotone"
                    dataKey="c"
                    stroke={chartIsPositive ? "#10b981" : "#ef4444"}
                    strokeWidth={1.75}
                    fill="url(#evoAreaFill)"
                    isAnimationActive={false}
                    dot={false}
                    activeDot={{ r: 3.5, strokeWidth: 0 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : chartLoading ? (
              // Estado de carregamento distinto do "sem dados" — sem isto o
              // gráfico ficava indistinguível de vazio/partido enquanto o
              // fetch (que pode demorar vários segundos com retries do
              // CoinGecko) ainda estava em curso.
              <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-600 text-sm font-mono text-center px-6">
                <RefreshCw className="w-5 h-5 animate-spin text-zinc-500" />
                <span>{t("dash.chart_loading")}</span>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-600 text-sm font-mono text-center px-6">
                <span>{t("dash.chart_empty")}</span>
                {filterType !== "all" && (
                  <button
                    onClick={runBackfill}
                    disabled={backfilling}
                    className="px-3 py-1.5 text-xs rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors disabled:opacity-40"
                  >
                    {backfilling ? t("dash.chart_backfilling") : t("dash.chart_backfill_btn")}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className={`bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5 ${!wVisible("allocation") ? "hidden" : ""}`}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="text-sm font-medium text-zinc-300">
              {t("dash.allocation")}
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-md border border-zinc-800 bg-zinc-900/60 p-0.5">
                <button
                  type="button"
                  onClick={() => setAllocationMode("class")}
                  className={`px-2.5 py-1 text-[10px] font-mono rounded transition ${
                    allocationMode === "class"
                      ? "bg-zinc-100 text-zinc-950"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {t("common.class")}
                </button>

                <button
                  type="button"
                  onClick={() => setAllocationMode("asset")}
                  className={`px-2.5 py-1 text-[10px] font-mono rounded transition ${
                    allocationMode === "asset"
                      ? "bg-zinc-100 text-zinc-950"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {t("common.assets")}
                </button>
              </div>

              {/* "UPGRADE v1.0" — opens the target-allocation dialog */}
              <button
                type="button"
                onClick={() => setShowTargetDialog(true)}
                className="p-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
                title={t("alloc.configure_target")}
                data-testid="allocation-target-settings-btn"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Shared with AllocationTargetDialog's sliders — kept here too
              since this widget renders independently of whether the dialog
              is mounted. Thumb taller than the track (protrudes above/below)
              so it reads as a drag handle. */}
          <style>{`
            .alloc-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; border-radius: 9999px; outline: none; cursor: pointer; }
            .alloc-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 6px; height: 18px; border-radius: 3px; background: #fafafa; border: 1px solid #09090b; cursor: grab; box-shadow: 0 0 0 1px rgba(0,0,0,0.5); }
            .alloc-slider::-webkit-slider-thumb:active { cursor: grabbing; }
            .alloc-slider::-moz-range-thumb { width: 6px; height: 18px; border-radius: 3px; background: #fafafa; border: 1px solid #09090b; cursor: grab; }
            .alloc-slider::-moz-range-track { height: 6px; border-radius: 9999px; background: transparent; }
          `}</style>

          <div className="min-h-72" data-testid="allocation-chart">
            {pieData.length > 0 ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-full h-52 relative">
                  {/* Idle state: how many assets are in view (respects the
                      page's own wallet/type filter pills — global by
                      default). Hover a slice: back to %+name, as before. */}
                  {activeAllocation ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
                      <div className="text-lg font-bold text-zinc-100">
                        {activeAllocation.pct.toFixed(1)}%
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                        {activeAllocation.name}
                      </div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
                      <div className="text-lg font-bold text-zinc-100">{filtered.length}</div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{t("dash.assets")}</div>
                    </div>
                  )}

                  <ResponsiveContainer width="100%" height="100%" minWidth={150} minHeight={150}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={95}
                        paddingAngle={2}
                        stroke="#09090b"
                        label={renderPieSliceLabel}
                        labelLine={false}
                        onMouseEnter={(_, index) => setActiveAllocation(pieData[index])}
                        onMouseLeave={() => setActiveAllocation(null)}
                      >
                        {pieData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={allocationMode === "class" && entry.cls ? (ALLOCATION_CLASS_COLOR[entry.cls] || ALLOCATION_CLASS_COLOR.other) : PIE_COLORS[i % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>

                      {/* "UPGRADE v1.0" — compact custom tooltip: the
                          default Recharts box was oversized for this small
                          donut and covered too much of the chart. */}
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const item = payload[0]?.payload;
                          if (!item) return null;
                          const pct = (Number(item.value || 0) / totalForAlloc) * 100;
                          return (
                            <div className="bg-zinc-950/95 border border-zinc-800 rounded-md px-2.5 py-1.5 shadow-xl backdrop-blur-sm max-w-[170px]">
                              <div className="text-[10px] font-mono text-zinc-400 truncate">{item.name}</div>
                              <div className="text-xs font-mono font-semibold text-zinc-100 mt-0.5 whitespace-nowrap">
                                {hideValues ? "•••••" : fmtCurrency(convert(item.value, currency, fxRates), currency)}
                                <span className="text-zinc-500 font-normal ml-1.5">{pct.toFixed(1)}%</span>
                              </div>
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {allocationMode === "class" && hasAllocationTarget ? (
                  // "UPGRADE v1.0" — the pie's own class legend, now doubling
                  // as the editable target editor: dragging a slider here
                  // auto-rebalances the other 4 classes so the total always
                  // stays at 100 (the separate dialog stays free-edit, per
                  // the user's explicit choice).
                  <div className="w-full space-y-3" data-testid="allocation-class-rows">
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-zinc-600">
                      <span>{t("dash.assets")}</span>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="w-9 text-right">{t("alloc.target_pct")}</span>
                        <span className="w-9 text-right">{t("alloc.actual_pct")}</span>
                        <span className="w-11 text-right">{t("alloc.deviation")}</span>
                        <span className="w-16 text-right">{t("alloc.adjustment")}</span>
                      </div>
                    </div>

                    {classAllocationRows.map((row) => {
                      const label = row.labelKey ? t(row.labelKey) : row.cls;
                      const outOfRange = Math.abs(row.deviation) > 5;
                      const color = ALLOCATION_CLASS_COLOR[row.cls] || ALLOCATION_CLASS_COLOR.other;
                      return (
                        <div key={row.cls} className="space-y-1.5" data-testid={`allocation-row-${row.cls}`}>
                          <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                            <span className="text-zinc-300 truncate">{label}</span>
                            <div className="flex items-center gap-2.5 shrink-0">
                              <span className="w-9 text-right text-zinc-100 font-semibold" data-testid={`allocation-target-value-${row.cls}`}>
                                {row.targetPct.toFixed(0)}%
                              </span>
                              <span className={`w-9 text-right ${outOfRange ? (row.deviation > 0 ? "text-amber-400" : "text-sky-400") : "text-emerald-400"}`}>{row.actualPct.toFixed(1)}%</span>
                              <span className={`w-11 text-right ${outOfRange ? (row.deviation > 0 ? "text-amber-400" : "text-sky-400") : "text-emerald-400"}`}>
                                {row.deviation > 0 ? "+" : ""}{row.deviation.toFixed(1)}%
                              </span>
                              <span className={`w-16 text-right ${row.adjustmentUsd > 0 ? "text-emerald-400" : row.adjustmentUsd < 0 ? "text-rose-400" : "text-zinc-600"}`}>
                                {hideValues ? "•••••" : `${row.adjustmentUsd >= 0 ? "+" : ""}${fmtCurrency(convert(row.adjustmentUsd, currency, fxRates), currency)}`}
                              </span>
                            </div>
                          </div>

                          {row.editable ? (
                            // Colored fill = ACTUAL % (informational, not
                            // driven by the input itself); the thumb's
                            // position = TARGET %, which is what dragging
                            // actually controls (native input value). The
                            // two are deliberately decoupled so both numbers
                            // are visible on the same bar at a glance.
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={row.targetPct}
                              onChange={(e) => handleClassSliderDrag(row.cls, e.target.value)}
                              onMouseUp={commitClassSliderDrag}
                              onTouchEnd={commitClassSliderDrag}
                              onKeyUp={commitClassSliderDrag}
                              className="alloc-slider"
                              style={{ background: `linear-gradient(to right, ${color} 0%, ${color} ${Math.min(row.actualPct, 100)}%, #27272a ${Math.min(row.actualPct, 100)}%, #27272a 100%)` }}
                              data-testid={`allocation-slider-${row.cls}`}
                            />
                          ) : (
                            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${Math.min(Math.max(row.actualPct, 0), 100)}%`, backgroundColor: color }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="w-full space-y-2 max-h-44 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                    {pieData.map((item, i) => {
                      const pct = ((Number(item.value || 0) / totalForAlloc) * 100).toFixed(1);
                      // "UPGRADE v1.0" — small class/group tag before the
                      // logo in Assets view only (leaves everything else in
                      // this row untouched), so you can see at a glance
                      // which allocation class each asset belongs to —
                      // respects manual per-symbol overrides, same as the
                      // Class view.
                      const itemCls = item.asset_type ? effectiveClass({ symbol: item.symbol, asset_type: item.asset_type }, allocOverrides) : null;
                      const itemClsColor = itemCls ? (ALLOCATION_CLASS_COLOR[itemCls] || ALLOCATION_CLASS_COLOR.other) : null;
                      const itemClsLabel = itemCls ? (ALLOCATION_CLASS_LABEL_KEY[itemCls] ? t(ALLOCATION_CLASS_LABEL_KEY[itemCls]) : t("common.other")) : null;

                      return (
                        <div key={item.name} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              {item.asset_type && allocationMode !== "class" ? (
                                <AssetIcon
                                  asset={{ symbol: item.symbol, asset_type: item.asset_type, coingecko_id: item.coingecko_id }}
                                  size={16}
                                  rounded="rounded-sm"
                                />
                              ) : (
                                <span
                                  className="w-2 h-2 rounded-sm shrink-0"
                                  style={{ backgroundColor: allocationMode === "class" && item.cls ? (ALLOCATION_CLASS_COLOR[item.cls] || ALLOCATION_CLASS_COLOR.other) : PIE_COLORS[i % PIE_COLORS.length] }}
                                />
                              )}
                              <span className="text-zinc-300 truncate">{item.name}</span>
                            </div>

                            {item.asset_type && allocationMode !== "class" && (
                              // Fixed width so every badge lines up the same
                              // regardless of label length (color unchanged).
                              <span
                                className="shrink-0 w-10 text-center text-[8px] font-mono font-bold uppercase tracking-wide px-1 py-0.5 rounded truncate"
                                style={{ color: itemClsColor, backgroundColor: `${itemClsColor}22`, border: `1px solid ${itemClsColor}55` }}
                                title={itemClsLabel}
                                data-testid={`allocation-asset-class-tag-${item.symbol}`}
                              >
                                {itemClsLabel}
                              </span>
                            )}

                            <div className="text-zinc-500 shrink-0">
                              {pct}%
                            </div>
                          </div>

                          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(Number(pct), 100)}%`,
                                backgroundColor: allocationMode === "class" && item.cls ? (ALLOCATION_CLASS_COLOR[item.cls] || ALLOCATION_CLASS_COLOR.other) : PIE_COLORS[i % PIE_COLORS.length],
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-600 text-sm font-mono text-center px-4">
                {t("dash.no_assets")}
              </div>
            )}
          </div>

          {allocationMode === "class" && pieData.length > 0 && !hasAllocationTarget && (
            <div className="mt-4 pt-4 border-t border-zinc-800/60 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[11px] font-mono text-zinc-500">{t("alloc.no_target_hint")}</div>
              <button
                type="button"
                onClick={() => setShowTargetDialog(true)}
                className="px-2.5 py-1 text-[10px] font-mono rounded-md border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:border-zinc-500 transition-colors"
                data-testid="allocation-define-target-btn"
              >
                {t("alloc.define_target_cta")}
              </button>
            </div>
          )}
        </div>
      </div>

      {showTargetDialog && (
        <AllocationTargetDialog
          open={showTargetDialog}
          onOpenChange={setShowTargetDialog}
          initialTargets={allocTargets}
          holdings={allHoldings}
          overrides={allocOverrides}
          onSaved={(targets) => setAllocTargets(targets)}
        />
      )}

      {/* Holdings table */}
      <div style={{ order: wOrder("assets"), display: wVisible("assets") ? undefined : "none" }} className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl overflow-hidden">
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
                {colVisible("type") && <th className="text-center px-3 py-3 font-normal">{t("dash.col_type")}</th>}
                {colVisible("price") && <SortableTH label={t("common.price")} k="price_usd" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} testId="sort-price" className="text-right px-4 py-3"/>}
                {colVisible("qty") && <SortableTH label={t("common.quantity")} k="quantity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} testId="sort-qty" className="text-right px-4 py-3"/>}
                {colVisible("value") && <SortableTH label={t("common.value")} k="value_usd" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} testId="sort-value" className="text-right px-4 py-3"/>}
                {colVisible("avg_cost") && <SortableTH label={t("common.avg_cost")} k="avg_cost_usd" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} testId="sort-avg" className="text-right px-4 py-3"/>}
                {colVisible("pnl") && <SortableTH label="P&L" k="pnl_usd" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} testId="sort-pnl" className="text-right px-4 py-3"/>}
                {colVisible("alloc") && <SortableTH label={t("common.allocation")} k="allocation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} testId="sort-alloc" className="text-right px-4 py-3"/>}
                {colVisible("change") && <SortableTH label={t("common.change_24h")} k="change_24h" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} testId="sort-24h" className="text-right px-4 py-3"/>}
                {colVisible("spark") && <th className="text-right px-3 py-3 font-normal">{t("common.chart_24h")}</th>}
                {colVisible("wallet") && <th className="text-left px-4 py-3 font-normal">{t("common.wallet")}</th>}
                <th className="text-right px-4 py-3 font-normal">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={visibleCols.length + 2} className="text-center text-zinc-600 py-12 text-sm font-mono" data-testid="no-assets">
                  {t("dash.no_assets")}
                </td></tr>
              )}
              {sorted.map((a) => {
                const walletName = wallets.find((w) => w.id === a.wallet_id)?.name || "--";
                const pos = a.pnl_usd >= 0;
                const pos24 = (a.change_24h || 0) >= 0;
                const sym = curSymbol(currency);
                const formatPrice = (n) => `${sym}${convert(n, currency, fxRates).toLocaleString("en-US",{minimumFractionDigits:2, maximumFractionDigits:2})}`;
                const rowKey = `${a.symbol}-${a.wallet_id}-${a.asset_type}`;
                // "UPGRADE v1.0" (task #77) — manual reclassification is
                // keyed by SYMBOL alone (applies globally across every
                // wallet), never by this specific row/holding.
                const overrideCls = allocOverrides[(a.symbol || "").toUpperCase()];
                return (
                  <tr key={rowKey} className="border-b border-zinc-800/30 hover:bg-zinc-900/40 transition-colors" data-testid={`asset-row-${a.symbol}-${a.wallet_id}`}>
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => nav(`/asset/${a.symbol}`)}
                        className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
                        data-testid={`asset-link-${a.symbol}`}
                      >
                        <AssetIcon asset={a}/>
                        <div>
                          <div className="font-mono font-medium text-zinc-100">{a.symbol}</div>
                          <div className="text-xs text-zinc-500">
                            {a.name}
                          </div>
                        </div>
                      </button>
                    </td>
                    {colVisible("type") && (
                      <td className="px-3 py-4 text-center">
                        <div className="inline-flex items-center gap-1">
                          <span className={`text-[10px] font-mono font-semibold tracking-wide px-2 py-0.5 rounded border ${
                            a.asset_type === "crypto"  ? "border-amber-500/40 text-amber-400 bg-amber-500/10" :
                            a.asset_type === "etf"     ? "border-blue-500/40 text-blue-400 bg-blue-500/10" :
                            a.asset_type === "fund"    ? "border-purple-500/40 text-purple-400 bg-purple-500/10" :
                            a.asset_type === "bond"    ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" :
                            a.asset_type === "cash"    ? "border-zinc-500/40 text-zinc-300 bg-zinc-500/10" :
                            a.asset_type === "reit"    ? "border-orange-500/40 text-orange-400 bg-orange-500/10" :
                                                         "border-zinc-700/40 text-zinc-400 bg-zinc-800/30"
                          }`}>
                            {TYPE_LABELS[a.asset_type] || a.asset_type}
                          </span>

                          {/* "UPGRADE v1.0" (task #77) — manual per-symbol
                              allocation-class override, independent of the
                              badge above (which always shows the asset's
                              real instrument type). */}
                          <div className="relative inline-block">
                            <button
                              type="button"
                              onClick={() => setReclassifyOpenKey(reclassifyOpenKey === rowKey ? null : rowKey)}
                              className={`p-1 rounded transition-colors ${overrideCls ? "text-amber-400 hover:text-amber-300" : "text-zinc-600 hover:text-zinc-300"}`}
                              title={overrideCls ? t("alloc.reclassified_badge_tooltip") : t("alloc.reclassify_tooltip")}
                              data-testid={`reclassify-btn-${a.symbol}-${a.wallet_id}`}
                            >
                              <Tag className="w-3 h-3" />
                            </button>
                            {reclassifyOpenKey === rowKey && (
                              <>
                                <div className="fixed inset-0 z-30" onClick={() => setReclassifyOpenKey(null)} />
                                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-40 w-36 bg-zinc-950 border border-zinc-800 rounded-md shadow-2xl p-1" data-testid={`reclassify-menu-${a.symbol}`}>
                                  <button
                                    type="button"
                                    onClick={() => saveOverride(a.symbol, null)}
                                    className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-zinc-900 transition-colors ${!overrideCls ? "text-zinc-100" : "text-zinc-400"}`}
                                    data-testid={`reclassify-option-auto-${a.symbol}`}
                                  >
                                    {t("alloc.reclassify_auto")}
                                  </button>
                                  <div className="my-1 border-t border-zinc-800" />
                                  {ALLOCATION_CLASSES.map((cls) => (
                                    <button
                                      key={cls}
                                      type="button"
                                      onClick={() => saveOverride(a.symbol, cls)}
                                      className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-zinc-900 transition-colors ${overrideCls === cls ? "text-emerald-400" : "text-zinc-300"}`}
                                      data-testid={`reclassify-option-${cls}-${a.symbol}`}
                                    >
                                      {t(ALLOCATION_CLASS_LABEL_KEY[cls])}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    )}
                    {colVisible("price") && (
                      <td className="px-4 py-4 text-right">
                        <FlashingPrice
                          value={a.live_price_usd}
                          formatted={formatPrice(a.live_price_usd)}
                          live={a.live}
                          marketOpen={a.asset_type === "crypto" ? true : isNYSEOpen()}
                          testId={`price-${a.symbol}`}
                        />
                        {a.delayed && (
                          <div className="text-[10px] text-zinc-600 mt-0.5 font-mono" title={t("dash.price_delayed_tooltip")}>
                            {t("dash.price_delayed")}
                          </div>
                        )}
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

// Module-level (stable identity across renders) so React updates it in
// place instead of unmounting/remounting the whole row on every parent
// re-render (e.g. live-price polling). It used to be defined INSIDE the
// Dashboard render body, which gave React a brand-new component "type"
// every single render — forcing a full unmount+remount of every row,
// including AssetIcon's <img>, which read as a flicker/"refresh" effect,
// most noticeable while the mouse sat still over a row.
function TopMoverRow({ a, positive, wallets, nav, currency, fxRates, mask }) {
  const walletName = wallets.find((w) => w.id === a.wallet_id)?.name;
  const walletDot = WALLET_DOT_CLASS[walletColorKey(wallets, a.wallet_id)];
  return (
    <Link
      to={`/asset/${a.asset_type}/${a.symbol}`}
      className="flex items-center gap-3 px-3 py-2 rounded-md bg-zinc-900/60 border border-zinc-800/60 hover:border-zinc-700 transition-colors"
      data-testid={`top-mover-${positive ? "up" : "down"}-${a.symbol}`}
    >
      <AssetIcon asset={a} size={24}/>
      <div className="min-w-0 shrink-0">
        <div className="font-mono text-zinc-100 text-sm leading-none whitespace-nowrap">{a.symbol}</div>
        <div className="text-[10px] font-mono text-zinc-500 leading-none mt-1 whitespace-nowrap">{mask(fmtCurrency(convert(a.value_usd, currency, fxRates), currency))}</div>
      </div>
      {/* Wallet badge — centered in the space between the asset info and the
          % change, instead of being crammed right next to the percentage. */}
      <div className="flex-1 flex justify-center min-w-0">
        {walletName && (
          // button (not Link) + stopPropagation: nesting a Link inside
          // the row's own Link would be invalid HTML and would just
          // trigger the outer navigation anyway.
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); nav(`/dashboard?wallet=${a.wallet_id}`); }}
            className="max-w-full truncate text-[10px] font-mono px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400 bg-zinc-800/60 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
            data-testid={`top-mover-wallet-${a.symbol}`}
          >
            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${walletDot}`} />
            {walletName}
          </button>
        )}
      </div>
      <div className={`font-mono text-sm shrink-0 ${positive ? "text-emerald-400" : "text-rose-400"}`}>
        {positive ? <ArrowUpRight className="inline w-3 h-3"/> : <ArrowDownRight className="inline w-3 h-3"/>}
        {fmtPct(a.change_24h || 0)}
      </div>
    </Link>
  );
}

// "UPGRADE v1.0" — target-allocation configuration dialog. One draggable
// slider per known class (stock/crypto/etf/fund/cash) instead of a plain
// number input — mirrors the look of the pie legend's horizontal bars
// underneath the widget's own chart, so the same "bar = percentage"
// language is used in both places. Each row also shows the class's current
// actual % next to the target % being edited, and a running total that
// must land on 100% (±0.5 tolerance, mirrors the backend's own check in
// routes/allocation.py) before Save is enabled.
function AllocationTargetDialog({ open, onOpenChange, initialTargets, holdings, overrides, onSaved }) {
  const { t } = useI18n();
  const [values, setValues] = useState(() => {
    const init = {};
    ALLOCATION_CLASSES.forEach((cls) => {
      init[cls] = initialTargets?.[cls] != null ? Number(initialTargets[cls]) : 0;
    });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const hasExistingTarget = Object.keys(initialTargets || {}).length > 0;

  // Current live allocation per class, shown next to the target slider so
  // the user can see where they stand while dragging towards the target.
  const actualPctByClass = useMemo(() => {
    const totals = aggregateByClass(holdings || [], overrides || {});
    const totalValue = Object.values(totals).reduce((s, v) => s + v, 0);
    const pct = {};
    ALLOCATION_CLASSES.forEach((cls) => {
      pct[cls] = totalValue > 0 ? ((totals[cls] || 0) / totalValue) * 100 : 0;
    });
    return pct;
  }, [holdings, overrides]);

  const total = ALLOCATION_CLASSES.reduce((s, cls) => s + (Number(values[cls]) || 0), 0);
  const sumOk = Math.abs(total - 100) <= 0.5;

  const setClassValue = (cls, raw) => {
    const n = Math.max(0, Math.min(100, Number(raw) || 0));
    setValues((v) => ({ ...v, [cls]: n }));
  };

  const save = async () => {
    if (!sumOk) {
      toast.error(t("alloc.toast_target_sum_error"));
      return;
    }
    const targets = {};
    ALLOCATION_CLASSES.forEach((cls) => { targets[cls] = Number(values[cls]) || 0; });
    setSaving(true);
    try {
      await api.put("/allocation/target", { targets });
      toast.success(t("alloc.toast_target_saved"));
      onSaved?.(targets);
      onOpenChange(false);
    } catch (e) {
      toast.error(formatApiErrorDetail(e?.response?.data?.detail) || t("alloc.toast_target_failed"));
    } finally {
      setSaving(false);
    }
  };

  // Clears the target back to "not configured" — the widget then falls
  // back to its original (no-target) look. The backend accepts an empty
  // targets object as an explicit "disable", skipping the sum-must-be-100
  // validation for that one case (see routes/allocation.py).
  const disable = async () => {
    setSaving(true);
    try {
      await api.put("/allocation/target", { targets: {} });
      toast.success(t("alloc.toast_target_disabled"));
      onSaved?.({});
      onOpenChange(false);
    } catch (e) {
      toast.error(formatApiErrorDetail(e?.response?.data?.detail) || t("alloc.toast_target_failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-sm">
        {/* Slider thumb is deliberately taller than the track (protrudes
            above/below it) so it reads as a draggable handle rather than
            just decoration on the bar — the fill color comes from
            ALLOCATION_CLASS_COLOR per row via an inline gradient. */}
        <style>{`
          .alloc-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; border-radius: 9999px; outline: none; cursor: pointer; }
          .alloc-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 6px; height: 18px; border-radius: 3px; background: #fafafa; border: 1px solid #09090b; cursor: grab; box-shadow: 0 0 0 1px rgba(0,0,0,0.5); }
          .alloc-slider::-webkit-slider-thumb:active { cursor: grabbing; }
          .alloc-slider::-moz-range-thumb { width: 6px; height: 18px; border-radius: 3px; background: #fafafa; border: 1px solid #09090b; cursor: grab; }
          .alloc-slider::-moz-range-track { height: 6px; border-radius: 9999px; background: transparent; }
        `}</style>

        <DialogHeader>
          <DialogTitle className="font-display font-light text-2xl">{t("alloc.dialog_title")}</DialogTitle>
          <DialogDescription className="text-zinc-500 text-sm">{t("alloc.dialog_desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {ALLOCATION_CLASSES.map((cls) => {
            const val = values[cls] ?? 0;
            const color = ALLOCATION_CLASS_COLOR[cls];
            const actual = actualPctByClass[cls] || 0;
            return (
              <div key={cls} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-400">
                    {t(ALLOCATION_CLASS_LABEL_KEY[cls])}
                  </Label>
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-zinc-500" title={t("alloc.actual_pct")}>{actual.toFixed(1)}%</span>
                    <span className="text-zinc-100 font-semibold w-11 text-right" data-testid={`alloc-target-value-${cls}`}>
                      {val.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={val}
                  onChange={(e) => setClassValue(cls, e.target.value)}
                  className="alloc-slider"
                  style={{ background: `linear-gradient(to right, ${color} 0%, ${color} ${val}%, #27272a ${val}%, #27272a 100%)` }}
                  data-testid={`alloc-target-slider-${cls}`}
                />
              </div>
            );
          })}

          <div className={`flex items-center justify-between pt-2 border-t border-zinc-800 font-mono text-sm ${sumOk ? "text-emerald-400" : "text-rose-400"}`}>
            <span className="text-zinc-400 text-xs font-mono uppercase tracking-[0.15em]">{t("alloc.sum_label")}</span>
            <span>{total.toFixed(1)}%</span>
          </div>
          {!sumOk && (
            <div className="text-[11px] font-mono text-rose-400">{t("alloc.sum_must_100")}</div>
          )}
        </div>

        <div className={`flex items-center gap-2 pt-2 ${hasExistingTarget ? "justify-between" : "justify-end"}`}>
          {hasExistingTarget && (
            <Button
              variant="outline"
              onClick={disable}
              disabled={saving}
              className="bg-transparent border-rose-500/30 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-50"
              data-testid="alloc-target-disable-btn"
            >
              {t("alloc.disable_target")}
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="bg-zinc-900/50 border-zinc-800 text-zinc-300"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={save}
              disabled={!sumOk || saving}
              className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 disabled:opacity-50"
              data-testid="alloc-target-save-btn"
            >
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SortableTH({ label, k, sortKey, sortDir, onSort, testId, className = "text-right px-4 py-3" }) {
  const active = sortKey === k;
  return (
    <th
      className={`font-normal cursor-pointer select-none text-xs font-mono uppercase tracking-[0.15em] ${active ? "text-zinc-200" : "text-zinc-400"} ${className}`}
      onClick={() => onSort(k)}
      data-testid={testId}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </span>
    </th>
  );
}

function FilterPill({ active, onClick, children, testId, color = "zinc", coloredBorder = false, inactiveColor }) {
  const colors = {
    zinc:    active ? "bg-zinc-100 text-zinc-950 border-zinc-100"    : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-zinc-200",
    amber:   active ? "bg-amber-400/20 text-amber-300 border-amber-400/60"   : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-amber-500/40 hover:text-amber-300",
    blue:    active ? "bg-blue-500/20 text-blue-300 border-blue-500/60"     : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-blue-500/40 hover:text-blue-300",
    purple:  active ? "bg-purple-500/20 text-purple-300 border-purple-500/60"   : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-purple-500/40 hover:text-purple-300",
    emerald: active ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/60" : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-emerald-500/40 hover:text-emerald-300",
    rose:    active ? "bg-rose-500/20 text-rose-300 border-rose-500/60"     : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-rose-500/40 hover:text-rose-300",
    cyan:    active ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/60"     : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-cyan-500/40 hover:text-cyan-300",
  };
  // Inactive-but-colored variant: same border/text tint as the active state
  // (just dimmer), instead of the generic zinc border that only picks up
  // color on hover. Used by the wallet pills and their inline type pills,
  // so a wallet's color is visible at a glance even when it isn't selected.
  const coloredInactive = {
    zinc:    "bg-zinc-900/60 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-200",
    amber:   "bg-zinc-900/60 text-amber-300 border-amber-500 hover:border-amber-400 hover:text-amber-200",
    blue:    "bg-zinc-900/60 text-blue-300 border-blue-500 hover:border-blue-400 hover:text-blue-200",
    purple:  "bg-zinc-900/60 text-purple-300 border-purple-500 hover:border-purple-400 hover:text-purple-200",
    emerald: "bg-zinc-900/60 text-emerald-300 border-emerald-500 hover:border-emerald-400 hover:text-emerald-200",
    rose:    "bg-zinc-900/60 text-rose-300 border-rose-500 hover:border-rose-400 hover:text-rose-200",
    cyan:    "bg-zinc-900/60 text-cyan-300 border-cyan-500 hover:border-cyan-400 hover:text-cyan-200",
  };
  const className = active
    ? colors[color] || colors.zinc
    : coloredBorder
      ? coloredInactive[inactiveColor || color] || coloredInactive.zinc
      : colors[color] || colors.zinc;
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-mono transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

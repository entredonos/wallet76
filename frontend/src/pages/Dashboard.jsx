import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { bucketOHLC, bucketClassClose, getDayBoundaries, getWeekendBands } from "../lib/chartGaps";
import { CHART_RANGE_BUCKET_MS, CHART_RANGES_DAY_MARKERS, CHART_RANGES_WEEKEND_SHADING, N_BARS } from "../constants/chartRanges";
import {
  ArrowUpRight, Receipt, Bell,
  DollarSign, BarChart3, Activity, TrendingDown, Eye, EyeOff,
  Share2, LayoutDashboard, Gauge,
} from "lucide-react";
import DashboardWidgetDrawer from "../components/DashboardWidgetDrawer";
import DashboardSkeleton from "../components/DashboardSkeleton";
import OnboardingFlow from "../components/OnboardingFlow";
import Sparkline from "../components/Sparkline";
import SummaryCard from "../components/dashboard/SummaryCard";
import LightEvolutionCard from "../components/dashboard/LightEvolutionCard";
import LightBalanceCard from "../components/dashboard/LightBalanceCard";
import SharePanel from "../components/dashboard/SharePanel";
import FilterPillsRow from "../components/dashboard/FilterPillsRow";
import TopMoversWidget from "../components/dashboard/TopMoversWidget";
import EvolutionChart from "../components/dashboard/EvolutionChart";
import AllocationWidget from "../components/dashboard/AllocationWidget";
import AllocationTargetDialog from "../components/dashboard/AllocationTargetDialog";
import AssetsTable from "../components/dashboard/AssetsTable";
import MonthlyReturnsPreview from "../components/dashboard/MonthlyReturnsPreview";
import LiquidityCard from "../components/dashboard/LiquidityCard";
import {
  SORT_OPTIONS, DEFAULT_VISIBLE_COLS, WIDGET_DEFS, DEFAULT_WIDGETS,
} from "../constants/dashboardConstants";
import { useBinanceStream } from "../hooks/useBinanceStream";
import { fmtCurrency, fmtPct, fmtCompact, convert } from "../lib/format";
import { useI18n } from "../context/I18nContext";
import { usePrivacy } from "../context/PrivacyContext";
import { usePlan } from "../hooks/usePlan";
import { ALLOCATION_CLASSES, ALLOCATION_CLASS_LABEL_KEY, effectiveClass, aggregateByClass } from "../lib/allocation";

// Dashboard.jsx used to be a single ~2325-line file mixing all of its own
// state/data-fetching with a lot of presentational JSX (share panel, filter
// pills, top movers, evolution chart, allocation widget, assets table).
// It's now split: this file stays the container — owns every piece of
// state, every effect/fetch, and every derived useMemo — while the
// presentation-heavy sections live under components/dashboard/ and receive
// their data + handlers as props. Kept as a container-only split (rather
// than lifting state too) specifically so behavior can't regress: every
// computation below is unchanged from before the split, only where its
// JSX renders moved.

// Small "number over label" stat used in the title row subtitle (assets /
// wallets / last-updated) — see comment above its usage for why this
// replaced a single run-on translated sentence.
function StatChip({ value, label }) {
  return (
    <div className="flex flex-col items-start leading-tight">
      <span className="text-sm font-mono text-zinc-300">{value}</span>
      <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-zinc-400">{label}</span>
    </div>
  );
}

export default function Dashboard({ currency }) {
  const { t } = useI18n();
  const { hidden: hideValues, toggle: togglePrivacy } = usePrivacy();
  const { isPro } = usePlan();
  const mask = (formatted) => (hideValues ? "•••••" : formatted);
  // Light/advanced dashboard view — "light" shows only the summary cards
  // (fast first paint, friendlier on mobile); "advanced" is the full
  // dashboard exactly as it always was (filter pills, top movers, evolution
  // chart, allocation, holdings table). Always starts on "light" on every
  // fresh entry into the app — intentionally NOT persisted across sessions
  // (unlike the other dashboard prefs below): toggling to "advanced" only
  // holds for the current visit, so leaving and coming back always lands
  // back on the fast/simple view instead of remembering the last mode.
  // Purely a rendering toggle — doesn't change what load() fetches, so it
  // never touches the history/snapshot logic (REGRA #2).
  const [dashMode, setDashMode] = useState("light");
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
  // Per-wallet 24h sparkline (LightBalanceCard's "As tuas carteiras" rows —
  // same /wallets/sparklines endpoint the sidebar in Layout.jsx already
  // uses; fetched here too since Dashboard doesn't share state with Layout.
  const [walletSparks, setWalletSparks] = useState({});
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

    // The 3 requests below are independent (different data, different
    // error handling) so they run concurrently instead of one after another
    // — sequential awaits meant total wait time was the SUM of all three
    // round-trips (portfolio + history + sparklines), routinely 2-3s, even
    // though none of them depend on each other's result. Running them in
    // parallel cuts that to roughly the slowest single call. Portfolio is
    // still "the critical one": its own promise clears the skeleton
    // (setLoading(false)) the moment IT resolves, without waiting for
    // history/sparklines — those stay decorative/progressive via their own
    // chartLoading/sparklines state, same as before.
    const portfolioPromise = (async () => {
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
      } finally {
        setLoading(false);
      }
    })();

    // History can fail silently — it only affects the chart. Request-id
    // guard: only apply this response if no newer /history fetch has
    // started in the meantime (see historyReqIdRef declaration above).
    const myReqId = ++historyReqIdRef.current;
    const historyPromise = (async () => {
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
    })();

    const sparklinesPromise = (async () => {
      try {
        const sp = await api.get("/sparklines");
        const spData = sp.data || {};
        setSparklines(spData);
        // Only cache if we actually got data — empty response should be retried
        if (Object.keys(spData).length > 0) {
          writeCache("sparklines", spData);
        }
      } catch (e) {
        // Log sparkline errors to browser console to help debug
        console.warn("[sparklines] fetch failed:", e?.message || e);
      }
    })();

    // Optional, best-effort — same as sparklinesPromise above, not part of
    // the settled-before-clearing-loading trio (portfolio is the only one
    // that gates the skeleton).
    api.get("/wallets/sparklines").then((r) => setWalletSparks(r.data || {})).catch(() => {});

    await Promise.allSettled([portfolioPromise, historyPromise, sparklinesPromise]);
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
    } catch { toast.error(t("dash.share_failed")); }
    finally { setShareLoading(false); }
  };

  const revokeShare = async () => {
    setShareLoading(true);
    try {
      await api.delete("/share");
      setShareData(null);
    } catch { toast.error(t("dash.revoke_failed")); }
    finally { setShareLoading(false); }
  };

  const toggleShareHideValues = async () => {
    if (!shareData) return;
    const next = !shareData.hide_values;
    try {
      await api.patch("/share/settings", { hide_values: next });
      setShareData((d) => ({ ...d, hide_values: next }));
    } catch { toast.error(t("dash.update_setting_failed")); }
  };

  const copyShareLink = () => {
    const url = `${window.location.origin}/p/${shareData.slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => { loadShareStatus(); }, []);

  // Light view's 5-day evolution card — a dedicated fetch, decoupled from
  // the advanced chart's `range` state (which could be on any timeframe,
  // e.g. "1h"). "4h" hits the same intraday reconstruction path the
  // advanced chart's own "4h" button uses (_build_retro_history_intraday,
  // REGRA #2) — not touching that logic, just consuming it the same way.
  // Only fetched while dashMode === "light", so advanced mode never pays
  // for it.
  const LIGHT_BARS = 30; // 5 days x 6 four-hour candles/day
  const [lightHistory, setLightHistory] = useState([]);
  const [lightHistoryLoading, setLightHistoryLoading] = useState(true);
  useEffect(() => {
    if (dashMode !== "light") return;
    let cancelled = false;
    setLightHistoryLoading(true);
    api.get(`/history?range=4h${filterWallet !== "all" ? `&wallet_id=${filterWallet}` : ""}${filterType !== "all" ? `&asset_type=${filterType}` : ""}`)
      .then((r) => { if (!cancelled) setLightHistory(r.data || []); })
      .catch(() => { if (!cancelled) setLightHistory([]); })
      .finally(() => { if (!cancelled) setLightHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [dashMode, filterWallet, filterType]);

  // Same bucketing pipeline the advanced chart uses (bucketOHLC), just
  // sliced to the last 30 four-hour candles (5 days) instead of N_BARS=70.
  const lightCandles = useMemo(() => {
    const raw = (lightHistory || [])
      .map((s) => ({ ts: s.ts || s.date, value: Number(s.total_usd || 0) }))
      .filter((p) => Number(p.value) > 0);
    const bucketed = bucketOHLC(raw, "ts", "value", CHART_RANGE_BUCKET_MS["4h"]);
    return bucketed.slice(-LIGHT_BARS);
  }, [lightHistory]);

  // Chart points (just t/close — no need for the full OHLC shape since this
  // is a simple area, not candles). % change is currency-independent (a
  // ratio), so both stay in raw USD — no need to convert() just for this.
  const lightChartPoints = useMemo(
    () => lightCandles.map((c) => ({ t: c.t, v: c.c })),
    [lightCandles]
  );

  const lightChangePct = useMemo(() => {
    if (lightCandles.length < 2) return null;
    const first = lightCandles[0].c;
    const last = lightCandles[lightCandles.length - 1].c;
    return first > 0 ? ((last - first) / first) * 100 : null;
  }, [lightCandles]);

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

  // Per-wallet breakdown for the light-mode "As tuas carteiras" list
  // (LightBalanceCard). Built from allHoldings (unfiltered by wallet, live
  // priced) grouped by wallet_id — same approach as the sidebar in
  // Layout.jsx, just computed locally instead of a second /portfolio fetch.
  // portfolio.wallets itself has no value/pnl, only the raw wallet docs.
  const walletBreakdown = useMemo(() => {
    const stats = {};
    allHoldings.forEach((a) => {
      const id = a.wallet_id;
      if (!id) return;
      if (!stats[id]) stats[id] = { value: 0, cost: 0 };
      stats[id].value += Number(a.value_usd || 0);
      stats[id].cost += Number(a.cost_usd || 0);
    });
    return wallets
      .map((w) => {
        const st = stats[w.id] || { value: 0, cost: 0 };
        const pnlPct = st.cost > 0 ? ((st.value - st.cost) / st.cost) * 100 : 0;
        return { id: w.id, name: w.name, value: st.value, pnlPct };
      })
      .sort((a, b) => b.value - a.value);
  }, [allHoldings, wallets]);

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
            reit: t("common.reit"),
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
      top.push({ name: t("common.other"), value: othersValue, pct: (othersValue / total) * 100 });
    }
    return top;
  }

  return sorted;
}, [filtered, allocationMode, allocOverrides, t]);

  const hasAllocationTarget = Object.keys(allocTargets).length > 0;

  // Os sliders inline de arrastar (handleClassSliderDrag /
  // commitClassSliderDrag + o estado de drag draftAllocTargets) foram
  // removidos — o widget "Distribuição da Carteira" passou a mostrar o
  // alvo como uma barra estática (marca branca), só editável pelo
  // AllocationTargetDialog (botão de definições), para evitar alterar o
  // alvo com um toque acidental no telemóvel.
  const effectiveAllocTargets = allocTargets;

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
        // Linha por categoria na Evolução (7 jul 2026) — repassa o
        // "by_class" já calculado no backend (ver REGRA #2 no CLAUDE.md:
        // soma aditiva ao lado do total, não existe em pontos vindos da
        // rede de segurança). Convertido para a moeda ativa aqui, junto do
        // valor total, para não ter de re-percorrer `history` outra vez.
        byClass: s.by_class
          ? Object.fromEntries(Object.entries(s.by_class).map(([cls, v]) => [cls, convert(v, currency, fxRates)]))
          : null,
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
    const withPrevC = sliced.map((d, i) => (i > 0 ? { ...d, prevC: sliced[i - 1].c } : d));

    // Linha por categoria (7 jul 2026) — mesma bucketização (mesmas chaves
    // de tempo que bucketOHLC), fundida no MESMO array por "t" para o
    // Recharts conseguir ler tudo de uma vez (candle total + uma linha por
    // classe). Pontos da rede de segurança não têm by_class (ver REGRA #2)
    // — nesse bucket a linha de categoria simplesmente não tem valor nesse
    // ponto (Recharts salta o gap), a linha do total continua normal.
    const classBucketed = bucketClassClose(strippedLineData, "ts", "byClass", CHART_RANGE_BUCKET_MS[range]);
    const classByT = new Map(classBucketed.map((c) => [c.t, c]));
    return withPrevC.map((d) => {
      const cls = classByT.get(d.t);
      return cls ? { ...d, ...cls } : d;
    });
  }, [strippedLineData, range]);

  // Classes realmente presentes nos dados do gráfico atual (une todos os
  // pontos porque uma classe pode só ter sido comprada a meio do período) —
  // usado para desenhar só as linhas/legenda relevantes, não as 6 sempre.
  const chartClasses = useMemo(() => {
    const set = new Set();
    for (const d of candleData) {
      for (const c of ALLOCATION_CLASSES) {
        if (d[c] != null) set.add(c);
      }
    }
    return ALLOCATION_CLASSES.filter((c) => set.has(c));
  }, [candleData]);

  // Legenda com toggle (7 jul 2026) — classes escondidas por clique na
  // legenda por baixo do gráfico de Evolução. Persistido por navegador
  // (não por conta), reposto se a classe deixar de existir na carteira.
  const [hiddenClasses, setHiddenClasses] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("w76-evo-hidden-classes") || "[]")); }
    catch { return new Set(); }
  });
  const toggleClassLine = (cls) => {
    setHiddenClasses((prev) => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls); else next.add(cls);
      try { localStorage.setItem("w76-evo-hidden-classes", JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  // True when any point in the raw /history response came from the backend's
  // "rede de segurança" — the intraday reconstruction (15m/30m/1h/4h) falling
  // back to real recorded snapshots because CoinGecko/Yahoo were temporarily
  // too sparse to reconstruct from (see _build_retro_history_intraday in
  // backend/routes/portfolio.py). Surfaced as a small badge so the user
  // knows a stretch of the chart may be less precise than usual, instead of
  // silently showing it as if it were a normal live reconstruction.
  const usedSafetyNet = useMemo(
    () => (history || []).some((p) => p.source === "safety_net"),
    [history]
  );

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

  // Light card's title mirrors what the main page title already does with
  // `selectedWallet`: name a specific wallet when one's selected, otherwise
  // it's the combined view across every wallet — "Portfolio", not "Wallet".
  const evolutionTitle = selectedWallet ? t("dash.evolution") : t("dash.evolution_portfolio");

  // "Atualizado há Xmin" — computed at render time (same as before), now
  // shown inline in the subtitle instead of as a stray caption under the
  // refresh button.
  const lastSyncMinutesLabel = lastSync && !refreshing
    ? (() => { const m = Math.round((Date.now() - lastSync.getTime()) / 60000); return m < 1 ? "< 1" : m; })()
    : null;

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
        dashMode={dashMode}
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
      {/* Title row — Widgets/Esconder/Partilhar ficam SEMPRE na mesma linha
          do título, nowrap, encostados à direita, em qualquer modo (6 jul
          2026: dentro de uma carteira, com o "+Adicionar" também na
          mesma linha, a fila toda ia para a linha de baixo e o
          "+Adicionar" ficava deslocado/estranho no telemóvel). Se faltar
          espaço é o título que trunca, nunca os 3 ícones. Os botões só do
          modo "advanced" (dash-mode-toggle/Alertas/+Adicionar) saíram
          para a sua própria linha por baixo, livre para quebrar — assim
          o "+Adicionar" tem sempre a linha só para si (e para os outros
          2), sem competir por espaço com os 3 ícones. */}
      <div className="flex items-center justify-between gap-3 flex-nowrap">
        <div className="min-w-0">
          <h1 className="font-display text-3xl sm:text-4xl font-light tracking-tight text-zinc-50 truncate">
            {selectedWallet ? selectedWallet.name : t("dash.title")}
          </h1>
            {/* Era uma única frase traduzida ("{count} ativos • {wallets}
                carteiras • Atualizado Xmin") — em ecrãs estreitos isso
                quebrava para 2 linhas, feio (5 jul 2026). Substituído por
                "chips" pequenos com o número por cima do rótulo (letras
                menores, sem quebra de linha). */}
            <div className="flex items-center gap-4 mt-1.5" data-testid="dashboard-subtitle">
              {selectedWallet ? (
                <StatChip value={filtered.length} label={t("dash.assets_label")} />
              ) : (
                <>
                  <StatChip value={totalCount} label={t("dash.assets_label")} />
                  <StatChip value={walletCount} label={t("dash.wallets_label")} />
                </>
              )}
              {lastSyncMinutesLabel !== null && (
                <StatChip value={`${lastSyncMinutesLabel}min`} label={t("common.updated")} />
              )}
            </div>
          </div>
        <div className="flex items-center gap-2 shrink-0 flex-nowrap">
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
            title={hideValues ? t("dash.show_values") : t("dash.hide_values_tooltip")}
          >
            {hideValues ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
          </button>
          <button
            onClick={() => setSharePanel((v) => !v)}
            className={`p-2 border rounded-md transition-colors ${sharePanel ? "border-blue-500/40 text-blue-300 bg-blue-500/10" : "border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"}`}
            title={t("dash.share_portfolio_tooltip")}
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Segunda linha — só modo "advanced": dash-mode-toggle, Alertas e
          "+Adicionar". Isolados dos 3 ícones acima, esta linha já não os
          arrasta consigo — mas os 3 botões, com texto completo, ainda não
          cabiam sempre numa só linha no telemóvel (6 jul 2026: "ficou
          resumo/alertas e na linha em baixo adicionar... tens de por os 3
          na mesma linha"). Agora nowrap forçado + o rótulo de texto
          escondido abaixo de sm (só ícone + title/tooltip nesse breakpoint),
          igual ao tratamento já usado nos 3 ícones acima — cabem sempre
          numa linha só, com o texto completo a voltar a partir de sm. */}
      {dashMode === "advanced" && (
        <div className="flex flex-nowrap items-center justify-end gap-2 -mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDashMode((m) => (m === "light" ? "advanced" : "light"))}
            className="bg-zinc-900/50 border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200 px-2.5 sm:px-3"
            title={dashMode === "light" ? t("dash.view_advanced") : t("dash.view_summary")}
            data-testid="dash-mode-toggle"
          >
            <Gauge className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">{dashMode === "light" ? t("dash.view_advanced") : t("dash.view_summary")}</span>
          </Button>
          <Link to="/alerts">
            <Button variant="outline" size="sm" className="bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 px-2.5 sm:px-3" title={t("common.alerts")} data-testid="alerts-btn">
              <Bell className="w-4 h-4 sm:mr-2"/> <span className="hidden sm:inline">{t("common.alerts")}</span>
            </Button>
          </Link>
          <Link to="/transactions">
            <Button size="sm" className="bg-blue-500 hover:bg-blue-400 text-zinc-950 font-medium px-2.5 sm:px-3" title={t("common.add")} data-testid="goto-tx-btn">
              <Receipt className="w-4 h-4 sm:mr-2"/> <span className="hidden sm:inline">+ {t("common.add")}</span>
            </Button>
          </Link>
        </div>
      )}

      {/* Share panel */}
      {sharePanel && (
        <SharePanel
          shareData={shareData}
          shareLoading={shareLoading}
          copied={copied}
          onClose={() => setSharePanel(false)}
          onGenerate={generateShare}
          onRevoke={revokeShare}
          onToggleHideValues={toggleShareHideValues}
          onCopy={copyShareLink}
        />
      )}

      {/* Summary cards — "advanced" only. "light" mode shows LightBalanceCard
          instead (single consolidated Saldo Total + wallets list, below),
          per the approved mockup (memory/mobile_app_proposal.md) — these 4
          separate stacked cards were the "layout antigo" difference from
          it (5 jul 2026). */}
      {dashMode === "advanced" && (
      <div style={{ order: wOrder("summary"), display: wVisible("summary") ? undefined : "none" }}
           // 2 por linha já a partir do mobile (não só a partir de sm) —
           // 1 por linha ocupava demasiado espaço vertical no telemóvel
           // (5 jul 2026, "temos que por 2 por linha").
           className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
      )}

      {/* Light view: LightBalanceCard (Saldo Total + carteiras) above a
          static 7-day evolution card (badge + day-axis only, no range
          picker, no candles/weekend bands/safety-net badge — those stay
          exclusive to the full EvolutionChart in "advanced"). Everything
          else (pills, movers, allocation, table) only renders in
          "advanced". */}
      {dashMode === "light" && (
        // Explicit order — this div is a direct child of the outer
        // "flex flex-col" dashboard container, same as the summary cards
        // grid above it. Without an explicit order here, it defaults to 0
        // (browser default), which is LESS than the summary grid's own
        // order (wOrder("summary"), 20 by default) — so this card was
        // rendering ABOVE the balance cards instead of below them (caught
        // 5 jul 2026 from a live screenshot: "Evolução do Portfólio" was
        // the very first thing on the page, saldo cards below it).
        <div className="flex flex-col gap-6" style={{ order: wOrder("summary") + 1 }}>
          {/* wVisible/wOrder wiring added 5 jul 2026: these two used to
              render unconditionally in light mode regardless of what the
              widget drawer said, so toggling "Saldo"/"Evolução" off there
              had zero effect here — a real gap, not just cosmetic (user
              flagged it: "editor de widgets... tens que ver se esta
              atualizado aqui"). DashboardWidgetDrawer also now hides the
              other 4 widgets (top_movers/performers/allocation/assets) and
              the filter-pills section while in light mode, since none of
              them render here — showing their toggles would just be
              clutter with no effect. */}
          {wVisible("summary") && (
            <div style={{ order: wOrder("summary") }}>
              <LightBalanceCard
                totalLabel={mask(fmtCompact(convert(summary.total, currency, fxRates), currency))}
                changeLabel={fmtPct(summary.cost > 0 ? ((summary.total - summary.cost) / summary.cost) * 100 : 0)}
                positive={(summary.total - summary.cost) >= 0}
                sparkline={<Sparkline data={summarySparkData} positive={chartIsPositive} width={70} height={22} />}
                onAdd={() => nav("/transactions")}
                onAdvanced={() => setDashMode("advanced")}
                loading={loading}
                wallets={walletBreakdown.map((w) => ({
                  id: w.id,
                  name: w.name,
                  changeLabel: w.value > 0 ? fmtPct(w.pnlPct) : null,
                  positive: w.pnlPct >= 0,
                  sparkData: (walletSparks[w.id] || []).map((p) => ({ p })),
                }))}
              />
            </div>
          )}
          {wVisible("evolution") && (
            <div style={{ order: wOrder("evolution") }} className="flex flex-col gap-3">
              <LightEvolutionCard
                title={evolutionTitle}
                points={lightChartPoints}
                changePct={lightChangePct}
                loading={lightHistoryLoading}
              />
              {(() => {
                // Highlights the button label ("Painel avançado" / "Advanced
                // panel" / etc.) wherever it appears inside the hint sentence,
                // in the same amber as the button itself — works across all 6
                // languages since dash.light_mode_hint always embeds the exact
                // dash.view_advanced string verbatim (quoted or between
                // guillemets, depending on the language).
                const hint = t("dash.light_mode_hint");
                const label = t("dash.view_advanced");
                const idx = hint.indexOf(label);
                if (idx === -1) {
                  return <p className="text-xs text-zinc-400 font-mono">{hint}</p>;
                }
                return (
                  <p className="text-xs text-zinc-400 font-mono">
                    {hint.slice(0, idx)}
                    <span className="text-amber-400 font-medium">{label}</span>
                    {hint.slice(idx + label.length)}
                  </p>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {dashMode === "advanced" && (
      <>
      {/* Filter pills — always visible, anchored just after summary. */}
      <div style={{ order: wOrder("summary") + 1 }} className="flex flex-wrap items-center gap-2">
        <FilterPillsRow
          pillVisible={pillVisible}
          filterType={filterType}
          filterWallet={filterWallet}
          setFilterType={setFilterType}
          setFilterWallet={setFilterWallet}
          nav={nav}
          globalAssetTypes={globalAssetTypes}
          presentAssetTypes={presentAssetTypes}
          wallets={wallets}
          walletPillVisible={walletPillVisible}
        />
      </div>

      {/* Top movers (my portfolio) + Best/Worst performers */}
      <div style={{ order: wOrder("top_movers"), display: wVisible("top_movers") ? undefined : "none" }}
           className="space-y-3" data-testid="top-movers-widget">
        <TopMoversWidget
          filtered={filtered}
          sorted={sorted}
          wallets={wallets}
          nav={nav}
          currency={currency}
          fxRates={fxRates}
          mask={mask}
          showPerformers={wVisible("performers")}
          bestPerformer={bestPerformer}
          worstPerformer={worstPerformer}
        />
      </div>

      {/* Charts row — evolution + allocation share a responsive grid */}
      <div style={{ order: chartsOrder }}
           className={`grid gap-4 ${
             wVisible("evolution") && wVisible("allocation")
               ? "grid-cols-1 lg:grid-cols-3"
               : "grid-cols-1"
           } ${!wVisible("evolution") && !wVisible("allocation") ? "hidden" : ""}`}>
        <div className={`${wVisible("evolution") && wVisible("allocation") ? "lg:col-span-2" : "col-span-full"} bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5 ${!wVisible("evolution") ? "hidden" : ""}`}>
          <EvolutionChart
            filterType={filterType}
            usedSafetyNet={usedSafetyNet}
            range={range}
            setRange={setRange}
            candleData={candleData}
            chartLoading={chartLoading}
            chartIsPositive={chartIsPositive}
            lineWeekendBands={lineWeekendBands}
            lineDayBoundaries={lineDayBoundaries}
            candleYDomain={candleYDomain}
            hideValues={hideValues}
            currency={currency}
            runBackfill={runBackfill}
            backfilling={backfilling}
            chartClasses={chartClasses}
            hiddenClasses={hiddenClasses}
            toggleClassLine={toggleClassLine}
          />
        </div>

        <div className={`bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5 ${!wVisible("allocation") ? "hidden" : ""}`}>
          <AllocationWidget
            allocationMode={allocationMode}
            setAllocationMode={setAllocationMode}
            setShowTargetDialog={setShowTargetDialog}
            pieData={pieData}
            activeAllocation={activeAllocation}
            setActiveAllocation={setActiveAllocation}
            totalForAlloc={totalForAlloc}
            filtered={filtered}
            hideValues={hideValues}
            currency={currency}
            fxRates={fxRates}
            hasAllocationTarget={hasAllocationTarget}
            classAllocationRows={classAllocationRows}
            allocOverrides={allocOverrides}
          />
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

      {/* Retornos Mensais — prévia (6 jul 2026), link para a página Análise
          completa. Pro-only (ver MonthlyReturnsPreview.jsx). */}
      <div style={{ order: wOrder("monthly_returns"), display: wVisible("monthly_returns") ? undefined : "none" }}
           data-testid="monthly-returns-widget">
        <MonthlyReturnsPreview walletId={filterWallet} />
      </div>

      {/* "Ativos e Liquidez" (7 jul 2026) — ver comentário em
          dashboardConstants.js (WIDGET_DEFS, id "liquidity") e
          LiquidityCard.jsx. Usa os mesmos holdings (`filtered`) já
          carregados para o resto do Painel. */}
      <div style={{ order: wOrder("liquidity"), display: wVisible("liquidity") ? undefined : "none" }}
           data-testid="liquidity-widget">
        <LiquidityCard holdings={filtered} currency={currency} fxRates={fxRates} hideValues={hideValues} />
      </div>

      {/* Holdings table */}
      <div style={{ order: wOrder("assets"), display: wVisible("assets") ? undefined : "none" }}>
        <AssetsTable
          sorted={sorted}
          visibleCols={visibleCols}
          colVisible={colVisible}
          toggleCol={toggleCol}
          colMenuOpen={colMenuOpen}
          setColMenuOpen={setColMenuOpen}
          sortKey={sortKey}
          sortDir={sortDir}
          handleSort={handleSort}
          wallets={wallets}
          currency={currency}
          fxRates={fxRates}
          mask={mask}
          hideValues={hideValues}
          allocOverrides={allocOverrides}
          reclassifyOpenKey={reclassifyOpenKey}
          setReclassifyOpenKey={setReclassifyOpenKey}
          saveOverride={saveOverride}
          sparklines={sparklines}
          nav={nav}
          load={load}
        />
      </div>
      </>
      )}
    </div>
  );
}

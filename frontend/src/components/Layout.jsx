import React, { useEffect, useState, useCallback } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useI18n, LANGUAGES } from "../context/I18nContext";
import { api } from "../lib/api";
import {
  TrendingUp, LogOut, Wallet as WalletIcon, LayoutDashboard, Receipt, Bell,
  Briefcase, Coins, Plus, Menu, X, Sun, Moon, Eye, Newspaper, Languages, LineChart, Settings, Link2, Globe, Search, BarChart2, ShieldCheck, ChevronDown, User,
} from "lucide-react";
import { Button } from "./ui/button";
import walletLogo from "../assets/wallet76-logo80x60.png";
import GlobalSearch from "./GlobalSearch";
import Sparkline from "./Sparkline";
import FeedbackWidget from "./FeedbackWidget";
import { onSidebarRefreshRequested } from "../lib/sidebarRefresh";

const TYPE_ICON = { broker: Briefcase, exchange: Coins, wallet: WalletIcon };
// Routes collapsed under the "Portfólio" sidebar group (see REGRA de UX
// discutida com o utilizador em jul/2026: agrupar as páginas de "gerir o
// que tenho" para reduzir o nº de linhas visíveis na sidebar).
const PORTFOLIO_GROUP_ROUTES = ["/wallets", "/transactions", "/watchlist", "/alerts", "/analytics"];

export default function Layout({ children, currency, setCurrency }) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useI18n();
  const nav = useNavigate();
  const loc = useLocation();
  const [wallets, setWallets] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [alertCount, setAlertCount] = useState(0);
  const [walletStats, setWalletStats] = useState({}); // { [wallet_id]: { value, cost, pnl, pnlPct } }
  const [walletSparks, setWalletSparks] = useState({}); // { [wallet_id]: [number...7] }
  const [searchOpen, setSearchOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [unreadFeedback, setUnreadFeedback] = useState(0);
  const isPortfolioRouteActive = PORTFOLIO_GROUP_ROUTES.includes(loc.pathname);
  const [portfolioOpen, setPortfolioOpen] = useState(isPortfolioRouteActive);
  // Auto-expand the group whenever navigation lands on one of its pages, so
  // the active link is never hidden behind a collapsed toggle. Doesn't
  // auto-collapse on navigating away — once opened, stays open until the
  // user collapses it manually (same pattern most sidebar accordions use).
  useEffect(() => {
    if (isPortfolioRouteActive) setPortfolioOpen(true);
  }, [loc.pathname, isPortfolioRouteActive]);

  // Poll unread feedback count (admin only). Skips the request while the
  // tab is backgrounded (no point polling a hidden tab every 30s), and
  // catches up immediately when it regains focus instead of waiting out
  // the rest of the interval.
  useEffect(() => {
    if (user?.email !== "entredonos@gmail.com") return;
    const fetch = () => {
      if (document.visibilityState === "hidden") return;
      api.get("/feedback/unread-count").then(r => setUnreadFeedback(r.data?.count || 0)).catch(() => {});
    };
    fetch();
    const tid = setInterval(fetch, 30000);
    const onVisible = () => { if (document.visibilityState === "visible") fetch(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(tid); document.removeEventListener("visibilitychange", onVisible); };
  }, [user?.email]);

  // Cmd/Ctrl+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Sidebar summary data (wallet list, alert badge count, watchlist badge
  // count, per-wallet PnL for the sparklines). Runs once on mount, not on
  // every navigation: this used to be keyed off `loc.pathname`, so every
  // single route change — even between pages that have nothing to do with
  // wallets/alerts/watchlists, like Settings → Analytics — restarted the
  // interval and immediately re-fired all 5 requests. A sidebar badge is
  // fine being up to 30s stale; it doesn't need to be re-fetched just
  // because the user clicked a nav link. Also skips the request round-trip
  // while the tab is backgrounded, and catches up on refocus.
  useEffect(() => {
    let cancel = false;
    const load = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const [w, a, wl, p] = await Promise.all([
          api.get("/wallets"),
          api.get("/alerts"),
          api.get("/watchlists"),
          api.get("/portfolio"),
        ]);
        if (cancel) return;
        setWallets(w.data || []);
        setAlertCount((a.data || []).filter((x) => x.active).length);
        setWatchlist(wl.data || []);
        // Sparklines optional — subscription gated, don't block main load
        api.get("/wallets/sparklines").then(r => setWalletSparks(r.data || {})).catch(() => {});
        // Per-wallet PnL aggregation
        const stats = {};
        (p.data?.assets || []).forEach((it) => {
          const id = it.wallet_id;
          if (!id) return;
          if (!stats[id]) stats[id] = { value: 0, cost: 0, pnl: 0 };
          const value = Number(it.value_usd ?? 0);
          const cost = Number(it.cost_usd ?? ((it.avg_cost_usd || 0) * (it.quantity || 0)));
          const pnl = Number(it.pnl_usd ?? (value - cost));

          stats[id].value += value;
          stats[id].cost += cost;
          stats[id].pnl += pnl;        });
        Object.keys(stats).forEach((id) => {
          stats[id].pnlPct = stats[id].cost > 0 ? (stats[id].pnl / stats[id].cost) * 100 : 0;
        });
        setWalletStats(stats);
      } catch (e) { /* noop */ }
    };
    load();
    const tid = setInterval(load, 30000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    // Pages that create/rename/delete a wallet, alert, or watchlist call
    // requestSidebarRefresh() so the sidebar catches up immediately instead
    // of waiting out the rest of the 30s interval.
    const unsubscribe = onSidebarRefreshRequested(load);
    return () => {
      cancel = true;
      clearInterval(tid);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, []);

  const linkCls = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
      isActive ? "bg-zinc-800/80 text-zinc-50" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
    }`;

  const sidebarParams = new URLSearchParams(loc.search);
  const selectedWalletId = sidebarParams.get("wallet");
  const Sidebar = (
      
    <aside className="w-full md:w-64 lg:w-72 bg-zinc-950 md:border-r border-zinc-800/50 flex flex-col h-full">
      <Link
        to="/dashboard"
        onClick={() => setOpen(false)}
        className="px-5 py-5 flex items-center gap-3 border-b border-zinc-800/50 hover:bg-zinc-900/40 transition-colors"
        data-testid="sidebar-logo-home"
      >
        <img src={walletLogo} alt="Wallet76" className="w-12 h-12 object-contain" />
        <div className="flex-1 min-w-0">
          <div className="font-display text-base text-zinc-100">Wallet76</div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-400">v1.0</div>
        </div>
      </Link>

      {/* Search bar */}
      <div className="px-3 pt-3 pb-1">
        <button
          onClick={() => setSearchOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300 transition-colors text-sm font-mono"
        >
          <Search className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left text-xs">{t("nav.asset_search")}</span>
          <kbd className="hidden lg:block text-[9px] border border-zinc-700 rounded px-1 py-0.5">⌘K</kbd>
        </button>
      </div>

      <nav className="px-3 py-2 space-y-1">
        <NavLink to="/dashboard" className={linkCls} data-testid="nav-dashboard" onClick={() => setOpen(false)}>
          <LayoutDashboard className="w-4 h-4" /> {t("nav.dashboard")}
        </NavLink>

        {/* Portfólio group — Carteiras/Transações/Watchlist/Alertas, colapsável */}
        <button
          type="button"
          onClick={() => setPortfolioOpen((v) => !v)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
            isPortfolioRouteActive ? "text-zinc-50" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
          }`}
          data-testid="nav-group-portfolio-toggle"
          aria-expanded={portfolioOpen}
        >
          <Briefcase className="w-4 h-4" />
          <span className="flex-1 text-left">{t("nav.portfolio_group")}</span>
          <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${portfolioOpen ? "rotate-180" : ""}`} />
        </button>
        {portfolioOpen && (
          <div className="pl-3 ml-4 space-y-1 border-l border-zinc-800/60" data-testid="nav-group-portfolio-items">
            <NavLink to="/wallets" className={linkCls} data-testid="nav-wallets" onClick={() => setOpen(false)}>
              <WalletIcon className="w-4 h-4" />
              <span>{t("nav.wallets")}</span>
              {wallets.length > 0 && (
                <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">{wallets.length}</span>
              )}
            </NavLink>
            <NavLink to="/transactions" className={linkCls} data-testid="nav-transactions" onClick={() => setOpen(false)}>
              <Receipt className="w-4 h-4" /> {t("nav.transactions")}
            </NavLink>
            <NavLink to="/watchlist" className={linkCls} data-testid="nav-watchlist" onClick={() => setOpen(false)}>
              <Eye className="w-4 h-4" />
              <span>{t("nav.watchlist")}</span>
              {watchlist.length > 0 && (
                <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700" data-testid="watchlist-badge">{watchlist.length}</span>
              )}
            </NavLink>
            <NavLink to="/alerts" className={linkCls} data-testid="nav-alerts" onClick={() => setOpen(false)}>
              <Bell className="w-4 h-4" />
              <span>{t("nav.alerts")}</span>
              {alertCount > 0 && (
                <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40" data-testid="alerts-badge">{alertCount}</span>
              )}
            </NavLink>
            <NavLink to="/analytics" className={linkCls} data-testid="nav-analytics" onClick={() => setOpen(false)}>
              <BarChart2 className="w-4 h-4" /> {t("nav.analytics")}
            </NavLink>
          </div>
        )}

        <NavLink to="/news" className={linkCls} data-testid="nav-news" onClick={() => setOpen(false)}>
          <Newspaper className="w-4 h-4" /> {t("nav.news")}
        </NavLink>
        <NavLink to="/market" className={linkCls} data-testid="nav-market" onClick={() => setOpen(false)}>
          <LineChart className="w-4 h-4" /> {t("nav.market")}
        </NavLink>
        <NavLink to="/connected-accounts" className={linkCls} data-testid="nav-brokers" onClick={() => setOpen(false)}>
          <Link2 className="w-4 h-4" /> {t("nav.brokers")}
        </NavLink>
        <NavLink to="/settings" className={linkCls} data-testid="nav-settings" onClick={() => setOpen(false)}>
          <Settings className="w-4 h-4" /> {t("nav.settings")}
        </NavLink>
      </nav>

      <div className="px-5 mt-4 mb-2 flex items-center justify-between">
        <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-400">{t("common.wallets")}</div>
        <Link to="/wallets" className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-400 hover:text-zinc-200 border border-zinc-800 px-2 py-0.5 rounded" data-testid="sidebar-new-wallet">
          <Plus className="inline w-3 h-3 mr-1"/> {t("common.new")}
        </Link>
      </div>
      <div className="px-3 space-y-1 overflow-y-auto flex-1">
        {/* "All portfolios" global entry */}
        {wallets.length > 0 && (() => {
          const isGlobal = !selectedWalletId;
          return (
            <Link
              to="/dashboard"
              onClick={() => setOpen(false)}
              className={`relative flex items-center gap-2 pl-4 pr-3 py-2 rounded-md text-sm transition-colors ${
                isGlobal
                  ? "bg-blue-500/20 text-white border border-blue-400/60 shadow-[0_0_0_1px_rgba(96,165,250,0.15)]"
                  : "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/40 border border-transparent"
              }`}
              data-testid="sidebar-wallet-global"
            >
              {isGlobal && <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r bg-blue-300" />}
              <Globe className={`w-4 h-4 shrink-0 ${isGlobal ? "text-blue-300" : "text-zinc-400"}`} />
              <span className="truncate min-w-0 flex-1 text-xs font-mono uppercase tracking-wider">
                {t("common.all_portfolios")}
              </span>
            </Link>
          );
        })()}

        {wallets.length === 0 && (
          <div className="px-3 py-2 text-xs text-zinc-600 font-mono">{t("nav.no_wallets")}</div>
        )}
        {wallets.map((w) => {
          const Icon = TYPE_ICON[w.type] || WalletIcon;
          const st = walletStats[w.id];
          const pnlPct = st?.pnlPct;
          const sparkData = (walletSparks[w.id] || []).map(p => ({ p }));
          // Color based on 7-day direction; fall back to overall PnL if no spark data
          const sparkPos = sparkData.length >= 2
            ? sparkData[sparkData.length - 1].p >= sparkData[0].p
            : (pnlPct || 0) >= 0;
          const pos = (pnlPct || 0) >= 0;
          const activeWallet = selectedWalletId === w.id;
          return (
            <Link
              key={w.id}
              to={`/dashboard?wallet=${w.id}`}
              onClick={() => setOpen(false)}
                className={`relative flex items-center gap-2 pl-4 pr-3 py-2 rounded-md text-sm transition-colors ${
                  activeWallet
                  ? "bg-blue-500/20 text-white border border-blue-400/60 shadow-[0_0_0_1px_rgba(96,165,250,0.15)]"
                  : "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/40 border border-transparent"
              }`}
              data-testid={`sidebar-wallet-${w.id}`}
            >
              {activeWallet && (
                <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r bg-blue-300" />
              )}

              <Icon className={`w-4 h-4 shrink-0 ${activeWallet ? "text-blue-300" : "text-zinc-400"}`} />

              <span className="truncate min-w-0 flex-1">{w.name}</span>

              {sparkData.length >= 2 && (
                <Sparkline data={sparkData} positive={sparkPos} />
              )}

              {pnlPct !== undefined && st.cost > 0 ? (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                    pos
                      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                      : "text-rose-400 border-rose-500/30 bg-rose-500/10"
                  }`}
                  data-testid={`sidebar-wallet-pnl-${w.id}`}
                  title={`${pos ? "+" : ""}${pnlPct.toFixed(2)}%`}
                >
                  {pos ? "+" : ""}
                  {pnlPct.toFixed(1)}%
                </span>
              ) : (
                <span className="text-[10px] font-mono text-zinc-600 shrink-0">
                  {w.currency || "USD"}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="px-5 py-4 border-t border-zinc-800/50">
        <div className="flex items-center gap-2 mb-3">
          {setCurrency && (
            <div className="flex border border-zinc-800 rounded-md overflow-hidden" data-testid="currency-toggle">
              {["USD", "EUR", "CHF", "BRL"].map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  data-testid={`currency-${c.toLowerCase()}`}
                  className={`px-2.5 py-1 text-xs font-mono transition-colors ${
                    currency === c ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="ml-auto p-1.5 border border-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
            title={theme === "light" ? t("theme.switch_dark") : t("theme.switch_light")}
            data-testid="theme-toggle"
          >
            {theme === "light" ? <Moon className="w-4 h-4"/> : <Sun className="w-4 h-4"/>}
          </button>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <Languages className="w-4 h-4 text-zinc-400"/>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="bg-zinc-900/50 border border-zinc-800 text-zinc-300 text-xs font-mono px-2 py-1 rounded flex-1"
            data-testid="lang-select"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
            ))}
          </select>
        </div>

        {user?.email === "entredonos@gmail.com" && (
          <NavLink
            to="/admin/feedback"
            onClick={() => {
              setOpen(false);
              if (unreadFeedback > 0) {
                api.patch("/feedback/mark-all-read").then(() => setUnreadFeedback(0)).catch(() => {});
              }
            }}
            className="flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs font-mono text-amber-400 hover:bg-amber-400/10 border border-amber-400/30 hover:border-amber-400/60 transition-colors mb-2"
          >
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              {t("nav.admin_feedback")}
            </span>
            {unreadFeedback > 0 && (
              <span className="bg-amber-400 text-zinc-950 text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {unreadFeedback > 99 ? "99+" : unreadFeedback}
              </span>
            )}
          </NavLink>
        )}

        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-xs text-zinc-300 truncate" data-testid="nav-user-email">{user?.email}</div>
            <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">{t("nav.logged_in")}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => { await logout(); nav("/login"); }}
            className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
            data-testid="nav-logout"
            title={t("common.logout")}
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </aside>
  );

  return (
    <>
    <div className="min-h-screen flex">
      {/* Desktop sidebar */}
      <div className="hidden md:block sticky top-0 h-screen">{Sidebar}</div>

      {/* Mobile sidebar overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/70" onClick={() => setOpen(false)}>
          <div className="absolute left-0 top-0 h-full w-72 bg-zinc-950">{Sidebar}</div>
        </div>
      )}

      <div className="flex-1 min-w-0">
        {/* justify-between com 4 filhos separados espalhava o logo+"Wallet76"
            no meio do cabeçalho, com um vão grande entre eles e o hambúrguer
            — feio (5 jul 2026). Agrupados agora num só bloco à esquerda,
            encostados aos 3 traços; só a lupa fica isolada à direita. */}
        <header className="md:hidden sticky top-0 z-30 backdrop-blur-md bg-zinc-950/80 border-b border-zinc-800/50 h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <button onClick={() => setOpen(true)} className="text-zinc-300" data-testid="open-sidebar">
              <Menu className="w-5 h-5"/>
            </button>
            <img src={walletLogo} alt="Wallet76" className="w-7 h-7 object-contain" />
            <div className="font-display text-base tracking-tight text-zinc-100">Wallet76</div>
          </div>
          <button onClick={() => setSearchOpen(true)} className="text-zinc-400 hover:text-zinc-200 transition-colors">
            <Search className="w-5 h-5"/>
          </button>
        </header>

        {/* Main content */}
        <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-8 pb-24 md:pb-8 max-w-[1600px] mx-auto">{children}</main>
      </div>
    </div>

      {/* Global search modal */}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Feedback widget */}
      <FeedbackWidget />

      {/* ── Mobile bottom navigation ─────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/60"
           style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex items-center justify-around h-14">
          {/* 5 separadores acordados para a app mobile: Início/Carteiras/
              Mercado/Alertas/Perfil — "Transações" deixou de ter separador
              próprio aqui (fica acessível a partir de Carteiras); "Mercado"
              entrou no lugar, já com watchlist + notícias dentro (ver
              Market.jsx) em vez de terem separadores próprios.
              5º separador aponta a /profile (não /settings): o mockup
              aprovado tinha "Perfil" (avatar/email + Idioma + Moeda +
              Segurança + Sair) — página nova em pages/Profile.jsx. A
              página de Definições completa (PIN/biometria/subscrição/
              danger zone) continua a existir em /settings, com um link a
              partir do Perfil (5 jul 2026: reportado como "ta diferente,
              neste momento eh defenicoes e nao tem nada a ver" ao
              apontar /settings direto). */}
          {[
            { to: "/dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard" },
            { to: "/wallets",   icon: WalletIcon,       labelKey: "nav.wallets" },
            { to: "/market",    icon: LineChart,        labelKey: "nav.market" },
            { to: "/alerts",    icon: Bell,             labelKey: "nav.alerts", badge: alertCount },
            { to: "/profile",   icon: User,             labelKey: "nav.profile" },
          ].map(({ to, icon: Icon, labelKey, badge }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors ${isActive ? "text-zinc-50" : "text-zinc-400 hover:text-zinc-300"}`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-zinc-950 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
{badge > 99 ? "99+" : badge}</span>
                )}
              </div>
              <span>{t(labelKey)}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}

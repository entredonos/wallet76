import React, { useEffect, useState } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useI18n, LANGUAGES } from "../context/I18nContext";
import { api } from "../lib/api";
import {
  TrendingUp, LogOut, Wallet as WalletIcon, LayoutDashboard, Receipt, Bell,
  Briefcase, Coins, Plus, Menu, X, Sun, Moon, Eye, Newspaper, Languages, LineChart, Settings,
} from "lucide-react";
import { Button } from "./ui/button";
import walletLogo from "../assets/wallet76-logo80x60.png";

const TYPE_ICON = { broker: Briefcase, exchange: Coins, wallet: WalletIcon };

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
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const [w, a, wl, p, sp] = await Promise.all([
          api.get("/wallets"),
          api.get("/alerts"),
          api.get("/watchlists"),
          api.get("/portfolio"),
          api.get("/wallets/sparklines"),
        ]);
        if (cancel) return;
        setWallets(w.data || []);
        setAlertCount((a.data || []).filter((x) => x.active).length);
        setWatchlist(wl.data || []);
        setWalletSparks(sp.data || {});
        // Per-wallet PnL aggregation
        const stats = {};
        (p.data?.assets || []).forEach((it) => {
          const id = it.wallet_id;
          if (!id) return;
          if (!stats[id]) stats[id] = { value: 0, cost: 0, pnl: 0 };
          stats[id].value += it.value_usd || 0;
          stats[id].cost += (it.avg_cost_usd || 0) * (it.quantity || 0);
          stats[id].pnl += it.pnl_usd || 0;
        });
        Object.keys(stats).forEach((id) => {
          stats[id].pnlPct = stats[id].cost > 0 ? (stats[id].pnl / stats[id].cost) * 100 : 0;
        });
        setWalletStats(stats);
      } catch (e) { /* noop */ }
    };
    load();
    const tid = setInterval(load, 30000);
    return () => { cancel = true; clearInterval(tid); };
  }, [loc.pathname]);

  const linkCls = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
      isActive ? "bg-zinc-800/80 text-zinc-50" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
    }`;

  const Sidebar = (
    <aside className="w-full md:w-64 lg:w-72 bg-zinc-950 md:border-r border-zinc-800/50 flex flex-col h-full">
      <div className="px-5 py-5 flex items-center gap-3 border-b border-zinc-800/50">
        <img src={walletLogo} alt="Wallet76" className="w-12 h-12 object-contain" />
        <div>
          
          <div className="font-display text-base text-zinc-100">Wallet76</div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-500">v1.0</div>
        </div>
      </div>

      <nav className="px-3 py-4 space-y-1">
        <NavLink to="/" end className={linkCls} data-testid="nav-dashboard" onClick={() => setOpen(false)}>
          <LayoutDashboard className="w-4 h-4" /> {t("nav.dashboard")}
        </NavLink>
        <NavLink to="/transactions" className={linkCls} data-testid="nav-transactions" onClick={() => setOpen(false)}>
          <Receipt className="w-4 h-4" /> {t("nav.transactions")}
        </NavLink>
        <NavLink to="/alerts" className={linkCls} data-testid="nav-alerts" onClick={() => setOpen(false)}>
          <Bell className="w-4 h-4" />
          <span>{t("nav.alerts")}</span>
          {alertCount > 0 && (
            <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40" data-testid="alerts-badge">{alertCount}</span>
          )}
        </NavLink>
        <NavLink to="/wallets" className={linkCls} data-testid="nav-wallets" onClick={() => setOpen(false)}>
          <WalletIcon className="w-4 h-4" /> {t("nav.wallets")}
        </NavLink>
        <NavLink to="/watchlist" className={linkCls} data-testid="nav-watchlist" onClick={() => setOpen(false)}>
          <Eye className="w-4 h-4" />
          <span>{t("nav.watchlist")}</span>
          {watchlist.length > 0 && (
            <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700" data-testid="watchlist-badge">{watchlist.length}</span>
          )}
        </NavLink>
        <NavLink to="/news" className={linkCls} data-testid="nav-news" onClick={() => setOpen(false)}>
          <Newspaper className="w-4 h-4" /> {t("nav.news")}
        </NavLink>
        <NavLink to="/market" className={linkCls} data-testid="nav-market" onClick={() => setOpen(false)}>
          <LineChart className="w-4 h-4" /> {t("nav.market")}
        </NavLink>
        <NavLink to="/settings" className={linkCls} data-testid="nav-settings" onClick={() => setOpen(false)}>
          <Settings className="w-4 h-4" /> {t("nav.settings")}
        </NavLink>
      </nav>

      <div className="px-5 mt-4 mb-2 flex items-center justify-between">
        <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-500">{t("common.wallets")}</div>
        <Link to="/wallets" className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-400 hover:text-zinc-200 border border-zinc-800 px-2 py-0.5 rounded" data-testid="sidebar-new-wallet">
          <Plus className="inline w-3 h-3 mr-1"/> {t("common.new")}
        </Link>
      </div>
      <div className="px-3 space-y-1 overflow-y-auto flex-1">
        {wallets.length === 0 && (
          <div className="px-3 py-2 text-xs text-zinc-600 font-mono">No wallets yet</div>
        )}
        {wallets.map((w) => {
          const Icon = TYPE_ICON[w.type] || WalletIcon;
          const st = walletStats[w.id];
          const pnlPct = st?.pnlPct;
          const pos = (pnlPct || 0) >= 0;
          const sparkData = walletSparks[w.id] || [];
          return (
            <Link
              key={w.id}
              to={`/?wallet=${w.id}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/40 transition-colors"
              data-testid={`sidebar-wallet-${w.id}`}
            >
              <Icon className="w-4 h-4 text-zinc-500 shrink-0" />
              <span className="truncate min-w-0 flex-1">{w.name}</span>
              {sparkData.length >= 2 && (
                <MiniSpark data={sparkData} positive={pos} testId={`wallet-spark-${w.id}`}/>
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
                  {pos ? "+" : ""}{pnlPct.toFixed(1)}%
                </span>
              ) : (
                <span className="text-[10px] font-mono text-zinc-600 shrink-0">{w.currency || "USD"}</span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="px-5 py-4 border-t border-zinc-800/50">
        <div className="flex items-center gap-2 mb-3">
          {setCurrency && (
            <div className="flex border border-zinc-800 rounded-md overflow-hidden" data-testid="currency-toggle">
              {["USD", "EUR", "CHF"].map((c) => (
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
            title={theme === "light" ? "Switch to dark" : "Switch to light"}
            data-testid="theme-toggle"
          >
            {theme === "light" ? <Moon className="w-4 h-4"/> : <Sun className="w-4 h-4"/>}
          </button>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <Languages className="w-4 h-4 text-zinc-500"/>
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

        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-xs text-zinc-300 truncate" data-testid="nav-user-email">{user?.email}</div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Logged in</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => { await logout(); nav("/login"); }}
            className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
            data-testid="nav-logout"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
        <div className="text-[10px] font-mono text-zinc-600 mt-3 text-center">Prices via Binance WS + CoinGecko + Yahoo</div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar */}
      <div className="hidden md:block sticky top-0 h-screen">{Sidebar}</div>

      {/* Mobile sidebar overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/70" onClick={() => setOpen(false)}>
          <div className="absolute left-0 top-0 h-full w-72 bg-zinc-950 border-r border-zinc-800/50" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end p-3">
              <button onClick={() => setOpen(false)} className="text-zinc-400" data-testid="close-sidebar"><X className="w-5 h-5"/></button>
            </div>
            {Sidebar}
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <header className="md:hidden sticky top-0 z-30 backdrop-blur-md bg-zinc-950/80 border-b border-zinc-800/50 h-14 flex items-center justify-between px-4">
          <button onClick={() => setOpen(true)} className="text-zinc-300" data-testid="open-sidebar">
            <Menu className="w-5 h-5"/>
          </button>
          <img src={walletLogo} alt="Wallet76" className="w-8 h-8 object-contain" />
          <div className="font-display text-base tracking-tight text-zinc-100">Wallet76</div>
          <div className="w-5"/>
        </header>

        <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-8 max-w-[1600px] mx-auto">{children}</main>
      </div>
    </div>
  );
}

function MiniSpark({ data, positive, testId }) {
  if (!data || data.length < 2) return null;
  const w = 60, h = 16;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(" ");
  const color = positive ? "#34d399" : "#fb7185"; // emerald-400 / rose-400
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 opacity-90" data-testid={testId}>
      <polyline fill="none" stroke={color} strokeWidth="1.4" points={points} strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Activity, Info,
  Star, Newspaper, ExternalLink, Plus,
} from "lucide-react";
import AssetIcon from "../components/AssetIcon";
import { fmtCurrency, fmtPct, fmtCompact, convert } from "../lib/format";
import InlineWatchlistDialog from "../components/InlineWatchlistDialog";
import { useI18n } from "../context/I18nContext";
import { SkeletonMoversList } from "../components/SkeletonRow";
import { Popover, PopoverTrigger, PopoverContent } from "../components/ui/popover";

// Must match MARKET_REFRESH_INTERVAL_SECONDS in backend/routes/market.py
// (900s = 15 min) — shown to the user next to the section titles so it's
// clear the movers lists aren't live-live, just refreshed periodically
// (kept deliberately conservative to stay well within the free CoinGecko/
// yfinance rate limits after the 3 jul 2026 incident).
const MARKET_REFRESH_MINUTES = 15;

export default function Market({ currency = "USD" }) {
  const { t } = useI18n();
  const [tab, setTab] = useState("crypto"); // "crypto" | "stocks" | "watch"
  const [crypto, setCrypto] = useState({ gainers: [], losers: [] });
  const [stocks, setStocks] = useState({ gainers: [], losers: [] });
  const [loading, setLoading] = useState(true);
  const [watchAsset, setWatchAsset] = useState(null);
  const [fxRates, setFxRates] = useState({ USD: 1, EUR: 0.92 });

  // Compact news preview per tab — reuses the same /market/latest-news feed
  // already fetched whole on the News page, just sliced down to 3 items
  // here. No search box in this preview (see chat: a 2-3 item list doesn't
  // need one; the full News page still has full search).
  const [cryptoNews, setCryptoNews] = useState([]);
  const [stocksNews, setStocksNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);

  // Watchlist preview — flattens every group's items into one list (no
  // group tabs here, unlike the full /watchlist page) since this is just a
  // quick glance from Mercado. Managing groups/columns/alerts still happens
  // on the full Watchlist page, linked below.
  const [watchItems, setWatchItems] = useState([]);
  const [watchLoading, setWatchLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [c, s] = await Promise.all([
          api.get("/market/movers/crypto"),
          api.get("/market/movers/stocks"),
        ]);
        setCrypto(c.data || { gainers: [], losers: [] });
        setStocks(s.data || { gainers: [], losers: [] });
      } catch (e) { /* noop */ }
      setLoading(false);
    })();

    (async () => {
      setNewsLoading(true);
      try {
        const { data } = await api.get("/market/latest-news");
        setCryptoNews((data?.crypto || []).slice(0, 3));
        setStocksNews((data?.stocks || []).slice(0, 3));
      } catch { /* noop */ }
      setNewsLoading(false);
    })();

    (async () => {
      setWatchLoading(true);
      try {
        const { data } = await api.get("/watchlist-groups");
        const flat = (data || []).flatMap((g) => g.items || []);
        setWatchItems(flat);
      } catch { /* noop */ }
      setWatchLoading(false);
    })();

    (async () => {
      try {
        const { data } = await api.get("/portfolio");
        setFxRates(data?.summary?.fx_rates || { USD: 1, EUR: data?.summary?.eur_rate || 0.92, CHF: data?.summary?.chf_rate || 0.88, BRL: data?.summary?.brl_rate || 5.0 });
      } catch { /* usa defaults se /portfolio falhar */ }
    })();
  }, []);

  const news = tab === "stocks" ? stocksNews : cryptoNews;

  return (
    <div className="space-y-8 fade-in">
      <div>
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("market.kicker")}</div>
        <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mt-2">{t("market.title")}</h1>
        <p className="text-zinc-400 mt-2">{t("market.subtitle")}</p>
      </div>

      {/* Segmented control — Crypto / Stocks / Watching. Replaces the old
          "always show both stacked" layout: one tab at a time reads better
          on mobile, and it's also where the watchlist preview + a compact
          news feed now live (see chat: keep the bottom nav at 5 tabs by
          folding watchlist + news into Mercado instead of giving them their
          own tab). */}
      <div className="flex gap-2" data-testid="market-tabs">
        {[
          { key: "crypto", label: t("common.crypto"), icon: Activity },
          { key: "stocks", label: t("common.stocks"), icon: Activity },
          { key: "watch", label: t("market.tab_watch"), icon: Star },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono transition-colors ${
              tab === key ? "bg-zinc-100 text-zinc-950" : "bg-zinc-900/50 text-zinc-400 border border-zinc-800 hover:text-zinc-200"
            }`}
            data-testid={`market-tab-${key}`}
          >
            <Icon className="w-3.5 h-3.5"/> {label}
          </button>
        ))}
      </div>

      {tab === "crypto" && (
        <>
          <section className="space-y-4" data-testid="market-crypto-section">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400"/>
              <div className="text-xs font-mono uppercase tracking-[0.2em] text-amber-400">{t("market.crypto_24h")}</div>
              <div className="text-[10px] font-mono text-zinc-600">{t("market.updated_every", { minutes: MARKET_REFRESH_MINUTES })}</div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {loading ? (
                <>
                  <SkeletonMoversList/>
                  <SkeletonMoversList/>
                </>
              ) : (
                <>
                  <MoversList kind="crypto" type="gainers" items={crypto.gainers} t={t} onWatch={setWatchAsset} currency={currency} fxRates={fxRates} universeNote={t("market.crypto_universe_note")}/>
                  <MoversList kind="crypto" type="losers" items={crypto.losers} t={t} onWatch={setWatchAsset} currency={currency} fxRates={fxRates} universeNote={t("market.crypto_universe_note")}/>
                </>
              )}
            </div>
          </section>
          <NewsPreview items={news} loading={newsLoading} title={t("news.crypto_news")}/>
        </>
      )}

      {tab === "stocks" && (
        <>
          <section className="space-y-4" data-testid="market-stocks-section">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400"/>
              <div className="text-xs font-mono uppercase tracking-[0.2em] text-blue-400">{t("market.stocks_day")}</div>
              <div className="text-[10px] font-mono text-zinc-600">{t("market.updated_every", { minutes: MARKET_REFRESH_MINUTES })}</div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {loading ? (
                <>
                  <SkeletonMoversList/>
                  <SkeletonMoversList/>
                </>
              ) : (
                <>
                  <MoversList kind="stock" type="gainers" items={stocks.gainers} t={t} onWatch={setWatchAsset} currency={currency} fxRates={fxRates} universeNote={t("market.stocks_universe_note")}/>
                  <MoversList kind="stock" type="losers" items={stocks.losers} t={t} onWatch={setWatchAsset} currency={currency} fxRates={fxRates} universeNote={t("market.stocks_universe_note")}/>
                </>
              )}
            </div>
          </section>
          <NewsPreview items={news} loading={newsLoading} title={t("news.stocks_news")}/>
        </>
      )}

      {tab === "watch" && (
        <WatchPreview items={watchItems} loading={watchLoading} t={t} currency={currency} fxRates={fxRates}/>
      )}

      <InlineWatchlistDialog asset={watchAsset} open={!!watchAsset} onOpenChange={(v) => { if (!v) setWatchAsset(null); }} />
    </div>
  );
}

// Compact preview of the same feed the full News page shows — 3 headlines,
// no search box (see chat: not worth it for a list this short), with a link
// through to /news for the complete feeds + search.
function NewsPreview({ items, loading, title }) {
  const { t } = useI18n();
  return (
    <section className="space-y-3" data-testid="market-news-preview">
      <div className="flex items-center gap-2">
        <Newspaper className="w-4 h-4 text-zinc-400"/>
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{title}</div>
      </div>
      {loading ? (
        <SkeletonMoversList/>
      ) : items.length === 0 ? (
        <div className="text-zinc-600 text-sm font-mono px-1">{t("news.no_results")}</div>
      ) : (
        <div className="space-y-2">
          {items.map((n, i) => (
            <a
              key={n.id || i}
              href={n.link}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-zinc-900/40 border border-zinc-800/50 hover:border-zinc-700/60 transition-colors rounded-xl p-3 flex items-start gap-2"
              data-testid={`market-news-item-${i}`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-zinc-100 text-sm line-clamp-2">{n.title}</div>
                <div className="text-[10px] font-mono text-zinc-400 mt-1">{n.publisher}</div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5"/>
            </a>
          ))}
        </div>
      )}
      <Link to="/news" className="inline-flex items-center gap-1 text-xs font-mono text-zinc-400 hover:text-zinc-300 transition-colors">
        {t("market.news_view_all")}
      </Link>
    </section>
  );
}

// Flattened watchlist preview — full group/column/alert management stays on
// the dedicated /watchlist page (linked at the bottom); this is just a
// glance from Mercado, per the approved mobile mockup.
function WatchPreview({ items, loading, t, currency = "USD", fxRates }) {
  if (loading) return <SkeletonMoversList/>;
  return (
    <section className="space-y-3" data-testid="market-watch-preview">
      {items.length === 0 ? (
        <div className="text-zinc-600 text-sm font-mono px-1">{t("market.watch_empty")}</div>
      ) : (
        <div className="space-y-2">
          {items.map((w) => {
            const pos = (w.change_24h || 0) >= 0;
            return (
              <Link
                key={w.id}
                to={`/asset/${w.asset_type}/${w.symbol}`}
                className="bg-zinc-900/40 border border-zinc-800/50 hover:border-zinc-700/60 transition-colors rounded-xl p-3 flex items-center gap-3"
                data-testid={`market-watch-item-${w.id}`}
              >
                <AssetIcon asset={w} size={28}/>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-zinc-100 text-sm">{w.custom_label || w.symbol}</div>
                  <div className="text-xs text-zinc-400 truncate">{w.name}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-zinc-100 text-sm">{w.price_usd ? fmtCurrency(convert(w.price_usd, currency, fxRates), currency) : "—"}</div>
                  <div className={`text-xs font-mono ${pos ? "text-emerald-400" : "text-rose-400"}`}>{fmtPct(w.change_24h || 0)}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <Link
        to="/watchlist"
        className="flex items-center justify-center gap-1.5 border border-dashed border-zinc-700 rounded-xl p-3 text-zinc-400 hover:text-zinc-300 hover:border-zinc-600 transition-colors text-sm font-mono"
        data-testid="market-watch-add-cta"
      >
        <Plus className="w-3.5 h-3.5"/> {t("market.watch_add_cta")}
      </Link>
      <Link to="/watchlist" className="inline-flex items-center gap-1 text-xs font-mono text-zinc-400 hover:text-zinc-300 transition-colors">
        {t("market.watch_view_all")}
      </Link>
    </section>
  );
}

function MoversList({ kind, type, items, t, universeNote, onWatch, currency = "USD", fxRates }) {
  const isGain = type === "gainers";
  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl overflow-hidden" data-testid={`movers-${kind}-${type}`}>
      <div className="px-5 py-3 border-b border-zinc-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isGain ? <TrendingUp className="w-4 h-4 text-emerald-400"/> : <TrendingDown className="w-4 h-4 text-rose-400"/>}
          <div className="text-sm font-medium text-zinc-200">{isGain ? t("market.gainers") : t("market.losers")}</div>
          <Popover>
            <PopoverTrigger
              className="text-zinc-600 hover:text-zinc-300 transition-colors"
              data-testid={`movers-${kind}-${type}-info`}
              aria-label={t("market.universe_info_label")}
            >
              <Info className="w-3.5 h-3.5"/>
            </PopoverTrigger>
            <PopoverContent className="w-64 text-xs text-zinc-300 bg-zinc-900 border-zinc-800" sideOffset={6}>
              {universeNote}
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="px-5 py-8 text-center text-zinc-600 text-sm" data-testid={`movers-${kind}-${type}-empty`}>
          {isGain ? t("market.no_gainers") : t("market.no_losers")}
        </div>
      ) : (
        <div className="divide-y divide-zinc-800/30">
          {/* Column headers — spacer widths (16px rank, 28px icon) mirror
              the row layout below so the labels line up with their values. */}
          <div className="flex items-center gap-3 px-5 py-1.5 text-[9px] font-mono uppercase tracking-wider text-zinc-600">
            <span style={{ width: 16 }} className="shrink-0"/>
            <span style={{ width: 28 }} className="shrink-0"/>
            <span className="min-w-0 flex-1">{t("market.col_asset")}</span>
            <span className="text-right">{t("market.col_price")}</span>
            <span className="text-right min-w-[64px]">{t("market.col_change")}</span>
          </div>
          {items.map((it, i) => {
            const pos = (it.change_24h || 0) >= 0;
            const assetTypeKey = kind === "crypto" ? "crypto" : "stock";
            const href = `/asset/${assetTypeKey}/${it.symbol}`;
            const asset = {
              symbol: it.symbol,
              name: it.name,
              asset_type: assetTypeKey,
              coingecko_id: it.coingecko_id,
            };
            return (
              <Link
                to={href}
                key={`${it.symbol}-${i}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-900/60 transition-colors"
                data-testid={`mover-${kind}-${type}-${it.symbol}`}
              >
                <span className="text-[10px] font-mono text-zinc-600 w-4 text-right">{i + 1}</span>
                <AssetIcon asset={asset} size={28}/>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-zinc-100 text-sm">{it.symbol}</div>
                  <div className="text-xs text-zinc-400 truncate">{it.name}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-zinc-100 text-sm">{it.price_usd ? fmtCurrency(convert(it.price_usd, currency, fxRates), currency) : "-"}</div>
                  {it.market_cap_usd && (
                    <div className="text-[10px] font-mono text-zinc-400">MC {fmtCompact(convert(it.market_cap_usd, currency, fxRates), currency)}</div>
                  )}
                </div>
                <div className={`text-right min-w-[64px] ${pos ? "text-emerald-400" : "text-rose-400"} font-mono text-sm`}>
                  <span className="inline-flex items-center gap-1">
                    {pos ? <ArrowUpRight className="w-3 h-3"/> : <ArrowDownRight className="w-3 h-3"/>}
                    {fmtPct(it.change_24h || 0)}
                  </span>
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onWatch?.(asset); }}
                  className="text-zinc-600 hover:text-amber-400 transition-colors shrink-0"
                  title={t("watch.add")}
                  data-testid={`mover-watch-${kind}-${type}-${it.symbol}`}
                >
                  <Star className="w-4 h-4"/>
                </button>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState, useRef } from "react";
import { api } from "../lib/api";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Newspaper, ExternalLink, Search, Briefcase, Bitcoin, TrendingUp, ChevronRight } from "lucide-react";
import { useI18n } from "../context/I18nContext";
import AssetIcon from "../components/AssetIcon";

export default function News() {
  const { t } = useI18n();

  // --- Auto-loaded feeds ---
  const [portfolioNews, setPortfolioNews] = useState([]);
  const [cryptoNews,    setCryptoNews]    = useState([]);
  const [stocksNews,    setStocksNews]    = useState([]);
  const [feedLoading,   setFeedLoading]   = useState(true);

  // --- Manual search ---
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState(null); // null = not searched yet
  const [srchLoading, setSrchLoading] = useState(false);
  const inputRef = useRef(null);

  // Load all three feeds on mount
  useEffect(() => {
    (async () => {
      setFeedLoading(true);
      try {
        const [pn, ln] = await Promise.all([
          api.get("/market/portfolio-news"),
          api.get("/market/latest-news"),
        ]);
        setPortfolioNews((pn.data || []).slice(0, 5));
        setCryptoNews((ln.data?.crypto || []).slice(0, 7));
        setStocksNews((ln.data?.stocks || []).slice(0, 7));
      } catch { /* noop */ }
      setFeedLoading(false);
    })();
  }, []);

  const doSearch = async (q = query) => {
    const sym = q.trim().toUpperCase();
    if (!sym) return;
    setSrchLoading(true);
    setResults(null);
    try {
      const { data } = await api.get("/news", { params: { symbol: sym, asset_type: "stock" } });
      setResults(data || []);
    } catch { setResults([]); }
    finally { setSrchLoading(false); }
  };

  const formatDate = (ts) => {
    if (!ts) return "";
    try {
      const d = typeof ts === "string" ? new Date(ts) : new Date(ts * 1000);
      return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
    } catch { return ""; }
  };

  return (
    <div className="space-y-8 fade-in">
      {/* Header */}
      <div>
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("news.kicker")}</div>
        <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mt-2">{t("news.title")}</h1>
        <p className="text-zinc-500 mt-2">{t("news.subtitle")}</p>
      </div>

      {/* Search bar */}
      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-4">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === "Enter") doSearch(); }}
            placeholder={t("news.search_placeholder") || "AAPL, BTC, TSLA..."}
            className="bg-zinc-900/50 border-zinc-800 flex-1 font-mono"
          />
          <Button
            onClick={() => doSearch()}
            disabled={srchLoading || !query.trim()}
            className="bg-zinc-100 text-zinc-950 hover:bg-white shrink-0"
          >
            <Search className="w-4 h-4 mr-1.5" />
            {t("news.search_btn") || "Search"}
          </Button>
          {results !== null && (
            <Button
              variant="ghost"
              onClick={() => { setResults(null); setQuery(""); }}
              className="text-zinc-500 hover:text-zinc-300 shrink-0"
            >
              {t("common.back") || "Back"}
            </Button>
          )}
        </div>
        {results !== null && (
          <div className="mt-2 text-xs font-mono text-zinc-600">
            {srchLoading
              ? t("common.loading")
              : `${results.length} ${t("news.results_for") || "results for"} ${query}`}
          </div>
        )}
      </div>

      {/* Search results overlay */}
      {results !== null && (
        <section className="space-y-3">
          {srchLoading
            ? <SkeletonList n={5} />
            : results.length === 0
              ? <EmptyState label={`${t("news.no_results")} "${query}"`} />
              : results.map((n, i) => <NewsCard key={n.id || i} n={n} formatDate={formatDate} />)
          }
        </section>
      )}

      {/* Auto-loaded feeds — hidden when showing search results */}
      {results === null && (
        <>
          {/* Portfolio news */}
          <FeedSection
            icon={<Briefcase className="w-4 h-4 text-emerald-400" />}
            title={t("news.wallet_news") || "Portfolio News"}
            subtitle={t("news.wallet_news_hint") || "Latest 5 about your holdings"}
            accent="emerald"
            items={portfolioNews}
            loading={feedLoading}
            formatDate={formatDate}
            showSymbol
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Crypto news */}
            <FeedSection
              icon={<Bitcoin className="w-4 h-4 text-amber-400" />}
              title={t("news.crypto_news") || "Crypto News"}
              subtitle={t("news.crypto_news_hint") || "Latest 7 on top cryptos"}
              accent="amber"
              items={cryptoNews}
              loading={feedLoading}
              formatDate={formatDate}
            />

            {/* Stocks news */}
            <FeedSection
              icon={<TrendingUp className="w-4 h-4 text-blue-400" />}
              title={t("news.stocks_news") || "Stock News"}
              subtitle={t("news.stocks_news_hint") || "Latest 7 on large caps"}
              accent="blue"
              items={stocksNews}
              loading={feedLoading}
              formatDate={formatDate}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FeedSection({ icon, title, subtitle, items, loading, formatDate, showSymbol }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <div className="text-sm font-medium text-zinc-200">{title}</div>
        <div className="text-[10px] font-mono text-zinc-600 ml-1">{subtitle}</div>
      </div>
      {loading
        ? <SkeletonList n={3} compact />
        : items.length === 0
          ? <EmptyState />
          : <div className="space-y-2">
              {items.map((n, i) => <NewsCard key={n.id || i} n={n} formatDate={formatDate} compact showSymbol={showSymbol} />)}
            </div>
      }
    </section>
  );
}

function NewsCard({ n, formatDate, compact, showSymbol }) {
  const imgSize = compact ? "w-14 h-14" : "w-20 h-20 sm:w-24 sm:h-24";
  return (
    <a
      href={n.link}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-zinc-900/40 border border-zinc-800/50 hover:border-zinc-700/60 transition-colors rounded-xl p-3 sm:p-4 flex gap-3 items-start group"
    >
      {n.thumbnail ? (
        <img
          src={n.thumbnail}
          alt=""
          className={`${imgSize} object-cover rounded-md border border-zinc-800 shrink-0`}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className={`${imgSize} bg-zinc-800/40 border border-zinc-800 rounded-md flex items-center justify-center shrink-0`}>
          <Newspaper className="w-4 h-4 text-zinc-600" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className={`text-zinc-100 font-medium group-hover:text-white leading-snug ${compact ? "text-sm line-clamp-2" : ""}`}>
          {n.title}
          <ExternalLink className="inline w-3 h-3 ml-1.5 text-zinc-600 group-hover:text-zinc-400" />
        </div>
        {!compact && n.summary && (
          <div className="text-sm text-zinc-400 mt-1.5 line-clamp-2">{n.summary}</div>
        )}
        <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono text-zinc-500">
          {showSymbol && n.symbol && (
            <span className="text-zinc-300 border border-zinc-800 rounded px-1.5 py-0.5">{n.symbol}</span>
          )}
          <span className="text-zinc-500">{n.publisher}</span>
          {n.ts && <span>· {formatDate(n.ts)}</span>}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-700 group-hover:text-zinc-500 shrink-0 mt-0.5 transition-colors" />
    </a>
  );
}

function SkeletonList({ n = 3, compact }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-3 flex gap-3 animate-pulse">
          <div className={`${compact ? "w-14 h-14" : "w-20 h-20"} bg-zinc-800 rounded-md shrink-0`} />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-3 bg-zinc-800 rounded w-3/4" />
            <div className="h-3 bg-zinc-800 rounded w-1/2" />
            <div className="h-2 bg-zinc-800/60 rounded w-1/4 mt-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ label }) {
  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-8 text-center">
      <Newspaper className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
      <div className="text-zinc-500 text-sm">{label || "No news available"}</div>
    </div>
  );
}

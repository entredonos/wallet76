import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  TrendingUp, TrendingDown, Newspaper, ExternalLink, ArrowUpRight, ArrowDownRight, Activity,
} from "lucide-react";
import AssetIcon from "../components/AssetIcon";
import { fmtCurrency, fmtPct, fmtCompact } from "../lib/format";
import { useI18n } from "../context/I18nContext";

export default function Market() {
  const { t } = useI18n();
  const [crypto, setCrypto] = useState({ gainers: [], losers: [] });
  const [stocks, setStocks] = useState({ gainers: [], losers: [] });
  const [latestNews, setLatestNews] = useState({ crypto: [], stocks: [] });
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [c, s, ln, n] = await Promise.all([
          api.get("/market/movers/crypto"),
          api.get("/market/movers/stocks"),
          api.get("/market/latest-news"),
          api.get("/market/portfolio-news"),
        ]);
        setCrypto(c.data || { gainers: [], losers: [] });
        setStocks(s.data || { gainers: [], losers: [] });
        setLatestNews(ln.data || { crypto: [], stocks: [] });
        setNews(n.data || []);
      } catch (e) { /* noop */ }
      setLoading(false);
    })();
  }, []);

  const formatDate = (ts) => {
    if (!ts) return "";
    try {
      const d = typeof ts === "string" ? new Date(ts) : new Date(ts * 1000);
      return d.toLocaleString();
    } catch { return ""; }
  };

  return (
    <div className="space-y-8 fade-in">
      <div>
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("market.kicker")}</div>
        <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mt-2">{t("market.title")}</h1>
        <p className="text-zinc-500 mt-2">{t("market.subtitle")}</p>
      </div>

      {loading && <div className="text-zinc-500 font-mono text-sm">{t("common.loading")}</div>}

      {/* Crypto movers */}
      <section className="space-y-4" data-testid="market-crypto-section">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-amber-400"/>
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-amber-400">{t("market.crypto_24h")}</div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MoversList kind="crypto" type="gainers" items={crypto.gainers} t={t}/>
          <MoversList kind="crypto" type="losers" items={crypto.losers} t={t}/>
        </div>
      </section>

      {/* Stocks movers */}
      <section className="space-y-4" data-testid="market-stocks-section">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400"/>
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-blue-400">{t("market.stocks_day")}</div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MoversList kind="stock" type="gainers" items={stocks.gainers} t={t}/>
          <MoversList kind="stock" type="losers" items={stocks.losers} t={t}/>
        </div>
      </section>

      {/* Latest crypto + stock news */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="market-latest-news">
        <NewsColumn
          title={t("market.crypto_news")}
          subtitle={t("market.crypto_news_hint")}
          items={latestNews.crypto}
          accent="amber"
          formatDate={formatDate}
          empty={t("news.no_results")}
          kind="crypto"
        />
        <NewsColumn
          title={t("market.stocks_news")}
          subtitle={t("market.stocks_news_hint")}
          items={latestNews.stocks}
          accent="blue"
          formatDate={formatDate}
          empty={t("news.no_results")}
          kind="stocks"
        />
      </section>

      {/* Portfolio news */}
      <section className="space-y-3" data-testid="market-portfolio-news">
        <div className="flex items-baseline gap-3">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("market.portfolio_news")}</div>
          <div className="text-[10px] font-mono text-zinc-600">{t("market.portfolio_news_hint")}</div>
        </div>
        {!loading && news.length === 0 && (
          <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-8 text-center" data-testid="market-no-news">
            <Newspaper className="w-8 h-8 text-zinc-700 mx-auto mb-2"/>
            <div className="text-zinc-400 text-sm">{t("news.no_results")}</div>
          </div>
        )}
        <div className="space-y-3">
          {news.map((n, i) => (
            <a
              key={n.id || i}
              href={n.link}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-zinc-900/40 border border-zinc-800/50 hover:border-zinc-700/60 transition-colors rounded-xl p-4 sm:p-5 flex gap-4 items-start group"
              data-testid={`portfolio-news-${i}`}
            >
              {n.thumbnail ? (
                <img src={n.thumbnail} alt="" className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-md border border-zinc-800 shrink-0" referrerPolicy="no-referrer"/>
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-zinc-800/40 border border-zinc-800 rounded-md flex items-center justify-center shrink-0">
                  <Newspaper className="w-5 h-5 text-zinc-600"/>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-zinc-100 font-medium group-hover:text-white leading-snug">
                  {n.title}
                  <ExternalLink className="inline w-3 h-3 ml-1.5 text-zinc-500"/>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs font-mono text-zinc-500">
                  {n.symbol && <span className="text-zinc-300 border border-zinc-800 rounded px-1.5 py-0.5">{n.symbol}</span>}
                  <span className="text-zinc-400">{n.publisher}</span>
                  {n.ts && <span>· {formatDate(n.ts)}</span>}
                </div>
              </div>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

function NewsColumn({ title, subtitle, items, accent = "blue", formatDate, empty, kind }) {
  const accentMap = {
    amber: "text-amber-400",
    blue: "text-blue-400",
  };
  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl overflow-hidden" data-testid={`news-col-${kind}`}>
      <div className="px-5 py-3 border-b border-zinc-800/50 flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <Newspaper className={`w-4 h-4 ${accentMap[accent]}`}/>
          <div className="text-sm font-medium text-zinc-200">{title}</div>
        </div>
        <div className="text-[10px] font-mono text-zinc-600 truncate">{subtitle}</div>
      </div>
      {items.length === 0 ? (
        <div className="px-5 py-8 text-center text-zinc-600 text-sm font-mono">{empty}</div>
      ) : (
        <div className="divide-y divide-zinc-800/30">
          {items.map((n, i) => (
            <a
              key={n.id || i}
              href={n.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-3 px-5 py-3 hover:bg-zinc-900/60 transition-colors items-start group"
              data-testid={`latest-news-${kind}-${i}`}
            >
              {n.thumbnail ? (
                <img src={n.thumbnail} alt="" className="w-14 h-14 object-cover rounded-md border border-zinc-800 shrink-0" referrerPolicy="no-referrer"/>
              ) : (
                <div className="w-14 h-14 bg-zinc-800/40 border border-zinc-800 rounded-md flex items-center justify-center shrink-0">
                  <Newspaper className="w-4 h-4 text-zinc-600"/>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-zinc-100 text-sm font-medium group-hover:text-white leading-snug line-clamp-2">
                  {n.title}
                  <ExternalLink className="inline w-3 h-3 ml-1.5 text-zinc-500"/>
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono text-zinc-500">
                  {n.symbol && <span className="text-zinc-300 border border-zinc-800 rounded px-1.5 py-0.5">{n.symbol}</span>}
                  <span>{n.publisher}</span>
                  {n.ts && <span>· {formatDate(n.ts)}</span>}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function MoversList({ kind, type, items, t }) {
  const isGain = type === "gainers";
  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl overflow-hidden" data-testid={`movers-${kind}-${type}`}>
      <div className="px-5 py-3 border-b border-zinc-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isGain ? <TrendingUp className="w-4 h-4 text-emerald-400"/> : <TrendingDown className="w-4 h-4 text-rose-400"/>}
          <div className="text-sm font-medium text-zinc-200">{isGain ? t("market.gainers") : t("market.losers")}</div>
        </div>
        <div className="text-[10px] font-mono text-zinc-500">{items.length}</div>
      </div>
      {items.length === 0 ? (
        <div className="px-5 py-8 text-center text-zinc-600 text-sm font-mono">—</div>
      ) : (
        <div className="divide-y divide-zinc-800/30">
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
                  <div className="text-xs text-zinc-500 truncate">{it.name}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-zinc-100 text-sm">{it.price_usd ? fmtCurrency(it.price_usd, "USD") : "—"}</div>
                  {it.market_cap_usd && (
                    <div className="text-[10px] font-mono text-zinc-500">MC {fmtCompact(it.market_cap_usd, "USD")}</div>
                  )}
                </div>
                <div className={`text-right min-w-[64px] ${pos ? "text-emerald-400" : "text-rose-400"} font-mono text-sm`}>
                  <span className="inline-flex items-center gap-1">
                    {pos ? <ArrowUpRight className="w-3 h-3"/> : <ArrowDownRight className="w-3 h-3"/>}
                    {fmtPct(it.change_24h || 0)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

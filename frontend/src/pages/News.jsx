import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Newspaper, ExternalLink, Search } from "lucide-react";
import { useI18n } from "../context/I18nContext";

export default function News() {
  const { t } = useI18n();
  const [query, setQuery] = useState("BTC");
  const [type, setType] = useState("crypto");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchNews = async (q = query, ty = type) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.get("/news", { params: { symbol: q.trim().toUpperCase(), asset_type: ty } });
      setItems(data || []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchNews(); /* eslint-disable-next-line */ }, []);

  const formatDate = (ts) => {
    if (!ts) return "";
    try {
      const d = typeof ts === "string" ? new Date(ts) : new Date(ts * 1000);
      return d.toLocaleString();
    } catch { return ""; }
  };

  return (
    <div className="space-y-6 fade-in">
      <div>
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("news.kicker")}</div>
        <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mt-2">{t("news.title")}</h1>
        <p className="text-zinc-500 mt-2">{t("news.subtitle")}</p>
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={type} onValueChange={(v) => {
            setType(v);
            // Reset query to a sensible default when switching tab to avoid mixing assets
            const def = v === "crypto" ? "BTC" : "AAPL";
            setQuery(def);
            fetchNews(def, v);
          }}>
            <TabsList className="bg-zinc-900/50 border border-zinc-800">
              <TabsTrigger value="crypto" className="data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950" data-testid="news-tab-crypto">{t("news.crypto_tab")}</TabsTrigger>
              <TabsTrigger value="stock" className="data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950" data-testid="news-tab-stock">{t("news.stocks_tab")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-1 min-w-[260px] gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") fetchNews(); }}
              placeholder={t("news.search_placeholder")}
              className="bg-zinc-900/50 border-zinc-800 flex-1"
              data-testid="news-search-input"
            />
            <Button onClick={() => fetchNews()} className="bg-zinc-100 text-zinc-950 hover:bg-white" data-testid="news-search-btn">
              <Search className="w-4 h-4 mr-1"/> {t("news.search_btn")}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3" data-testid="news-list">
        {loading && <div className="text-zinc-500 font-mono text-sm">{t("common.loading")}</div>}
        {!loading && items.length === 0 && (
          <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-12 text-center" data-testid="no-news">
            <Newspaper className="w-10 h-10 text-zinc-700 mx-auto mb-3"/>
            <div className="text-zinc-400">{t("news.no_results")} · "{query}"</div>
            <div className="text-zinc-600 text-sm mt-1">Try BTC, ETH, AAPL, TSLA, MSFT...</div>
          </div>
        )}
        {items.map((n, i) => (
          <a
            key={n.id || i}
            href={n.link}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-zinc-900/40 border border-zinc-800/50 hover:border-zinc-700/60 transition-colors rounded-xl p-4 sm:p-5 flex gap-4 items-start group"
            data-testid={`news-item-${i}`}
          >
            {n.thumbnail ? (
              <img src={n.thumbnail} alt="" className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-md border border-zinc-800 shrink-0" referrerPolicy="no-referrer"/>
            ) : (
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-zinc-800/40 border border-zinc-800 rounded-md flex items-center justify-center shrink-0">
                <Newspaper className="w-6 h-6 text-zinc-600"/>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-zinc-100 font-medium group-hover:text-white leading-snug">
                {n.title}
                <ExternalLink className="inline w-3 h-3 ml-1.5 text-zinc-500"/>
              </div>
              {n.summary && <div className="text-sm text-zinc-400 mt-2 line-clamp-2">{n.summary}</div>}
              <div className="flex items-center gap-3 mt-3 text-xs font-mono text-zinc-500">
                <span className="text-zinc-400">{n.publisher}</span>
                {n.ts && <span>· {formatDate(n.ts)}</span>}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

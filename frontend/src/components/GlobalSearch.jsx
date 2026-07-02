import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../context/I18nContext";
import AssetIcon from "./AssetIcon";

const TYPE_BADGE = {
  stock:  { label: "Stock",  cls: "bg-blue-500/20 text-blue-300" },
  etf:    { label: "ETF",    cls: "bg-indigo-500/20 text-indigo-300" },
  fund:   { label: "Fund",   cls: "bg-purple-500/20 text-purple-300" },
  crypto: { label: "Crypto", cls: "bg-amber-500/20 text-amber-300" },
};

export default function GlobalSearch({ open, onClose }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const { data } = await api.get(`/search?q=${encodeURIComponent(q)}`);
      setResults(data || []);
      setSelected(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length < 1) { setResults([]); return; }
    debounceRef.current = setTimeout(() => doSearch(query), 280);
    return () => clearTimeout(debounceRef.current);
  }, [query, doSearch]);

  const handleKey = (e) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && results[selected]) { goTo(results[selected]); }
  };

  const goTo = (item) => {
    onClose();
    nav(`/asset/${item.symbol}`);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative w-full max-w-xl bg-zinc-900 border border-zinc-700/60 rounded-2xl shadow-2xl overflow-hidden">

        {/* Search input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <Search className={`w-5 h-5 shrink-0 ${loading ? "text-blue-400 animate-pulse" : "text-zinc-500"}`} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder={t("search.placeholder") || "Search stocks, ETFs, crypto..."}
            className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-600 text-sm font-mono outline-none"
          />
          {query && (
            <button
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              className="text-zinc-600 hover:text-zinc-400 transition-colors"
              title="Clear"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {/* Close button -- always visible */}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-600 hover:text-zinc-300 border border-zinc-700 hover:border-zinc-500 rounded-md px-2 py-1 transition-colors shrink-0"
          >
            <X className="w-3 h-3" />
            <span>{t("common.back") || "Close"}</span>
          </button>
        </div>

        {/* Results list */}
        {results.length > 0 && (
          <ul className="max-h-80 overflow-y-auto py-2">
            {results.map((item, i) => {
              const badge = TYPE_BADGE[item.asset_type] || TYPE_BADGE.stock;
              return (
                <li key={item.symbol}>
                  <button
                    onClick={() => goTo(item)}
                    onMouseEnter={() => setSelected(i)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      i === selected ? "bg-zinc-800/70" : "hover:bg-zinc-800/40"
                    }`}
                  >
                    <AssetIcon asset={item} size={32} rounded="rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-bold text-zinc-100">{item.symbol}</span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 truncate">{item.name}</div>
                    </div>
                    <div className="text-xs text-zinc-600 shrink-0">{item.exchange}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* No results */}
        {query.length >= 1 && !loading && results.length === 0 && (
          <div className="px-4 py-8 text-center text-zinc-600 text-sm font-mono">
            {t("search.no_results") || "No results found"}
          </div>
        )}

        {/* Empty hint */}
        {!query && (
          <div className="px-4 py-6 text-center text-zinc-700 text-xs font-mono">
            {t("search.hint") || "Type a symbol or name: AAPL, Bitcoin, QQQ..."}
          </div>
        )}
      </div>
    </div>
  );
}

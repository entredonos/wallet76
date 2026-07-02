import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus, ExternalLink } from "lucide-react";
import AssetIcon from "../components/AssetIcon";

const API_BASE = process.env.REACT_APP_API_URL || "https://wallet76-1cvt.onrender.com/api";

function fmt(n, currency = "USD") {
  if (n === null || n === undefined) return "—";
  const sym = currency === "EUR" ? "€" : "$";
  return `${sym}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(n) {
  if (n === null || n === undefined) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function ChangeChip({ value }) {
  if (value === null || value === undefined) return <span className="text-zinc-500">—</span>;
  if (value > 0) return <span className="text-emerald-400 flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />{pct(value)}</span>;
  if (value < 0) return <span className="text-red-400 flex items-center gap-0.5"><TrendingDown className="w-3 h-3" />{pct(value)}</span>;
  return <span className="text-zinc-500 flex items-center gap-0.5"><Minus className="w-3 h-3" />0.00%</span>;
}

export default function PublicPortfolio() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/p/${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "not_found" : "error");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-sm font-mono animate-pulse">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 text-center px-6">
        <div className="text-4xl">🔒</div>
        <div className="text-zinc-200 text-xl font-light">Portfolio not found</div>
        <p className="text-zinc-500 text-sm max-w-xs">
          This link may have been revoked or doesn't exist.
        </p>
        <Link to="/" className="text-zinc-400 hover:text-white text-sm underline underline-offset-4">
          Go to Wallet76
        </Link>
      </div>
    );
  }

  const { display_name, hide_values, assets = [], summary = {} } = data;
  const hasValues = !hide_values;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-display text-lg font-light tracking-tight text-zinc-50">Wallet76</span>
          <span className="text-zinc-700">·</span>
          <span className="text-zinc-400 text-sm">{display_name}'s Portfolio</span>
        </div>
        <Link
          to="/register"
          className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <ExternalLink className="w-3 h-3" /> Track yours
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">Portfolio Value</div>
            <div className="text-xl font-semibold text-zinc-50">
              {hasValues ? fmt(summary.total_usd) : <span className="text-zinc-600">Hidden</span>}
            </div>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">Total P&amp;L</div>
            <div className={`text-xl font-semibold ${hasValues && summary.total_pnl_usd >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {hasValues ? fmt(summary.total_pnl_usd) : <span className="text-zinc-600">Hidden</span>}
            </div>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">Return</div>
            <div className={`text-xl font-semibold ${summary.total_pnl_pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {pct(summary.total_pnl_pct)}
            </div>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">Assets</div>
            <div className="text-xl font-semibold text-zinc-50">{summary.asset_count ?? assets.length}</div>
          </div>
        </div>

        {/* Assets table */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <span className="text-sm font-medium text-zinc-300">Holdings</span>
          </div>
          {assets.length === 0 ? (
            <div className="px-6 py-12 text-center text-zinc-600 text-sm">No assets to display.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-mono uppercase tracking-widest text-zinc-600 border-b border-zinc-800">
                  <th className="text-left px-4 py-3">Asset</th>
                  <th className="text-right px-4 py-3">Price</th>
                  <th className="text-right px-4 py-3">24h</th>
                  <th className="text-right px-4 py-3">P&amp;L %</th>
                  {hasValues && <th className="text-right px-4 py-3">Value</th>}
                  <th className="text-right px-4 py-3">Weight</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.symbol} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <AssetIcon symbol={a.symbol} assetType={a.asset_type} size={28} />
                        <div>
                          <div className="font-medium text-zinc-100">{a.symbol}</div>
                          <div className="text-xs text-zinc-500">{a.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-200">{fmt(a.price_usd)}</td>
                    <td className="px-4 py-3 text-right"><ChangeChip value={a.change_24h} /></td>
                    <td className="px-4 py-3 text-right"><ChangeChip value={a.pnl_pct} /></td>
                    {hasValues && (
                      <td className="px-4 py-3 text-right text-zinc-200">{fmt(a.value_usd)}</td>
                    )}
                    <td className="px-4 py-3 text-right text-zinc-400">{a.weight_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-zinc-600 pb-4">
          <span>Prices updated ~1 min ago · Read-only view</span>
          <Link to="/register" className="text-zinc-400 hover:text-white transition-colors">
            Create your own portfolio →
          </Link>
        </div>
      </main>
    </div>
  );
}

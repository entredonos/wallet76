import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Activity,
} from "lucide-react";
import AssetIcon from "../components/AssetIcon";
import { fmtCurrency, fmtPct, fmtCompact } from "../lib/format";
import { useI18n } from "../context/I18nContext";

export default function Market() {
  const { t } = useI18n();
  const [crypto, setCrypto] = useState({ gainers: [], losers: [] });
  const [stocks, setStocks] = useState({ gainers: [], losers: [] });
  const [loading, setLoading] = useState(true);

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
  }, []);

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
        <div className="px-5 py-8 text-center text-zinc-600 text-sm font-mono">-</div>
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
                  <div className="font-mono text-zinc-100 text-sm">{it.price_usd ? fmtCurrency(it.price_usd, "USD") : "-"}</div>
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

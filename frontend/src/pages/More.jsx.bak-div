import React from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../context/I18nContext";
import { Receipt, Eye, BarChart2, Newspaper, Link2, Settings, ChevronRight } from "lucide-react";

// "Mais" — 6º separador da bottom nav mobile (8 jul 2026). Antes disto, as
// únicas formas de chegar a Transações/Watchlist/Análise/Notícias/Contas
// Ligadas/Definições no telemóvel eram (a) o menu hambúrguer, que reutiliza
// a sidebar inteira do desktop dentro de uma gaveta — 3 níveis de
// profundidade para algumas (hambúrguer > grupo "Portfólio" > item) — ou
// (b) não existiam de todo fora dele. Esta página dá-lhes um destino direto
// e plano, ao nível do resto da bottom nav, sem reaproveitar a UI de
// desktop. Ver Layout.jsx: o hambúrguer/gaveta mobile foi removido a favor
// deste separador.
const ITEMS = [
  { to: "/transactions", icon: Receipt, labelKey: "nav.transactions", color: "text-blue-400" },
  { to: "/watchlist", icon: Eye, labelKey: "nav.watchlist", color: "text-violet-400" },
  { to: "/analytics", icon: BarChart2, labelKey: "nav.analytics", color: "text-emerald-400" },
  { to: "/news", icon: Newspaper, labelKey: "nav.news", color: "text-amber-400" },
  { to: "/connected-accounts", icon: Link2, labelKey: "nav.brokers", color: "text-cyan-400" },
  { to: "/settings", icon: Settings, labelKey: "nav.settings", color: "text-zinc-400" },
];

export default function More() {
  const { t } = useI18n();
  return (
    <div className="space-y-6 fade-in max-w-2xl" data-testid="more-page">
      <div>
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("more.kicker")}</div>
        <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mt-2">{t("more.title")}</h1>
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl divide-y divide-zinc-800/50 overflow-hidden">
        {ITEMS.map(({ to, icon: Icon, labelKey, color }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-zinc-900/70 transition-colors"
            data-testid={`more-link-${to.replace(/[^a-z]/gi, "")}`}
          >
            <div className="flex items-center gap-3">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-sm font-medium text-zinc-200">{t(labelKey)}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}

import React from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../context/I18nContext";
import { Receipt, BarChart2, Coins, Link2, User, Settings, ChevronRight, GraduationCap, LifeBuoy } from "lucide-react";

// "Mais" — 6º separador da bottom nav mobile (8 jul 2026). Antes disto, as
// únicas formas de chegar a Transações/Watchlist/Análise/Notícias/Contas
// Ligadas/Definições no telemóvel eram (a) o menu hambúrguer, que reutiliza
// a sidebar inteira do desktop dentro de uma gaveta — 3 níveis de
// profundidade para algumas (hambúrguer > grupo "Portfólio" > item) — ou
// (b) não existiam de todo fora dele. Esta página dá-lhes um destino direto
// e plano, ao nível do resto da bottom nav, sem reaproveitar a UI de
// desktop. Ver Layout.jsx: o hambúrguer/gaveta mobile foi removido a favor
// deste separador.
// Aprender e Ajudas (2 ago 2026): paginas publicas uteis dentro da app — no
// telemovel so eram alcancaveis por URL, porque o link vivia na sidebar de
// desktop. Labels locais ×6 (padrao NAV_LEARN do Layout.jsx): nao ha chave
// nav.* para elas no I18nContext.
const L_LEARN = { pt: "Aprender", en: "Learn", fr: "Apprendre", de: "Lernen", it: "Impara", es: "Aprender" };
const L_HELP = { pt: "Ajudas", en: "Help", fr: "Aide", de: "Hilfe", it: "Aiuto", es: "Ayuda" };

const ITEMS = [
  { to: "/transactions", icon: Receipt, labelKey: "nav.transactions", color: "text-blue-400" },
  { to: "/analytics", icon: BarChart2, labelKey: "nav.analytics", color: "text-emerald-400" },
  { to: "/dividends", icon: Coins, labelKey: "nav.dividends", color: "text-emerald-400" },
  { to: "/connected-accounts", icon: Link2, labelKey: "nav.brokers", color: "text-cyan-400" },
  { to: "/aprender", icon: GraduationCap, label: L_LEARN, color: "text-amber-300" },
  { to: "/ajudas", icon: LifeBuoy, label: L_HELP, color: "text-blue-300" },
  { to: "/profile", icon: User, labelKey: "nav.profile", color: "text-zinc-300" },
  { to: "/settings", icon: Settings, labelKey: "nav.settings", color: "text-zinc-400" },
];

export default function More() {
  const { t, lang } = useI18n();
  return (
    <div className="space-y-6 fade-in max-w-2xl" data-testid="more-page">
      <div>
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("more.kicker")}</div>
        <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mt-2">{t("more.title")}</h1>
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl divide-y divide-zinc-800/50 overflow-hidden">
        {ITEMS.map(({ to, icon: Icon, labelKey, label, color }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-zinc-900/70 transition-colors"
            data-testid={`more-link-${to.replace(/[^a-z]/gi, "")}`}
          >
            <div className="flex items-center gap-3">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-sm font-medium text-zinc-200">{label ? (label[lang] || label.en) : t(labelKey)}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus, ExternalLink } from "lucide-react";
import AssetIcon from "../components/AssetIcon";
import { useI18n } from "../context/I18nContext";

// 28 jul 2026: esta pagina tinha o seu proprio URL base, lido de
// process.env.REACT_APP_API_URL — variavel que NAO existe em lado nenhum do
// projeto (a correta e REACT_APP_BACKEND_URL). Resultado: caia sempre no
// fallback, um URL antigo do Render (wallet76-1cvt) que ja nao e o servico
// atual, e a carteira partilhada nunca carregava em producao. Passa a usar o
// mesmo `API` que o resto da app (lib/api.js), que em producao e o caminho
// relativo "/api" servido pelo rewrite same-origin do Vercel.
import { API } from "../lib/api";

// 3 ago 2026 — era a última página da app só em inglês (hardcoded). Como é
// pública e quem a vê nem sequer tem conta, segue o padrão das páginas
// públicas (Pricing/Aprender): COPY local ×6 + a língua do I18nProvider,
// que para um visitante anónimo é a do browser dele — um alemão que recebe
// um link por WhatsApp vê a página em alemão, não em inglês.
const COPY = {
  en: {
    loading: "Loading…",
    nf_title: "Portfolio not found",
    nf_body: "This link may have been revoked or doesn't exist.",
    nf_cta: "Go to Wallet76",
    owner: (n) => `${n}'s Portfolio`,
    track: "Track yours",
    value: "Portfolio Value",
    pnl: "Total P&L",
    ret: "Return",
    assets: "Assets",
    holdings: "Holdings",
    no_assets: "No assets to display.",
    th_asset: "Asset", th_price: "Price", th_24h: "24h",
    th_pnl: "P&L %", th_value: "Value", th_weight: "Weight",
    hidden: "Hidden",
    footer: "Prices updated ~1 min ago · Read-only view",
    footer_cta: "Create your own portfolio →",
    locale: "en-US",
  },
  pt: {
    loading: "A carregar…",
    nf_title: "Carteira não encontrada",
    nf_body: "Este link pode ter sido revogado ou não existe.",
    nf_cta: "Ir para a Wallet76",
    owner: (n) => `Carteira de ${n}`,
    track: "Segue a tua",
    value: "Valor da carteira",
    pnl: "P&L total",
    ret: "Retorno",
    assets: "Ativos",
    holdings: "Posições",
    no_assets: "Sem ativos para mostrar.",
    th_asset: "Ativo", th_price: "Preço", th_24h: "24h",
    th_pnl: "P&L %", th_value: "Valor", th_weight: "Peso",
    hidden: "Oculto",
    footer: "Preços atualizados há ~1 min · Vista só de leitura",
    footer_cta: "Cria a tua própria carteira →",
    locale: "pt-PT",
  },
  fr: {
    loading: "Chargement…",
    nf_title: "Portefeuille introuvable",
    nf_body: "Ce lien a peut-être été révoqué ou n'existe pas.",
    nf_cta: "Aller sur Wallet76",
    owner: (n) => `Portefeuille de ${n}`,
    track: "Suivez le vôtre",
    value: "Valeur du portefeuille",
    pnl: "P&L total",
    ret: "Rendement",
    assets: "Actifs",
    holdings: "Positions",
    no_assets: "Aucun actif à afficher.",
    th_asset: "Actif", th_price: "Prix", th_24h: "24 h",
    th_pnl: "P&L %", th_value: "Valeur", th_weight: "Poids",
    hidden: "Masqué",
    footer: "Prix mis à jour il y a ~1 min · Lecture seule",
    footer_cta: "Créez votre propre portefeuille →",
    locale: "fr-FR",
  },
  de: {
    loading: "Wird geladen…",
    nf_title: "Portfolio nicht gefunden",
    nf_body: "Dieser Link wurde möglicherweise widerrufen oder existiert nicht.",
    nf_cta: "Zu Wallet76",
    owner: (n) => `Portfolio von ${n}`,
    track: "Eigenes verfolgen",
    value: "Portfoliowert",
    pnl: "Gesamt-P&L",
    ret: "Rendite",
    assets: "Assets",
    holdings: "Positionen",
    no_assets: "Keine Assets anzuzeigen.",
    th_asset: "Asset", th_price: "Kurs", th_24h: "24 h",
    th_pnl: "P&L %", th_value: "Wert", th_weight: "Gewicht",
    hidden: "Verborgen",
    footer: "Kurse vor ~1 Min. aktualisiert · Nur Lesezugriff",
    footer_cta: "Eigenes Portfolio erstellen →",
    locale: "de-DE",
  },
  it: {
    loading: "Caricamento…",
    nf_title: "Portafoglio non trovato",
    nf_body: "Questo link potrebbe essere stato revocato o non esiste.",
    nf_cta: "Vai su Wallet76",
    owner: (n) => `Portafoglio di ${n}`,
    track: "Traccia il tuo",
    value: "Valore del portafoglio",
    pnl: "P&L totale",
    ret: "Rendimento",
    assets: "Asset",
    holdings: "Posizioni",
    no_assets: "Nessun asset da mostrare.",
    th_asset: "Asset", th_price: "Prezzo", th_24h: "24h",
    th_pnl: "P&L %", th_value: "Valore", th_weight: "Peso",
    hidden: "Nascosto",
    footer: "Prezzi aggiornati ~1 min fa · Sola lettura",
    footer_cta: "Crea il tuo portafoglio →",
    locale: "it-IT",
  },
  es: {
    loading: "Cargando…",
    nf_title: "Cartera no encontrada",
    nf_body: "Este enlace puede haber sido revocado o no existe.",
    nf_cta: "Ir a Wallet76",
    owner: (n) => `Cartera de ${n}`,
    track: "Sigue la tuya",
    value: "Valor de la cartera",
    pnl: "P&L total",
    ret: "Rentabilidad",
    assets: "Activos",
    holdings: "Posiciones",
    no_assets: "Sin activos que mostrar.",
    th_asset: "Activo", th_price: "Precio", th_24h: "24 h",
    th_pnl: "P&L %", th_value: "Valor", th_weight: "Peso",
    hidden: "Oculto",
    footer: "Precios actualizados hace ~1 min · Solo lectura",
    footer_cta: "Crea tu propia cartera →",
    locale: "es-ES",
  },
};

// 3 ago 2026 — o fmt antigo fazia Math.abs(n) e nunca punha o sinal: um P&L
// de -$7.965,77 aparecia como "$7.965,77", lucro aos olhos de quem estava em
// perda (visto num link real; o "Return -18,88%" ao lado é que estava certo).
// O sinal agora vai no texto, e o locale segue a língua da página.
function fmt(n, locale, currency = "USD") {
  if (n === null || n === undefined) return "—";
  const sym = currency === "EUR" ? "€" : "$";
  const sign = n < 0 ? "-" : "";
  return `${sign}${sym}${Math.abs(n).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const { lang } = useI18n();
  const c = COPY[lang] || COPY.en;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/p/${slug}`)
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
        <div className="text-zinc-500 text-sm font-mono animate-pulse">{c.loading}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 text-center px-6">
        <div className="text-4xl">🔒</div>
        <div className="text-zinc-200 text-xl font-light">{c.nf_title}</div>
        <p className="text-zinc-500 text-sm max-w-xs">{c.nf_body}</p>
        <Link to="/" className="text-zinc-400 hover:text-white text-sm underline underline-offset-4">
          {c.nf_cta}
        </Link>
      </div>
    );
  }

  const { display_name, wallet_name, hide_values, assets = [], summary = {} } = data;
  const hasValues = !hide_values;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-display text-lg font-light tracking-tight text-zinc-50">Wallet76</span>
          <span className="text-zinc-700">·</span>
          <span className="text-zinc-400 text-sm">
            {c.owner(display_name)}
            {wallet_name ? <span className="text-zinc-500"> · {wallet_name}</span> : null}
          </span>
        </div>
        <Link
          to="/register"
          className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <ExternalLink className="w-3 h-3" /> {c.track}
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">{c.value}</div>
            <div className="text-xl font-semibold text-zinc-50">
              {hasValues ? fmt(summary.total_usd, c.locale) : <span className="text-zinc-600">{c.hidden}</span>}
            </div>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">{c.pnl}</div>
            <div className={`text-xl font-semibold ${hasValues && summary.total_pnl_usd >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {hasValues ? fmt(summary.total_pnl_usd, c.locale) : <span className="text-zinc-600">{c.hidden}</span>}
            </div>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">{c.ret}</div>
            <div className={`text-xl font-semibold ${summary.total_pnl_pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {pct(summary.total_pnl_pct)}
            </div>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">{c.assets}</div>
            <div className="text-xl font-semibold text-zinc-50">{summary.asset_count ?? assets.length}</div>
          </div>
        </div>

        {/* Assets table */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <span className="text-sm font-medium text-zinc-300">{c.holdings}</span>
          </div>
          {assets.length === 0 ? (
            <div className="px-6 py-12 text-center text-zinc-600 text-sm">{c.no_assets}</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-mono uppercase tracking-widest text-zinc-600 border-b border-zinc-800">
                  <th className="text-left px-4 py-3">{c.th_asset}</th>
                  <th className="text-right px-4 py-3">{c.th_price}</th>
                  <th className="text-right px-4 py-3">{c.th_24h}</th>
                  <th className="text-right px-4 py-3">{c.th_pnl}</th>
                  {hasValues && <th className="text-right px-4 py-3">{c.th_value}</th>}
                  <th className="text-right px-4 py-3">{c.th_weight}</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={`${a.asset_type}-${a.symbol}`} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <AssetIcon symbol={a.symbol} assetType={a.asset_type} size={28} />
                        <div>
                          <div className="font-medium text-zinc-100">{a.symbol}</div>
                          <div className="text-xs text-zinc-500">{a.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-200">{fmt(a.price_usd, c.locale)}</td>
                    <td className="px-4 py-3 text-right"><ChangeChip value={a.change_24h} /></td>
                    <td className="px-4 py-3 text-right"><ChangeChip value={a.pnl_pct} /></td>
                    {hasValues && (
                      <td className="px-4 py-3 text-right text-zinc-200">{fmt(a.value_usd, c.locale)}</td>
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
          <span>{c.footer}</span>
          <Link to="/register" className="text-zinc-400 hover:text-white transition-colors">
            {c.footer_cta}
          </Link>
        </div>
      </main>
    </div>
  );
}

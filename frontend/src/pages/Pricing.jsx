import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../context/I18nContext";
import { useAuth } from "../context/AuthContext";

const PRICES = {
  eur: { sym: "€",   pos: "suffix", monthly: "6,99",  yearly: "59,99"  },
  chf: { sym: "CHF", pos: "prefix", monthly: "6.90",  yearly: "59.00"  },
  usd: { sym: "$",   pos: "prefix", monthly: "7.99",  yearly: "69.99"  },
  brl: { sym: "R$",  pos: "prefix", monthly: "39,90", yearly: "399,00" },
};
const CURRENCIES = ["eur", "chf", "usd", "brl"];

function fmtPrice(cur, val) {
  const p = PRICES[cur];
  return p.pos === "prefix" ? `${p.sym} ${val}` : `${val} ${p.sym}`;
}

const COPY = {
  pt: {
    title: "Escolhe o teu plano", subtitle: "Começa grátis. Muda para Pro quando precisares de mais.",
    currency_label: "Moeda", monthly: "Mensal", yearly: "Anual", per_month: "/mês", per_year: "/ano",
    best_value: "2 meses grátis", free_name: "Grátis", pro_name: "Pro",
    free_cta: "Continuar grátis", pro_cta: "Começar teste de 30 dias",
    trial_note: "Teste Pro de 30 dias. Cartão necessário para ativar; sem cobrança se cancelares antes do fim do teste.",
    free_feats: ["1 carteira", "Até 15 posições", "3 alertas de preço", "Registo manual de transações", "Alertas por email"],
    pro_feats: ["Carteiras ilimitadas", "Posições ilimitadas", "Alertas ilimitados", "Sincronização automática com brokers", "Alertas por Telegram e push", "Análises avançadas", "Suporte prioritário"],
  },
  en: {
    title: "Choose your plan", subtitle: "Start free. Upgrade to Pro when you need more.",
    currency_label: "Currency", monthly: "Monthly", yearly: "Yearly", per_month: "/mo", per_year: "/yr",
    best_value: "2 months free", free_name: "Free", pro_name: "Pro",
    free_cta: "Continue for free", pro_cta: "Start 30-day trial",
    trial_note: "30-day Pro trial. Card required to activate; no charge if you cancel before the trial ends.",
    free_feats: ["1 portfolio", "Up to 15 holdings", "3 price alerts", "Manual transaction entry", "Email alerts"],
    pro_feats: ["Unlimited portfolios", "Unlimited holdings", "Unlimited alerts", "Automatic broker sync", "Telegram & push alerts", "Advanced analytics", "Priority support"],
  },
  fr: {
    title: "Choisissez votre formule", subtitle: "Commencez gratuitement. Passez à Pro quand vous en avez besoin.",
    currency_label: "Devise", monthly: "Mensuel", yearly: "Annuel", per_month: "/mois", per_year: "/an",
    best_value: "2 mois offerts", free_name: "Gratuit", pro_name: "Pro",
    free_cta: "Continuer gratuitement", pro_cta: "Démarrer l'essai de 30 jours",
    trial_note: "Essai Pro de 30 jours. Carte requise pour activer ; aucun débit si vous annulez avant la fin de l'essai.",
    free_feats: ["1 portefeuille", "Jusqu'à 15 positions", "3 alertes de prix", "Saisie manuelle des transactions", "Alertes par e-mail"],
    pro_feats: ["Portefeuilles illimités", "Positions illimitées", "Alertes illimitées", "Synchronisation automatique des courtiers", "Alertes Telegram et push", "Analyses avancées", "Support prioritaire"],
  },
  de: {
    title: "Wählen Sie Ihren Plan", subtitle: "Kostenlos starten. Auf Pro upgraden, wenn Sie mehr brauchen.",
    currency_label: "Währung", monthly: "Monatlich", yearly: "Jährlich", per_month: "/Mon.", per_year: "/Jahr",
    best_value: "2 Monate gratis", free_name: "Kostenlos", pro_name: "Pro",
    free_cta: "Kostenlos fortfahren", pro_cta: "30-Tage-Test starten",
    trial_note: "30-tägiger Pro-Test. Karte zur Aktivierung erforderlich; keine Belastung, wenn Sie vor Testende kündigen.",
    free_feats: ["1 Portfolio", "Bis zu 15 Positionen", "3 Preisalarme", "Manuelle Transaktionserfassung", "E-Mail-Alarme"],
    pro_feats: ["Unbegrenzte Portfolios", "Unbegrenzte Positionen", "Unbegrenzte Alarme", "Automatische Broker-Synchronisierung", "Telegram- und Push-Alarme", "Erweiterte Analysen", "Priorisierter Support"],
  },
  it: {
    title: "Scegli il tuo piano", subtitle: "Inizia gratis. Passa a Pro quando ti serve di più.",
    currency_label: "Valuta", monthly: "Mensile", yearly: "Annuale", per_month: "/mese", per_year: "/anno",
    best_value: "2 mesi gratis", free_name: "Gratis", pro_name: "Pro",
    free_cta: "Continua gratis", pro_cta: "Inizia la prova di 30 giorni",
    trial_note: "Prova Pro di 30 giorni. Carta richiesta per attivare; nessun addebito se annulli prima della fine della prova.",
    free_feats: ["1 portafoglio", "Fino a 15 posizioni", "3 avvisi di prezzo", "Inserimento manuale delle transazioni", "Avvisi via email"],
    pro_feats: ["Portafogli illimitati", "Posizioni illimitate", "Avvisi illimitati", "Sincronizzazione automatica dei broker", "Avvisi Telegram e push", "Analisi avanzate", "Supporto prioritario"],
  },
  es: {
    title: "Elige tu plan", subtitle: "Empieza gratis. Cambia a Pro cuando necesites más.",
    currency_label: "Moneda", monthly: "Mensual", yearly: "Anual", per_month: "/mes", per_year: "/año",
    best_value: "2 meses gratis", free_name: "Gratis", pro_name: "Pro",
    free_cta: "Continuar gratis", pro_cta: "Empezar prueba de 30 días",
    trial_note: "Prueba Pro de 30 días. Tarjeta necesaria para activar; sin cargo si cancelas antes de que termine la prueba.",
    free_feats: ["1 cartera", "Hasta 15 posiciones", "3 alertas de precio", "Registro manual de transacciones", "Alertas por correo"],
    pro_feats: ["Carteras ilimitadas", "Posiciones ilimitadas", "Alertas ilimitadas", "Sincronización automática con brokers", "Alertas por Telegram y push", "Análisis avanzados", "Soporte prioritario"],
  },
};

export default function Pricing() {
  const { lang } = useI18n();
  const { user } = useAuth();
  const c = COPY[lang] || COPY.en;

  const [cur, setCur] = useState("eur");
  const [period, setPeriod] = useState("yearly");

  async function choosePlan() {
    const res = await api.post(`/billing/create-checkout-session/${period}?currency=${cur}`);
    window.location.href = res.data.url;
  }

  const priceVal = PRICES[cur][period];
  const periodLabel = period === "yearly" ? c.per_year : c.per_month;

  return (
    <div className="min-h-screen bg-zinc-950 text-white px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-3">{c.title}</h1>
        <p className="text-center text-zinc-400 mb-8">{c.subtitle}</p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 mr-1">{c.currency_label}</span>
            <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-1">
              {CURRENCIES.map((k) => (
                <button key={k} onClick={() => setCur(k)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${cur === k ? "bg-white text-black font-semibold" : "text-zinc-400 hover:text-white"}`}>
                  {PRICES[k].sym}
                </button>
              ))}
            </div>
          </div>
          <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-1">
            <button onClick={() => setPeriod("monthly")}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${period === "monthly" ? "bg-white text-black font-semibold" : "text-zinc-400 hover:text-white"}`}>
              {c.monthly}
            </button>
            <button onClick={() => setPeriod("yearly")}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${period === "yearly" ? "bg-white text-black font-semibold" : "text-zinc-400 hover:text-white"}`}>
              {c.yearly}
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Free */}
          <div className="border border-zinc-800 rounded-2xl p-8 bg-zinc-900 flex flex-col">
            <h2 className="text-2xl font-bold mb-1">{c.free_name}</h2>
            <p className="text-4xl font-bold mb-6">{fmtPrice(cur, "0")}</p>
            <ul className="space-y-3 mb-8 flex-1">
              {c.free_feats.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                  <Check className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>
            {user ? (
              <Link to="/dashboard" className="w-full text-center border border-zinc-700 text-zinc-200 rounded-xl py-3 font-semibold hover:bg-zinc-800 transition-colors">
                {c.free_cta}
              </Link>
            ) : (
              <Link to="/login" className="w-full text-center border border-zinc-700 text-zinc-200 rounded-xl py-3 font-semibold hover:bg-zinc-800 transition-colors">
                {c.free_cta}
              </Link>
            )}
          </div>

          {/* Pro */}
          <div className="relative border-2 border-emerald-400/60 rounded-2xl p-8 bg-zinc-900 flex flex-col">
            {period === "yearly" && (
              <span className="absolute -top-3 right-6 bg-emerald-400 text-black text-xs font-bold px-3 py-1 rounded-full">
                {c.best_value}
              </span>
            )}
            <h2 className="text-2xl font-bold mb-1">{c.pro_name}</h2>
            <p className="text-4xl font-bold mb-1">
              {fmtPrice(cur, priceVal)}
              <span className="text-base font-normal text-zinc-400"> {periodLabel}</span>
            </p>
            <div className="h-5 mb-4" />
            <ul className="space-y-3 mb-8 flex-1">
              {c.pro_feats.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-200">
                  <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>
            <button onClick={choosePlan} className="w-full bg-emerald-400 text-black rounded-xl py-3 font-bold hover:bg-emerald-300 transition-colors">
              {c.pro_cta}
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-zinc-500 mt-8">{c.trial_note}</p>
      </div>
    </div>
  );
}

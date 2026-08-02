import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../context/I18nContext";
import { PublicHeader } from "../components/AjudasKit";

// Hub da central de ajudas (/ajudas) — 2 ago 2026. Página ESCONDIDA de
// propósito: nenhum menu aponta para cá (o landing vende, não ensina), mas
// está no sitemap para o Google a servir a quem pesquisa "como controlar
// dividendos", etc. — decisão do Jose, 2 ago. O formato é o «Hub B» das
// maquetas: um percurso por fases (começar → dia-a-dia → ir mais fundo) em
// vez de cartões soltos, para quem chega perdido saber por onde começar.
// Tópicos ainda sem artigo aparecem com o chip «em breve»; à medida que os
// artigos forem sendo escritos, troca-se o `to: null` pela rota.

const COPY = {
  pt: {
    title: "Central de ajudas", lead: "Guias passo a passo de cada parte da app.",
    ph1: "1 · Começar", ph2: "2 · O dia-a-dia", ph3: "3 · Ir mais fundo", soon: "em breve",
    first: ["Primeiros passos", "conta, primeira carteira, primeiro ativo"],
    aloc: ["Alocações", "alvos, modo Ação, rebalancear"],
    div: ["Dividendos", "para que servem, registar e acompanhar"],
    alert: ["Alertas de preço", "ações, ETFs, REITs e cripto"],
    hist: ["Histórico e snapshots", "a evolução do património"],
    panel: ["Painel avançado", "o dashboard explicado imagem a imagem"],
  },
  en: {
    title: "Help center", lead: "Step-by-step guides to every part of the app.",
    ph1: "1 · Getting started", ph2: "2 · Day to day", ph3: "3 · Going deeper", soon: "coming soon",
    first: ["First steps", "account, first portfolio, first asset"],
    aloc: ["Allocations", "targets, Action mode, rebalancing"],
    div: ["Dividends", "what they're for, logging and tracking"],
    alert: ["Price alerts", "stocks, ETFs, REITs and crypto"],
    hist: ["History & snapshots", "how your net worth evolves"],
    panel: ["Advanced dashboard", "the dashboard explained image by image"],
  },
  fr: {
    title: "Centre d'aide", lead: "Des guides pas à pas pour chaque partie de l'app.",
    ph1: "1 · Commencer", ph2: "2 · Au quotidien", ph3: "3 · Aller plus loin", soon: "bientôt",
    first: ["Premiers pas", "compte, premier portefeuille, premier actif"],
    aloc: ["Allocations", "objectifs, mode Action, rééquilibrage"],
    div: ["Dividendes", "à quoi ils servent, saisie et suivi"],
    alert: ["Alertes de prix", "actions, ETF, REIT et crypto"],
    hist: ["Historique et snapshots", "l'évolution du patrimoine"],
    panel: ["Tableau de bord avancé", "le tableau de bord expliqué image par image"],
  },
  de: {
    title: "Hilfe-Center", lead: "Schritt-für-Schritt-Anleitungen für jeden Teil der App.",
    ph1: "1 · Loslegen", ph2: "2 · Der Alltag", ph3: "3 · Tiefer einsteigen", soon: "bald verfügbar",
    first: ["Erste Schritte", "Konto, erstes Portfolio, erster Vermögenswert"],
    aloc: ["Allokationen", "Ziele, Aktionsmodus, Rebalancing"],
    div: ["Dividenden", "wozu sie dienen, erfassen und verfolgen"],
    alert: ["Preisalarme", "Aktien, ETFs, REITs und Krypto"],
    hist: ["Verlauf & Snapshots", "die Entwicklung des Vermögens"],
    panel: ["Erweitertes Dashboard", "das Dashboard Bild für Bild erklärt"],
  },
  it: {
    title: "Centro assistenza", lead: "Guide passo passo per ogni parte dell'app.",
    ph1: "1 · Iniziare", ph2: "2 · Il giorno per giorno", ph3: "3 · Approfondire", soon: "in arrivo",
    first: ["Primi passi", "account, primo portafoglio, primo asset"],
    aloc: ["Allocazioni", "obiettivi, modalità Azione, ribilanciamento"],
    div: ["Dividendi", "a cosa servono, registrarli e seguirli"],
    alert: ["Avvisi di prezzo", "azioni, ETF, REIT e cripto"],
    hist: ["Storico e snapshot", "l'evoluzione del patrimonio"],
    panel: ["Pannello avanzato", "la dashboard spiegata immagine per immagine"],
  },
  es: {
    title: "Centro de ayuda", lead: "Guías paso a paso de cada parte de la app.",
    ph1: "1 · Empezar", ph2: "2 · El día a día", ph3: "3 · Ir más allá", soon: "muy pronto",
    first: ["Primeros pasos", "cuenta, primera cartera, primer activo"],
    aloc: ["Asignaciones", "objetivos, modo Acción, reequilibrar"],
    div: ["Dividendos", "para qué sirven, registrar y seguir"],
    alert: ["Alertas de precio", "acciones, ETFs, REITs y cripto"],
    hist: ["Histórico y snapshots", "la evolución del patrimonio"],
    panel: ["Panel avanzado", "el panel explicado imagen a imagen"],
  },
};

// A ordem do percurso. `to: null` = artigo ainda não escrito → chip «em breve».
const PHASES = [
  { label: "ph1", items: [{ key: "first", emoji: "🚀", to: null }] },
  {
    label: "ph2",
    items: [
      { key: "aloc", emoji: "🎯", to: "/ajudas/alocacoes" },
      { key: "div", emoji: "💶", to: null },
      { key: "alert", emoji: "🔔", to: null },
    ],
  },
  {
    label: "ph3",
    items: [
      { key: "hist", emoji: "📈", to: null },
      { key: "panel", emoji: "🧭", to: null },
    ],
  },
];

export default function Ajudas() {
  const { lang } = useI18n();
  const c = COPY[lang] || COPY.en;

  useEffect(() => {
    document.title = `${c.title} · Wallet76`;
  }, [c.title]);

  const row = "flex items-center justify-between bg-[#14181d] border border-zinc-800 rounded-xl px-4 py-3 mb-2";

  return (
    <div className="min-h-screen bg-[#0b0e11] text-zinc-100" style={{ font: "16px/1.55 system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <PublicHeader />
      <div className="max-w-3xl mx-auto px-6 pb-20">
        <h1 className="text-2xl font-bold pt-10">{c.title}</h1>
        <p className="text-sm text-zinc-400 mt-1 mb-8">{c.lead}</p>

        {PHASES.map((ph) => (
          <div key={ph.label} className="mb-6">
            <div className="text-[11px] font-bold tracking-widest uppercase text-zinc-500 mb-2">{c[ph.label]}</div>
            {ph.items.map((it) => {
              const [t, s] = c[it.key];
              const inner = (
                <>
                  <span className="flex items-center gap-3 min-w-0 text-[14.5px]">
                    <span className="text-lg">{it.emoji}</span>
                    <span className="truncate">
                      <span className="font-medium text-zinc-100">{t}</span>
                      <span className="text-zinc-500 text-[12.5px] hidden sm:inline"> · {s}</span>
                    </span>
                  </span>
                  {it.to ? (
                    <span className="text-blue-400">→</span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 bg-[#1a1f26] border border-zinc-800 rounded-full px-2.5 py-1">{c.soon}</span>
                  )}
                </>
              );
              return it.to ? (
                <Link key={it.key} to={it.to} className={`${row} hover:border-zinc-600 transition-colors`}>{inner}</Link>
              ) : (
                <div key={it.key} className={`${row} opacity-70`}>{inner}</div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

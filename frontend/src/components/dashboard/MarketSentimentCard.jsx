import React, { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../context/I18nContext";
import SentimentGauge from "./SentimentGauge";

// Cartão "Sentimento do Mercado" — dois manómetros de agulha lado a lado
// (Cripto + Ações). Consome /market/sentiment (cripto: alternative.me Fear &
// Greed; ações: CNN Fear & Greed). Auto-contido em i18n (COPY) como os outros
// cartões (ver DividendsCard) para não obrigar a mexer no I18nContext.

const COPY = {
  pt: {
    title: "Sentimento do mercado", crypto: "Cripto", stocks: "Ações",
    extreme_fear: "Medo extremo", fear: "Medo", neutral: "Neutro",
    greed: "Ganância", extreme_greed: "Ganância extrema",
    unavailable: "Sem dados", updated: "Fear & Greed · 0–100",
  },
  en: {
    title: "Market sentiment", crypto: "Crypto", stocks: "Stocks",
    extreme_fear: "Extreme fear", fear: "Fear", neutral: "Neutral",
    greed: "Greed", extreme_greed: "Extreme greed",
    unavailable: "No data", updated: "Fear & Greed · 0–100",
  },
  fr: {
    title: "Sentiment du marché", crypto: "Crypto", stocks: "Actions",
    extreme_fear: "Peur extrême", fear: "Peur", neutral: "Neutre",
    greed: "Avidité", extreme_greed: "Avidité extrême",
    unavailable: "Pas de données", updated: "Fear & Greed · 0–100",
  },
  de: {
    title: "Marktstimmung", crypto: "Krypto", stocks: "Aktien",
    extreme_fear: "Extreme Angst", fear: "Angst", neutral: "Neutral",
    greed: "Gier", extreme_greed: "Extreme Gier",
    unavailable: "Keine Daten", updated: "Fear & Greed · 0–100",
  },
  it: {
    title: "Sentiment del mercato", crypto: "Cripto", stocks: "Azioni",
    extreme_fear: "Paura estrema", fear: "Paura", neutral: "Neutro",
    greed: "Avidità", extreme_greed: "Avidità estrema",
    unavailable: "Nessun dato", updated: "Fear & Greed · 0–100",
  },
  es: {
    title: "Sentimiento del mercado", crypto: "Cripto", stocks: "Acciones",
    extreme_fear: "Miedo extremo", fear: "Miedo", neutral: "Neutral",
    greed: "Codicia", extreme_greed: "Codicia extrema",
    unavailable: "Sin datos", updated: "Fear & Greed · 0–100",
  },
};

export default function MarketSentimentCard({ compact = false }) {
  const { lang } = useI18n();
  const c = COPY[lang] || COPY.en;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get("/market/sentiment");
        if (alive) setData(data);
      } catch {
        if (alive) setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const classLabel = (k) => (k && c[k]) || c.unavailable;
  const crypto = data?.crypto || {};
  const stocks = data?.stocks || {};

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <Gauge className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-medium text-zinc-200">{c.title}</h3>
        <span className="ml-auto text-[10px] text-zinc-500">{c.updated}</span>
      </div>
      {loading ? (
        <div className="flex justify-around items-center h-[130px]">
          <div className="w-28 h-16 rounded-lg bg-zinc-800/40 animate-pulse" />
          <div className="w-28 h-16 rounded-lg bg-zinc-800/40 animate-pulse" />
        </div>
      ) : (
        <div className="flex justify-around items-start gap-2 pt-1">
          <SentimentGauge
            score={crypto.score || 0}
            unavailable={!crypto.available}
            label={c.crypto}
            sublabel={classLabel(crypto.classification)}
            size={compact ? 130 : 150}
          />
          <SentimentGauge
            score={stocks.score || 0}
            unavailable={!stocks.available}
            label={c.stocks}
            sublabel={classLabel(stocks.classification)}
            size={compact ? 130 : 150}
          />
        </div>
      )}
    </div>
  );
}

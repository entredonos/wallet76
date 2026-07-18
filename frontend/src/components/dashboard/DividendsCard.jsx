import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Coins, ChevronRight } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../context/I18nContext";
import { usePlan } from "../../hooks/usePlan";
import { fmtCurrency, convert } from "../../lib/format";

const FREQ_DAYS = { monthly: 30, quarterly: 91, "semi-annual": 182, annual: 365 };
const FREQ_PER_YEAR = { monthly: 12, quarterly: 4, "semi-annual": 2, annual: 1 };
const LOCALE = { pt: "pt-PT", en: "en-GB", fr: "fr-FR", de: "de-DE", it: "it-IT", es: "es-ES" };
const COPY = {
  pt: { title: "Próximos dividendos", next30: "Próximos 30 dias", all: "Ver calendário" },
  en: { title: "Upcoming dividends", next30: "Next 30 days", all: "View calendar" },
  fr: { title: "Prochains dividendes", next30: "30 prochains jours", all: "Voir le calendrier" },
  de: { title: "Anstehende Dividenden", next30: "Nächste 30 Tage", all: "Kalender ansehen" },
  it: { title: "Prossimi dividendi", next30: "Prossimi 30 giorni", all: "Vedi calendario" },
  es: { title: "Próximos dividendos", next30: "Próximos 30 días", all: "Ver calendario" },
};
const COLORS = ["#60a5fa", "#34d399", "#f87171", "#fbbf24", "#a78bfa", "#22d3ee", "#fb923c", "#f472b6"];
function color(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % COLORS.length; return COLORS[h]; }
function nativeToBase(a, native, base, fx) { const r = native === "USD" ? 1 : (fx?.[native] || 1); return convert((a || 0) / (r || 1), base, fx); }

export default function DividendsCard({ currency = "USD", fxRates = {} }) {
  const { lang } = useI18n();
  const { isPro } = usePlan();
  const c = COPY[lang] || COPY.en;
  const loc = LOCALE[lang] || "en-GB";
  const [divs, setDivs] = useState([]);

  useEffect(() => {
    if (!isPro) return;
    let cancelled = false;
    api.get("/analytics/dividends").then((r) => { if (!cancelled) setDivs(r.data?.dividends || []); }).catch(() => {});
    return () => { cancelled = true; };
  }, [isPro]);

  const { upcoming, total30 } = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
    const end = new Date(today); end.setDate(end.getDate() + 120);
    const out = [];
    for (const d of divs) {
      if (!d.next_est_date || !d.frequency) continue;
      const step = FREQ_DAYS[d.frequency] || 91;
      const perPay = (d.annual_income || 0) / (FREQ_PER_YEAR[d.frequency] || 4);
      let dt = new Date(d.next_est_date + "T00:00:00");
      if (isNaN(dt.getTime())) continue;
      let g = 0; while (dt < today && g < 60) { dt.setDate(dt.getDate() + step); g++; }
      g = 0; while (dt <= end && g < 8) { out.push({ symbol: d.symbol, date: new Date(dt), amount: perPay, currency: d.currency || "USD" }); dt.setDate(dt.getDate() + step); g++; }
    }
    out.sort((a, b) => a.date - b.date);
    let t30 = 0; out.forEach((p) => { if (p.date >= today && p.date <= in30) t30 += nativeToBase(p.amount, p.currency, currency, fxRates); });
    return { upcoming: out.slice(0, 3), total30: t30 };
  }, [divs, currency, fxRates]);

  if (!isPro || divs.length === 0 || upcoming.length === 0) return null;
  const fmtD = (d) => new Intl.DateTimeFormat(loc, { day: "2-digit", month: "short" }).format(d);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-zinc-200">{c.title}</span>
        </div>
        <Link to="/dividends" className="flex items-center gap-0.5 text-xs text-emerald-400 hover:text-emerald-300">
          {c.all} <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="text-2xl font-bold text-zinc-100 mb-4">{fmtCurrency(total30, currency)} <span className="text-xs font-normal text-zinc-500">· {c.next30}</span></div>
      <div className="space-y-2.5">
        {upcoming.map((p, i) => {
          const sym = p.symbol.toUpperCase();
          return (
            <div key={i} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-extrabold text-zinc-950 shrink-0" style={{ background: color(sym) }}>{sym.slice(0, 2)}</div>
              <span className="text-sm text-zinc-200 flex-1 truncate">{sym}</span>
              <span className="text-xs text-zinc-500">{fmtD(p.date)}</span>
              <span className="text-sm font-bold text-emerald-400 w-20 text-right">{fmtCurrency(p.amount, p.currency)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

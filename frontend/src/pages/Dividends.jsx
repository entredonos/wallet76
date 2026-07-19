import React, { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";
import { useI18n } from "../context/I18nContext";
import { usePlan } from "../hooks/usePlan";
import UpgradeOverlay from "../components/UpgradeOverlay";
import { fmtCurrency, convert } from "../lib/format";
import { Coins, CalendarDays, TrendingUp, X } from "lucide-react";

const FREQ_DAYS = { monthly: 30, quarterly: 91, "semi-annual": 182, annual: 365 };
const FREQ_PER_YEAR = { monthly: 12, quarterly: 4, "semi-annual": 2, annual: 1 };
const LOCALE = { pt: "pt-PT", en: "en-GB", fr: "fr-FR", de: "de-DE", it: "it-IT", es: "es-ES" };
const DAY_MS = 86400000;

const COPY = {
  pt: { title: "Calendário de Dividendos", subtitle: "Próximos pagamentos das tuas posições.", next30: "Próximos 30 dias", est12: "Estimativa 12 meses", received: "Recebido este ano", avg: "Média mensal", yieldLbl: "yield da carteira", chartTitle: "Rendimento por mês", chartNote: "Estimado, na tua moeda base. Passa o rato ou toca num mês.", agendaTitle: "Próximos pagamentos", perShare: "por ação", emptyTitle: "Sem dividendos a caminho", emptyDesc: "Nenhuma das tuas posições atuais paga dividendos, ou ainda não há histórico suficiente.", clear: "Limpar", legendEx: "Ex-dividendo", legendPay: "Pagamento", loading: "A carregar…", monthEmpty: "Sem pagamentos neste mês.", total: "Total", exLbl: "ex-div", payLbl: "pag.", confirmed: "Confirmado", estimated: "Estimado", freq: { monthly: "Mensal", quarterly: "Trimestral", "semi-annual": "Semestral", annual: "Anual" } },
  en: { title: "Dividend Calendar", subtitle: "Upcoming payments from your holdings.", next30: "Next 30 days", est12: "12-month estimate", received: "Received this year", avg: "Monthly average", yieldLbl: "portfolio yield", chartTitle: "Income by month", chartNote: "Estimated, in your base currency. Hover or tap a month.", agendaTitle: "Upcoming payments", perShare: "per share", emptyTitle: "No dividends coming up", emptyDesc: "None of your current holdings pay dividends, or there isn't enough history yet.", clear: "Clear", legendEx: "Ex-dividend", legendPay: "Payment", loading: "Loading…", monthEmpty: "No payments this month.", total: "Total", exLbl: "ex-div", payLbl: "pay", confirmed: "Confirmed", estimated: "Estimated", freq: { monthly: "Monthly", quarterly: "Quarterly", "semi-annual": "Semi-annual", annual: "Annual" } },
  fr: { title: "Calendrier des Dividendes", subtitle: "Prochains versements de vos positions.", next30: "30 prochains jours", est12: "Estimation 12 mois", received: "Reçu cette année", avg: "Moyenne mensuelle", yieldLbl: "rendement du portefeuille", chartTitle: "Revenu par mois", chartNote: "Estimé, dans votre devise de base. Survolez ou touchez un mois.", agendaTitle: "Prochains versements", perShare: "par action", emptyTitle: "Aucun dividende à venir", emptyDesc: "Aucune de vos positions actuelles ne verse de dividendes, ou l'historique est insuffisant.", clear: "Effacer", legendEx: "Ex-dividende", legendPay: "Versement", loading: "Chargement…", monthEmpty: "Aucun versement ce mois.", total: "Total", exLbl: "ex-div", payLbl: "vers.", confirmed: "Confirmé", estimated: "Estimé", freq: { monthly: "Mensuel", quarterly: "Trimestriel", "semi-annual": "Semestriel", annual: "Annuel" } },
  de: { title: "Dividendenkalender", subtitle: "Anstehende Zahlungen aus Ihren Positionen.", next30: "Nächste 30 Tage", est12: "12-Monats-Schätzung", received: "Dieses Jahr erhalten", avg: "Monatsdurchschnitt", yieldLbl: "Portfolio-Rendite", chartTitle: "Ertrag pro Monat", chartNote: "Geschätzt, in Ihrer Basiswährung. Monat überfahren oder antippen.", agendaTitle: "Anstehende Zahlungen", perShare: "pro Aktie", emptyTitle: "Keine Dividenden in Sicht", emptyDesc: "Keine Ihrer aktuellen Positionen zahlt Dividenden, oder es gibt noch nicht genug Historie.", clear: "Löschen", legendEx: "Ex-Dividende", legendPay: "Zahlung", loading: "Wird geladen…", monthEmpty: "Keine Zahlungen in diesem Monat.", total: "Gesamt", exLbl: "Ex-Tag", payLbl: "Zahlg.", confirmed: "Bestätigt", estimated: "Geschätzt", freq: { monthly: "Monatlich", quarterly: "Vierteljährlich", "semi-annual": "Halbjährlich", annual: "Jährlich" } },
  it: { title: "Calendario Dividendi", subtitle: "Prossimi pagamenti dalle tue posizioni.", next30: "Prossimi 30 giorni", est12: "Stima 12 mesi", received: "Ricevuto quest'anno", avg: "Media mensile", yieldLbl: "rendimento del portafoglio", chartTitle: "Reddito per mese", chartNote: "Stimato, nella tua valuta base. Passa il mouse o tocca un mese.", agendaTitle: "Prossimi pagamenti", perShare: "per azione", emptyTitle: "Nessun dividendo in arrivo", emptyDesc: "Nessuna delle tue posizioni attuali paga dividendi, o non c'è ancora storico sufficiente.", clear: "Cancella", legendEx: "Ex-dividendo", legendPay: "Pagamento", loading: "Caricamento…", monthEmpty: "Nessun pagamento questo mese.", total: "Totale", exLbl: "ex-div", payLbl: "pag.", confirmed: "Confermato", estimated: "Stimato", freq: { monthly: "Mensile", quarterly: "Trimestrale", "semi-annual": "Semestrale", annual: "Annuale" } },
  es: { title: "Calendario de Dividendos", subtitle: "Próximos pagos de tus posiciones.", next30: "Próximos 30 días", est12: "Estimación 12 meses", received: "Recibido este año", avg: "Media mensual", yieldLbl: "rendimiento de la cartera", chartTitle: "Ingresos por mes", chartNote: "Estimado, en tu moneda base. Pasa el ratón o toca un mes.", agendaTitle: "Próximos pagos", perShare: "por acción", emptyTitle: "Sin dividendos próximos", emptyDesc: "Ninguna de tus posiciones actuales paga dividendos, o aún no hay historial suficiente.", clear: "Limpiar", legendEx: "Ex-dividendo", legendPay: "Pago", loading: "Cargando…", monthEmpty: "Sin pagos este mes.", total: "Total", exLbl: "ex-div", payLbl: "pago", confirmed: "Confirmado", estimated: "Estimado", freq: { monthly: "Mensual", quarterly: "Trimestral", "semi-annual": "Semestral", annual: "Anual" } },
};

const BADGE_COLORS = ["#60a5fa", "#34d399", "#f87171", "#fbbf24", "#a78bfa", "#22d3ee", "#fb923c", "#f472b6"];
function badgeColor(sym) { let h = 0; for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) % BADGE_COLORS.length; return BADGE_COLORS[h]; }
function pad(n) { return String(n).padStart(2, "0"); }
function isoDay(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function incomeDate(p) { return p.payDate || p.exDate; }
function nativeToBase(amount, native, base, fx) {
  const rN = native === "USD" ? 1 : (fx?.[native] || 1);
  return convert((amount || 0) / (rN || 1), base, fx);
}

export default function Dividends({ currency = "USD" }) {
  const { lang } = useI18n();
  const { isPro } = usePlan();
  const c = COPY[lang] || COPY.en;
  const loc = LOCALE[lang] || "en-GB";

  const [loading, setLoading] = useState(true);
  const [divs, setDivs] = useState([]);
  const [fx, setFx] = useState({ USD: 1, EUR: 0.92, CHF: 0.88, BRL: 5.0 });
  const [portfolioUsd, setPortfolioUsd] = useState(0);
  const [nameMap, setNameMap] = useState({});
  const [selectedDay, setSelectedDay] = useState(null);
  const [hoverMonth, setHoverMonth] = useState(null);
  const [pinMonth, setPinMonth] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dRes, pRes] = await Promise.allSettled([
          api.get("/analytics/dividends"),
          api.get("/portfolio"),
        ]);
        if (cancelled) return;
        if (dRes.status === "fulfilled") setDivs(dRes.value.data?.dividends || []);
        if (pRes.status === "fulfilled") {
          const sum = pRes.value.data?.summary || {};
          setFx(sum.fx_rates || { USD: 1, EUR: sum.eur_rate || 0.92, CHF: sum.chf_rate || 0.88, BRL: sum.brl_rate || 5.0 });
          setPortfolioUsd(sum.total_usd || 0);
          const map = {};
          (pRes.value.data?.assets || []).forEach((a) => { if (a.symbol) map[a.symbol.toUpperCase()] = a.name || a.symbol; });
          setNameMap(map);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Project payments with real ex/pay dates (Yahoo) for the announced one,
  // then estimated future ones stepping by frequency.
  const projected = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(today); end.setDate(end.getDate() + 365);
    const startWin = new Date(today); startWin.setDate(startWin.getDate() - 2);
    const out = [];
    for (const d of divs) {
      if (!d.frequency) continue;
      const step = FREQ_DAYS[d.frequency] || 91;
      const perPay = (d.annual_income || 0) / (FREQ_PER_YEAR[d.frequency] || 4);
      const cur = d.currency || "USD";
      const realEx = d.ex_dividend_date ? new Date(d.ex_dividend_date + "T00:00:00") : null;
      const realPay = d.pay_date ? new Date(d.pay_date + "T00:00:00") : null;
      const validEx = realEx && !isNaN(realEx.getTime()) ? realEx : null;
      const validPay = realPay && !isNaN(realPay.getTime()) ? realPay : null;
      const payOffset = validEx && validPay ? Math.round((validPay - validEx) / DAY_MS) : null;
      let baseEx = validEx || (d.next_est_date ? new Date(d.next_est_date + "T00:00:00") : null);
      if (!baseEx || isNaN(baseEx.getTime())) continue;
      let dt = new Date(baseEx);
      let g = 0; while (dt < startWin && g < 60) { dt.setDate(dt.getDate() + step); g++; }
      g = 0;
      while (dt <= end && g < 60) {
        const isConfirmed = !!validEx && Math.abs(dt - validEx) < 2 * DAY_MS && validEx >= startWin;
        let payDate = null;
        if (isConfirmed && validPay) payDate = new Date(validPay);
        else if (payOffset != null) { payDate = new Date(dt); payDate.setDate(payDate.getDate() + payOffset); }
        out.push({ symbol: d.symbol, exDate: new Date(dt), payDate, amount: perPay, currency: cur, confirmed: isConfirmed, rate: d.rate_per_payment, frequency: d.frequency });
        dt.setDate(dt.getDate() + step); g++;
      }
    }
    out.sort((a, b) => incomeDate(a) - incomeDate(b));
    return out;
  }, [divs]);

  const kpis = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
    let next30 = 0;
    projected.forEach((p) => { const dt = incomeDate(p); if (dt >= today && dt <= in30) next30 += nativeToBase(p.amount, p.currency, currency, fx); });
    let est12 = 0, received = 0;
    divs.forEach((d) => {
      est12 += nativeToBase(d.annual_income || 0, d.currency || "USD", currency, fx);
      received += nativeToBase(d.total_received || 0, d.currency || "USD", currency, fx);
    });
    const portBase = convert(portfolioUsd, currency, fx);
    const yld = portBase > 0 ? (est12 / portBase) * 100 : null;
    return { next30, est12, received, avg: est12 / 12, yld };
  }, [projected, divs, fx, currency, portfolioUsd]);

  const monthly = useMemo(() => {
    const buckets = Array(12).fill(0);
    projected.forEach((p) => { buckets[incomeDate(p).getMonth()] += nativeToBase(p.amount, p.currency, currency, fx); });
    return buckets;
  }, [projected, fx, currency]);
  const monthMax = Math.max(...monthly, 1);
  const monthLabels = useMemo(() => [...Array(12)].map((_, m) => new Intl.DateTimeFormat(loc, { month: "narrow" }).format(new Date(2026, m, 1))), [loc]);
  const monthCurrencies = useMemo(() => {
    const arr = Array.from({ length: 12 }, () => ({}));
    projected.forEach((p) => { const b = arr[incomeDate(p).getMonth()]; b[p.currency] = (b[p.currency] || 0) + p.amount; });
    return arr;
  }, [projected]);
  const activeMonth = hoverMonth != null ? hoverMonth : pinMonth;

  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startIdx = (new Date(year, month, 1).getDay() + 6) % 7;
  const { exDays, payDays } = useMemo(() => {
    const ex = new Set(), pay = new Set();
    projected.forEach((p) => {
      if (p.exDate.getFullYear() === year && p.exDate.getMonth() === month) ex.add(p.exDate.getDate());
      if (p.payDate && p.payDate.getFullYear() === year && p.payDate.getMonth() === month) pay.add(p.payDate.getDate());
    });
    return { exDays: ex, payDays: pay };
  }, [projected, year, month]);
  const weekdays = useMemo(() => {
    const monday = new Date(2024, 0, 1);
    return [...Array(7)].map((_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return new Intl.DateTimeFormat(loc, { weekday: "narrow" }).format(d); });
  }, [loc]);

  const agendaItems = selectedDay
    ? projected.filter((p) => isoDay(p.exDate) === selectedDay || (p.payDate && isoDay(p.payDate) === selectedDay))
    : projected.slice(0, 40);
  const groups = useMemo(() => {
    const g = {};
    agendaItems.forEach((p) => { const dt = incomeDate(p); const k = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`; (g[k] = g[k] || []).push(p); });
    return g;
  }, [agendaItems]);

  const fmtGroup = (key) => { const [y, m] = key.split("-"); return new Intl.DateTimeFormat(loc, { month: "long", year: "numeric" }).format(new Date(+y, +m - 1, 1)); };
  const fmtD = (d) => new Intl.DateTimeFormat(loc, { day: "2-digit", month: "short" }).format(d);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Coins className="w-6 h-6 text-emerald-400" />
        <h1 className="text-2xl font-bold text-zinc-100">{c.title}</h1>
      </div>
      <p className="text-sm text-zinc-500 mb-6">{c.subtitle}</p>

      <div className="relative">
        {loading ? (
          <div className="text-zinc-500 text-sm py-20 text-center">{c.loading}</div>
        ) : divs.length === 0 ? (
          <div className="border border-zinc-800 rounded-2xl p-10 text-center bg-zinc-900/50">
            <Coins className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-200 font-semibold mb-1">{c.emptyTitle}</p>
            <p className="text-sm text-zinc-500 max-w-md mx-auto">{c.emptyDesc}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">{c.next30}</div>
                <div className="text-2xl font-bold text-zinc-100">{fmtCurrency(kpis.next30, currency)}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">{c.est12}</div>
                <div className="text-2xl font-bold text-zinc-100">{fmtCurrency(kpis.est12, currency)}</div>
                {kpis.yld != null && <div className="text-xs text-emerald-400 mt-0.5">≈ {kpis.yld.toFixed(2)}% {c.yieldLbl}</div>}
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">{c.received}</div>
                <div className="text-2xl font-bold text-zinc-100">{fmtCurrency(kpis.received, currency)}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">{c.avg}</div>
                <div className="text-2xl font-bold text-zinc-100">{fmtCurrency(kpis.avg, currency)}</div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3 mb-6">
              {/* Calendar */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-zinc-200 capitalize">
                  <CalendarDays className="w-4 h-4 text-zinc-400" />
                  {new Intl.DateTimeFormat(loc, { month: "long", year: "numeric" }).format(now)}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {weekdays.map((w, i) => <div key={i} className="text-[10px] text-zinc-600 text-center uppercase">{w}</div>)}
                  {[...Array(startIdx)].map((_, i) => <div key={"e" + i} />)}
                  {[...Array(daysInMonth)].map((_, i) => {
                    const day = i + 1;
                    const iso = `${year}-${pad(month + 1)}-${pad(day)}`;
                    const hasEx = exDays.has(day), hasPay = payDays.has(day);
                    const clickable = hasEx || hasPay;
                    const isToday = day === now.getDate();
                    const isSel = selectedDay === iso;
                    return (
                      <button key={day} disabled={!clickable}
                        onClick={() => setSelectedDay(isSel ? null : iso)}
                        className={`aspect-square rounded-lg text-xs flex items-center justify-center relative transition-colors ${clickable ? "cursor-pointer" : "cursor-default"} ${isSel ? "bg-emerald-500/20 border border-emerald-400 text-white" : isToday ? "border border-zinc-600 text-zinc-200" : "bg-zinc-950/40 text-zinc-500"} ${clickable && !isSel ? "hover:border-zinc-600 border border-transparent" : ""}`}>
                        {day}
                        <span className="absolute bottom-1 flex gap-0.5">
                          {hasEx && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                          {hasPay && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 mt-4 text-[11px] text-zinc-600">
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> {c.legendEx}</span>
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" /> {c.legendPay}</span>
                </div>
              </div>

              {/* Monthly chart */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <style>{`@keyframes divRise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
                <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-zinc-200">
                  <TrendingUp className="w-4 h-4 text-zinc-400" /> {c.chartTitle}
                </div>
                <div className="flex items-end gap-1.5 h-36">
                  {monthly.map((v, m) => {
                    const active = activeMonth === m;
                    const dim = activeMonth != null && !active;
                    return (
                      <div key={m}
                        onMouseEnter={() => setHoverMonth(m)} onMouseLeave={() => setHoverMonth(null)}
                        onClick={() => setPinMonth((pm) => (pm === m ? null : m))}
                        className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end cursor-pointer group">
                        <div className={`w-full rounded-t transition-all duration-200 ${active || m === month ? "bg-gradient-to-t from-emerald-600 to-emerald-400" : "bg-zinc-700 group-hover:bg-zinc-600"} ${dim ? "opacity-40" : "opacity-100"}`}
                          style={{ height: `${Math.max(4, (v / monthMax) * 100)}%` }} />
                        <div className={`text-[9px] transition-colors ${active ? "text-emerald-400 font-semibold" : "text-zinc-600"}`}>{monthLabels[m]}</div>
                      </div>
                    );
                  })}
                </div>
                {activeMonth != null ? (
                  <div key={activeMonth} style={{ animation: "divRise .28s ease" }} className="mt-4 pt-3 border-t border-zinc-800">
                    <div className="text-xs font-semibold text-zinc-300 mb-2 capitalize">
                      {new Intl.DateTimeFormat(loc, { month: "long" }).format(new Date(2026, activeMonth, 1))}
                    </div>
                    {Object.keys(monthCurrencies[activeMonth]).length === 0 ? (
                      <div className="text-[11px] text-zinc-600">{c.monthEmpty}</div>
                    ) : (
                      <div className="space-y-1.5">
                        {Object.entries(monthCurrencies[activeMonth]).sort((a, b) => b[1] - a[1]).map(([cur, amt]) => (
                          <div key={cur} className="flex items-center justify-between text-xs">
                            <span className="text-zinc-400 font-mono">{cur}</span>
                            <span className="text-zinc-100 font-semibold">{fmtCurrency(amt, cur)}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between text-xs pt-1.5 mt-1 border-t border-zinc-800">
                          <span className="text-zinc-500">{c.total}</span>
                          <span className="text-emerald-400 font-bold">{fmtCurrency(monthly[activeMonth], currency)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-zinc-600 mt-3">{c.chartNote}</div>
                )}
              </div>
            </div>

            {/* Agenda */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-zinc-200">{c.agendaTitle}</div>
                {selectedDay && (
                  <button onClick={() => setSelectedDay(null)} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300">
                    <X className="w-3.5 h-3.5" /> {c.clear} · {fmtD(new Date(selectedDay + "T00:00:00"))}
                  </button>
                )}
              </div>
              {Object.keys(groups).length === 0 ? (
                <div className="text-sm text-zinc-600 py-6 text-center">—</div>
              ) : Object.entries(groups).map(([key, items], gi) => {
                const groupTotal = items.reduce((sum, p) => sum + nativeToBase(p.amount, p.currency, currency, fx), 0);
                return (
                <div key={key} className={`rounded-xl px-3 -mx-1.5 pb-1 ${gi % 2 === 1 ? "bg-zinc-800/20" : ""}`}>
                  <div className="flex items-center justify-between mt-3 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-1 h-4 rounded-full bg-emerald-400/70" />
                      <span className="text-sm font-bold text-zinc-100 capitalize">{fmtGroup(key)}</span>
                    </div>
                    <span className="text-xs font-semibold text-zinc-400">{fmtCurrency(groupTotal, currency)}</span>
                  </div>
                  {items.map((p, idx) => {
                    const sym = p.symbol.toUpperCase();
                    const nm = nameMap[sym] || sym;
                    const baseAmt = nativeToBase(p.amount, p.currency, currency, fx);
                    const showBase = p.currency !== currency;
                    return (
                      <div key={key + idx} className="flex items-center gap-3 py-2.5 border-b border-zinc-800/60">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-extrabold text-zinc-950 shrink-0" style={{ background: badgeColor(sym) }}>
                          {sym.slice(0, 2)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-zinc-100 truncate">{nm}</span>
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${p.confirmed ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-amber-500/10 text-amber-400 border-amber-500/30"}`}>
                              {p.confirmed ? c.confirmed : c.estimated}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-500">{c.freq[p.frequency] || p.frequency}{p.rate ? ` · ${fmtCurrency(p.rate, p.currency)} ${c.perShare}` : ""}</div>
                        </div>
                        <div className="text-right shrink-0 w-20">
                          <div className="text-[11px] text-zinc-400">{c.exLbl} {fmtD(p.exDate)}</div>
                          {p.payDate && <div className="text-[11px] text-blue-400/80">{c.payLbl} {fmtD(p.payDate)}</div>}
                        </div>
                        <div className="text-right shrink-0 w-24">
                          <div className="text-sm font-bold text-emerald-400">{fmtCurrency(p.amount, p.currency)}</div>
                          {showBase && <div className="text-[10px] text-zinc-600">≈ {fmtCurrency(baseAmt, currency)}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                );
              })}
            </div>
          </>
        )}
        {!isPro && !loading && <UpgradeOverlay feature={c.title} />}
      </div>
    </div>
  );
}

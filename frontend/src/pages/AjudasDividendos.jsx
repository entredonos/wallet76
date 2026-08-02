import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../context/I18nContext";
import { useAuth } from "../context/AuthContext";
import { PublicHeader, Step, WhereBox, BTN } from "../components/AjudasKit";

// Artigo de ajuda: Dividendos (/ajudas/dividendos) — 2 ago 2026. Escrito a
// partir do ecrã REAL (Dividends.jsx): a página é um calendário — a app
// estima tudo sozinha a partir das posições, não há nada para registar à
// mão. Os nomes citados («Próximos 30 dias», «Confirmado»/«Estimado», etc.)
// são as labels do COPY do Dividends.jsx — se mudarem lá, mudam cá.

const COPY = {
  pt: {
    crumb: "Ajudas", title: "Dividendos: o calendário do dinheiro que entra",
    lead: "Se as tuas posições pagam dividendos, a app estima quanto, quando e de quem — sem registares nada: basta os ativos estarem na carteira.",
    why: "Para quem investe em rendimento, a pergunta do mês é «quanto entra e quando?». O calendário responde com as datas de cada posição e transforma o ano numa estimativa mês a mês.",
    where_label: "Onde está na app:", where: "menu lateral → «Dividendos». No telemóvel: separador «Mais» → «Dividendos».",
    s1t: "Não há nada para configurar",
    s1p: "A página lê as tuas posições e o histórico de dividendos de cada ativo. Se um ativo paga, aparece sozinho; se nenhuma posição paga (ou ainda não há histórico suficiente), vês o estado vazio a explicá-lo.",
    s2t: "Lê os números de cima",
    s2p: "Quatro cartões resumem tudo: «Próximos 30 dias», «Estimativa 12 meses», «Recebido este ano» e «Média mensal» — com o yield da carteira ao lado. É a tua fotografia de rendimento em cinco segundos.",
    s3t: "O gráfico «Rendimento por mês»",
    s3p: "Mostra o rendimento estimado na tua moeda base, mês a mês. Toca (ou passa o rato) num mês para veres os pagamentos desse mês em detalhe.",
    s4t: "A agenda «Próximos pagamentos»",
    s4p: "Cada linha tem duas datas: ex-dividendo — tens de ter o ativo ANTES desse dia para receber — e pagamento, quando o dinheiro cai. As etiquetas distinguem «Confirmado» (anunciado pela empresa) de «Estimado» (projetado do histórico).",
    s5t: "Filtra por carteira",
    s5p: "Em cima podes ver «Todas as carteiras» ou isolar uma só — útil se separas, por exemplo, a carteira de rendimento da de crescimento.",
    s6t: "Trata as estimativas como estimativas",
    s6p: "As projeções nascem do histórico e da frequência de cada ativo (mensal, trimestral, semestral, anual). Empresas cortam dividendos e mudam datas — o calendário é um mapa, não uma promessa.",
    note: "Isto é educação sobre a ferramenta, não aconselhamento de investimento personalizado.",
    back: "← Todas as ajudas", cta_app: "Abrir os Dividendos", cta_anon: "Começar grátis",
  },
  en: {
    crumb: "Help", title: "Dividends: the calendar of money coming in",
    lead: "If your holdings pay dividends, the app estimates how much, when and from whom — nothing to log: having the assets in your portfolio is enough.",
    why: "For income investors the monthly question is “how much comes in, and when?”. The calendar answers it with each position's dates and turns the year into a month-by-month estimate.",
    where_label: "Where it lives in the app:", where: "side menu → “Dividends”. On mobile: “More” tab → “Dividends”.",
    s1t: "There is nothing to set up",
    s1p: "The page reads your holdings and each asset's dividend history. If an asset pays, it shows up by itself; if none of your positions pay (or there isn't enough history yet), an empty state explains it.",
    s2t: "Read the numbers at the top",
    s2p: "Four cards sum it all up: “Next 30 days”, “12-month estimate”, “Received this year” and “Monthly average” — with your portfolio yield next to them. Your income snapshot in five seconds.",
    s3t: "The “Income by month” chart",
    s3p: "Shows estimated income in your base currency, month by month. Tap (or hover) a month to see that month's payments in detail.",
    s4t: "The “Upcoming payments” agenda",
    s4p: "Each line carries two dates: ex-dividend — you must hold the asset BEFORE that day to get paid — and payment, when the money lands. Labels distinguish “Confirmed” (announced by the company) from “Estimated” (projected from history).",
    s5t: "Filter by wallet",
    s5p: "At the top you can view “All wallets” or isolate one — handy if you keep, say, an income portfolio separate from a growth one.",
    s6t: "Treat estimates as estimates",
    s6p: "Projections come from each asset's history and frequency (monthly, quarterly, semi-annual, annual). Companies cut dividends and move dates — the calendar is a map, not a promise.",
    note: "This is education about the tool, not personalised investment advice.",
    back: "← All help topics", cta_app: "Open Dividends", cta_anon: "Start for free",
  },
  fr: {
    crumb: "Aide", title: "Dividendes : le calendrier de l'argent qui rentre",
    lead: "Si vos positions versent des dividendes, l'app estime combien, quand et de qui — rien à saisir : il suffit que les actifs soient dans le portefeuille.",
    why: "Pour qui investit en rendement, la question du mois est « combien rentre, et quand ? ». Le calendrier y répond avec les dates de chaque position et transforme l'année en estimation mois par mois.",
    where_label: "Où le trouver dans l'app :", where: "menu latéral → « Dividendes ». Sur mobile : onglet « Plus » → « Dividendes ».",
    s1t: "Rien à configurer",
    s1p: "La page lit vos positions et l'historique de dividendes de chaque actif. Si un actif verse, il apparaît tout seul ; si aucune position ne verse (ou que l'historique est insuffisant), un état vide l'explique.",
    s2t: "Lisez les chiffres du haut",
    s2p: "Quatre cartes résument tout : « 30 prochains jours », « Estimation 12 mois », « Reçu cette année » et « Moyenne mensuelle » — avec le rendement du portefeuille à côté. Votre photo de revenu en cinq secondes.",
    s3t: "Le graphique « Revenu par mois »",
    s3p: "Montre le revenu estimé dans votre devise de base, mois par mois. Touchez (ou survolez) un mois pour voir ses versements en détail.",
    s4t: "L'agenda « Prochains versements »",
    s4p: "Chaque ligne porte deux dates : ex-dividende — il faut détenir l'actif AVANT ce jour pour être payé — et versement, quand l'argent arrive. Les étiquettes distinguent « Confirmé » (annoncé par l'entreprise) d'« Estimé » (projeté depuis l'historique).",
    s5t: "Filtrez par portefeuille",
    s5p: "En haut, affichez « Tous les portefeuilles » ou isolez-en un seul — pratique si vous séparez, par exemple, le portefeuille de rendement de celui de croissance.",
    s6t: "Traitez les estimations comme des estimations",
    s6p: "Les projections naissent de l'historique et de la fréquence de chaque actif (mensuel, trimestriel, semestriel, annuel). Les entreprises coupent des dividendes et déplacent des dates — le calendrier est une carte, pas une promesse.",
    note: "Ceci est de l'éducation sur l'outil, pas du conseil en investissement personnalisé.",
    back: "← Toutes les aides", cta_app: "Ouvrir les Dividendes", cta_anon: "Commencer gratuitement",
  },
  de: {
    crumb: "Hilfe", title: "Dividenden: der Kalender des Geldes, das reinkommt",
    lead: "Zahlen deine Positionen Dividenden, schätzt die App wie viel, wann und von wem — ohne dass du etwas erfasst: Die Vermögenswerte im Portfolio genügen.",
    why: "Wer auf Erträge investiert, fragt jeden Monat: „Wie viel kommt rein, und wann?“ Der Kalender antwortet mit den Terminen jeder Position und macht aus dem Jahr eine Monat-für-Monat-Schätzung.",
    where_label: "Wo es in der App steht:", where: "Seitenmenü → „Dividenden“. Am Handy: Tab „Mehr“ → „Dividenden“.",
    s1t: "Nichts einzurichten",
    s1p: "Die Seite liest deine Positionen und die Dividendenhistorie jedes Vermögenswerts. Zahlt ein Wert, erscheint er von selbst; zahlt keine Position (oder es gibt noch zu wenig Historie), erklärt das ein leerer Zustand.",
    s2t: "Die Zahlen oben lesen",
    s2p: "Vier Karten fassen alles zusammen: „Nächste 30 Tage“, „12-Monats-Schätzung“, „Dieses Jahr erhalten“ und „Monatsdurchschnitt“ — daneben die Portfolio-Rendite. Dein Ertragsfoto in fünf Sekunden.",
    s3t: "Das Diagramm „Ertrag pro Monat“",
    s3p: "Zeigt den geschätzten Ertrag in deiner Basiswährung, Monat für Monat. Tippe einen Monat an (oder fahre darüber), um dessen Zahlungen im Detail zu sehen.",
    s4t: "Die Agenda „Anstehende Zahlungen“",
    s4p: "Jede Zeile trägt zwei Termine: Ex-Dividende — du musst den Wert VOR diesem Tag halten, um bezahlt zu werden — und Zahlung, wenn das Geld ankommt. Etiketten unterscheiden „Bestätigt“ (vom Unternehmen angekündigt) von „Geschätzt“ (aus der Historie projiziert).",
    s5t: "Nach Depot filtern",
    s5p: "Oben zeigst du „Alle Depots“ oder isolierst eines — praktisch, wenn du etwa ein Ertrags- und ein Wachstumsdepot getrennt führst.",
    s6t: "Schätzungen als Schätzungen behandeln",
    s6p: "Die Projektionen entstehen aus Historie und Frequenz jedes Werts (monatlich, vierteljährlich, halbjährlich, jährlich). Unternehmen kürzen Dividenden und verschieben Termine — der Kalender ist eine Landkarte, kein Versprechen.",
    note: "Das ist Wissensvermittlung über das Werkzeug, keine persönliche Anlageberatung.",
    back: "← Alle Hilfen", cta_app: "Dividenden öffnen", cta_anon: "Kostenlos starten",
  },
  it: {
    crumb: "Aiuto", title: "Dividendi: il calendario dei soldi in arrivo",
    lead: "Se le tue posizioni pagano dividendi, l'app stima quanto, quando e da chi — senza registrare nulla: basta avere gli asset in portafoglio.",
    why: "Per chi investe da reddito, la domanda del mese è «quanto entra e quando?». Il calendario risponde con le date di ogni posizione e trasforma l'anno in una stima mese per mese.",
    where_label: "Dove si trova nell'app:", where: "menu laterale → «Dividendi». Su mobile: scheda «Altro» → «Dividendi».",
    s1t: "Niente da configurare",
    s1p: "La pagina legge le tue posizioni e lo storico dei dividendi di ogni asset. Se un asset paga, compare da solo; se nessuna posizione paga (o non c'è ancora storico sufficiente), uno stato vuoto lo spiega.",
    s2t: "Leggi i numeri in alto",
    s2p: "Quattro schede riassumono tutto: «Prossimi 30 giorni», «Stima 12 mesi», «Ricevuto quest'anno» e «Media mensile» — con il rendimento del portafoglio accanto. La tua foto del reddito in cinque secondi.",
    s3t: "Il grafico «Reddito per mese»",
    s3p: "Mostra il reddito stimato nella tua valuta base, mese per mese. Tocca (o passa il mouse su) un mese per vederne i pagamenti in dettaglio.",
    s4t: "L'agenda «Prossimi pagamenti»",
    s4p: "Ogni riga porta due date: ex-dividendo — devi avere l'asset PRIMA di quel giorno per essere pagato — e pagamento, quando i soldi arrivano. Le etichette distinguono «Confermato» (annunciato dall'azienda) da «Stimato» (proiettato dallo storico).",
    s5t: "Filtra per portafoglio",
    s5p: "In alto puoi vedere «Tutti i portafogli» o isolarne uno — utile se separi, ad esempio, il portafoglio da reddito da quello di crescita.",
    s6t: "Tratta le stime come stime",
    s6p: "Le proiezioni nascono dallo storico e dalla frequenza di ogni asset (mensile, trimestrale, semestrale, annuale). Le aziende tagliano dividendi e spostano date — il calendario è una mappa, non una promessa.",
    note: "Questa è formazione sullo strumento, non consulenza d'investimento personalizzata.",
    back: "← Tutte le guide", cta_app: "Apri i Dividendi", cta_anon: "Inizia gratis",
  },
  es: {
    crumb: "Ayuda", title: "Dividendos: el calendario del dinero que entra",
    lead: "Si tus posiciones pagan dividendos, la app estima cuánto, cuándo y de quién — sin registrar nada: basta con tener los activos en la cartera.",
    why: "Para quien invierte por rentas, la pregunta del mes es «¿cuánto entra y cuándo?». El calendario responde con las fechas de cada posición y convierte el año en una estimación mes a mes.",
    where_label: "Dónde está en la app:", where: "menú lateral → «Dividendos». En el móvil: pestaña «Más» → «Dividendos».",
    s1t: "No hay nada que configurar",
    s1p: "La página lee tus posiciones y el historial de dividendos de cada activo. Si un activo paga, aparece solo; si ninguna posición paga (o aún no hay historial suficiente), un estado vacío lo explica.",
    s2t: "Lee los números de arriba",
    s2p: "Cuatro tarjetas lo resumen todo: «Próximos 30 días», «Estimación 12 meses», «Recibido este año» y «Media mensual» — con el rendimiento de la cartera al lado. Tu foto de ingresos en cinco segundos.",
    s3t: "El gráfico «Ingresos por mes»",
    s3p: "Muestra los ingresos estimados en tu moneda base, mes a mes. Toca (o pasa el ratón por) un mes para ver sus pagos en detalle.",
    s4t: "La agenda «Próximos pagos»",
    s4p: "Cada línea lleva dos fechas: ex-dividendo — debes tener el activo ANTES de ese día para cobrar — y pago, cuando el dinero llega. Las etiquetas distinguen «Confirmado» (anunciado por la empresa) de «Estimado» (proyectado del historial).",
    s5t: "Filtra por cartera",
    s5p: "Arriba puedes ver «Todas las carteras» o aislar una sola — útil si separas, por ejemplo, la cartera de rentas de la de crecimiento.",
    s6t: "Trata las estimaciones como estimaciones",
    s6p: "Las proyecciones nacen del historial y la frecuencia de cada activo (mensual, trimestral, semestral, anual). Las empresas recortan dividendos y mueven fechas — el calendario es un mapa, no una promesa.",
    note: "Esto es educación sobre la herramienta, no asesoramiento de inversión personalizado.",
    back: "← Todas las ayudas", cta_app: "Abrir los Dividendos", cta_anon: "Empezar gratis",
  },
};

export default function AjudasDividendos() {
  const { lang } = useI18n();
  const { user } = useAuth();
  const c = COPY[lang] || COPY.en;

  useEffect(() => {
    document.title = `${c.title} · Wallet76`;
  }, [c.title]);

  return (
    <div className="min-h-screen bg-[#0b0e11] text-zinc-100" style={{ font: "16px/1.55 system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <PublicHeader />
      <div className="max-w-2xl mx-auto px-6 pb-20">
        <div className="text-[12px] text-zinc-500 pt-8">
          <Link to="/ajudas" className="text-blue-400 hover:underline">{c.crumb}</Link> / {c.title.split(":")[0].trim()}
        </div>
        <h1 className="text-2xl font-bold mt-2">{c.title}</h1>
        <p className="text-[14.5px] text-zinc-400 mt-2">{c.lead}</p>
        <p className="text-[13.5px] text-zinc-500 mt-3 mb-5">{c.why}</p>
        <WhereBox label={c.where_label}>{c.where}</WhereBox>

        <Step n={1} title={c.s1t}>{c.s1p}</Step>
        <Step n={2} title={c.s2t}>{c.s2p}</Step>
        <Step n={3} title={c.s3t}>{c.s3p}</Step>
        <Step n={4} title={c.s4t}>{c.s4p}</Step>
        <Step n={5} title={c.s5t}>{c.s5p}</Step>
        <Step n={6} title={c.s6t}>{c.s6p}</Step>

        <p className="text-[11.5px] text-zinc-600 mt-8">{c.note}</p>

        <div className="flex items-center justify-between border-t border-zinc-800 mt-6 pt-5">
          <Link to="/ajudas" className="text-sm text-blue-400 hover:underline">{c.back}</Link>
          {user ? (
            <Link to="/dividends" className={BTN}>{c.cta_app}</Link>
          ) : (
            <Link to="/register" className={BTN}>{c.cta_anon}</Link>
          )}
        </div>
      </div>
    </div>
  );
}

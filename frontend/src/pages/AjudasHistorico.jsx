import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../context/I18nContext";
import { useAuth } from "../context/AuthContext";
import { PublicHeader, Step, WhereBox, BTN } from "../components/AjudasKit";

// Artigo de ajuda: Histórico e snapshots (/ajudas/historico) — 2 ago 2026.
// Escrito a partir do funcionamento real: snapshots de 15 em 15 minutos
// (dash.chart_empty), reconstrução ao vivo para períodos longos e a rede de
// segurança que troca reconstrução por snapshots gravados quando as fontes
// de preço falham (dash.safety_net_tooltip) — a lógica intocável da
// REGRA #2. REGRA #9: se o gráfico de evolução mudar, isto muda.

const COPY = {
  pt: {
    crumb: "Ajudas", title: "Histórico e snapshots: como a app lembra o teu património",
    lead: "O gráfico de evolução não nasce por magia: a app guarda fotografias do valor da carteira a cada 15 minutos e reconstrói o passado quando precisa.",
    why: "Saber onde estás só tem significado ao pé de onde estavas. É o histórico que transforma números soltos numa trajetória — e vale a pena saber como ele se constrói para confiares no que vês.",
    where_label: "Onde está na app:", where: "no Painel («Evolução do Portfólio») e, com mais detalhe, no painel avançado («Evolução da Carteira», com janelas de 15 minutos a ALL).",
    s1t: "Snapshots a cada 15 minutos",
    s1p: "Desde que a tua conta existe, o valor total da carteira (e de cada classe) fica gravado de 15 em 15 minutos. É por isso que uma conta nova tem um gráfico curto: o histórico constrói-se a partir do dia em que entras — cada dia que passa, o gráfico fica mais rico.",
    s2t: "Reconstrução ao vivo",
    s2p: "Para períodos longos, a app também reconstrói o passado com os preços históricos dos mercados e as tuas transações — quanto valia o que tinhas, no dia em que o tinhas. Os dois métodos completam-se: snapshots para o detalhe fino, reconstrução para a história comprida.",
    s3t: "A rede de segurança",
    s3p: "Se as fontes de preço falharem num troço do gráfico, a app usa os snapshots gravados em vez de inventar valores — e assinala-o com um aviso no próprio gráfico. Preferimos um gráfico honesto a um gráfico bonito.",
    s4t: "As janelas de tempo",
    s4p: "No painel avançado escolhes a janela: de 15 minutos (o intradiário de hoje) até ALL (a história completa desde o início). Cada janela agrega os dados ao ritmo certo para se ler bem.",
    s5t: "Uma linha por classe",
    s5p: "A evolução separa ações, cripto, ETFs e liquidez em linhas próprias, com as mesmas cores de sempre — num dia mau vês logo se foi a cripto que puxou para baixo ou se caiu tudo.",
    s6t: "O histórico é tão bom quanto as transações",
    s6p: "O custo médio, o P&L e a reconstrução nascem das tuas transações. Datas e preços de compra corretos dão um passado correto; se corrigires uma transação antiga, o histórico recalcula-se — é fiel ao que registaste, não a uma memória.",
    note: "Isto é educação sobre a ferramenta, não aconselhamento de investimento personalizado.",
    back: "← Todas as ajudas", cta_app: "Abrir o Painel", cta_anon: "Começar grátis",
  },
  en: {
    crumb: "Help", title: "History & snapshots: how the app remembers your wealth",
    lead: "The evolution chart isn't born by magic: the app saves photographs of your portfolio value every 15 minutes and reconstructs the past when it needs to.",
    why: "Knowing where you are only means something next to where you were. History is what turns loose numbers into a trajectory — and it's worth knowing how it's built so you can trust what you see.",
    where_label: "Where it lives in the app:", where: "on the Dashboard (“Portfolio Evolution”) and, in more detail, in the advanced panel (“Portfolio Evolution” with windows from 15 minutes to ALL).",
    s1t: "Snapshots every 15 minutes",
    s1p: "From the moment your account exists, the total portfolio value (and each class) is saved every 15 minutes. That's why a new account has a short chart: history is built from the day you join — every passing day makes the chart richer.",
    s2t: "Live reconstruction",
    s2p: "For long periods, the app also reconstructs the past from historical market prices and your transactions — what your holdings were worth, on the day you held them. The two methods complete each other: snapshots for fine detail, reconstruction for the long story.",
    s3t: "The safety net",
    s3p: "If price sources fail for a stretch of the chart, the app uses the saved snapshots instead of making values up — and flags it with a notice on the chart itself. We prefer an honest chart to a pretty one.",
    s4t: "The time windows",
    s4p: "In the advanced panel you pick the window: from 15 minutes (today's intraday) to ALL (the full story since the beginning). Each window aggregates the data at the right pace to read well.",
    s5t: "One line per class",
    s5p: "The evolution splits stocks, crypto, ETFs and liquidity into their own lines, with the same colours as everywhere — on a bad day you see at once whether crypto dragged things down or everything fell.",
    s6t: "History is only as good as your transactions",
    s6p: "Average cost, P&L and the reconstruction are born from your transactions. Correct purchase dates and prices give a correct past; if you fix an old transaction, history recalculates — it's faithful to what you recorded, not to a memory.",
    note: "This is education about the tool, not personalised investment advice.",
    back: "← All help topics", cta_app: "Open the Dashboard", cta_anon: "Start for free",
  },
  fr: {
    crumb: "Aide", title: "Historique et snapshots : comment l'app se souvient de votre patrimoine",
    lead: "Le graphique d'évolution ne naît pas par magie : l'app enregistre des photographies de la valeur du portefeuille toutes les 15 minutes et reconstruit le passé quand il le faut.",
    why: "Savoir où vous êtes n'a de sens qu'à côté d'où vous étiez. C'est l'historique qui transforme des chiffres épars en trajectoire — et il vaut la peine de savoir comment il se construit pour faire confiance à ce que vous voyez.",
    where_label: "Où le trouver dans l'app :", where: "sur le Tableau de bord (« Évolution du Portefeuille ») et, plus en détail, dans le panneau avancé (fenêtres de 15 minutes à ALL).",
    s1t: "Des snapshots toutes les 15 minutes",
    s1p: "Dès que votre compte existe, la valeur totale du portefeuille (et de chaque classe) est enregistrée toutes les 15 minutes. C'est pourquoi un compte neuf a un graphique court : l'historique se construit à partir du jour de votre arrivée — chaque jour qui passe l'enrichit.",
    s2t: "Reconstruction en direct",
    s2p: "Pour les longues périodes, l'app reconstruit aussi le passé avec les prix historiques des marchés et vos transactions — ce que valait ce que vous déteniez, le jour où vous le déteniez. Les deux méthodes se complètent : snapshots pour le détail fin, reconstruction pour la longue histoire.",
    s3t: "Le filet de sécurité",
    s3p: "Si les sources de prix échouent sur un tronçon du graphique, l'app utilise les snapshots enregistrés au lieu d'inventer des valeurs — et le signale par un avis sur le graphique lui-même. Nous préférons un graphique honnête à un graphique joli.",
    s4t: "Les fenêtres de temps",
    s4p: "Dans le panneau avancé, vous choisissez la fenêtre : de 15 minutes (l'intrajournalier du jour) à ALL (toute l'histoire depuis le début). Chaque fenêtre agrège les données au bon rythme pour bien se lire.",
    s5t: "Une ligne par classe",
    s5p: "L'évolution sépare actions, crypto, ETF et liquidités en lignes propres, avec les mêmes couleurs que partout — un mauvais jour, vous voyez tout de suite si c'est la crypto qui a tiré vers le bas ou si tout a chuté.",
    s6t: "L'historique vaut ce que valent vos transactions",
    s6p: "Le coût moyen, le P&L et la reconstruction naissent de vos transactions. Des dates et prix d'achat corrects donnent un passé correct ; si vous corrigez une vieille transaction, l'historique se recalcule — fidèle à ce que vous avez enregistré, pas à un souvenir.",
    note: "Ceci est de l'éducation sur l'outil, pas du conseil en investissement personnalisé.",
    back: "← Toutes les aides", cta_app: "Ouvrir le Tableau de bord", cta_anon: "Commencer gratuitement",
  },
  de: {
    crumb: "Hilfe", title: "Verlauf & Snapshots: wie die App sich dein Vermögen merkt",
    lead: "Das Entwicklungsdiagramm entsteht nicht durch Magie: Die App speichert alle 15 Minuten Fotografien deines Portfoliowerts und rekonstruiert die Vergangenheit, wenn nötig.",
    why: "Zu wissen, wo du stehst, bedeutet nur neben dem etwas, wo du standest. Der Verlauf macht aus losen Zahlen eine Bahn — und es lohnt sich zu wissen, wie er entsteht, um dem zu vertrauen, was du siehst.",
    where_label: "Wo es in der App steht:", where: "im Dashboard („Portfolio-Entwicklung“) und, detaillierter, im erweiterten Panel (Fenster von 15 Minuten bis ALL).",
    s1t: "Snapshots alle 15 Minuten",
    s1p: "Sobald dein Konto existiert, wird der Gesamtwert des Portfolios (und jeder Klasse) alle 15 Minuten gespeichert. Deshalb hat ein neues Konto ein kurzes Diagramm: Der Verlauf entsteht ab deinem ersten Tag — jeder weitere Tag macht ihn reicher.",
    s2t: "Live-Rekonstruktion",
    s2p: "Für lange Zeiträume rekonstruiert die App die Vergangenheit auch aus historischen Marktpreisen und deinen Transaktionen — was dein Bestand wert war, an dem Tag, an dem du ihn hieltest. Beide Methoden ergänzen sich: Snapshots fürs feine Detail, Rekonstruktion für die lange Geschichte.",
    s3t: "Das Sicherheitsnetz",
    s3p: "Fallen die Preisquellen für einen Abschnitt des Diagramms aus, nutzt die App die gespeicherten Snapshots, statt Werte zu erfinden — und markiert das mit einem Hinweis direkt im Diagramm. Uns ist ein ehrliches Diagramm lieber als ein schönes.",
    s4t: "Die Zeitfenster",
    s4p: "Im erweiterten Panel wählst du das Fenster: von 15 Minuten (der heutige Intraday) bis ALL (die ganze Geschichte seit Beginn). Jedes Fenster verdichtet die Daten im richtigen Takt, damit es sich gut liest.",
    s5t: "Eine Linie pro Klasse",
    s5p: "Die Entwicklung trennt Aktien, Krypto, ETFs und Liquidität in eigene Linien, mit denselben Farben wie überall — an einem schlechten Tag siehst du sofort, ob Krypto nach unten zog oder alles fiel.",
    s6t: "Der Verlauf ist so gut wie deine Transaktionen",
    s6p: "Durchschnittskosten, P&L und die Rekonstruktion entstehen aus deinen Transaktionen. Korrekte Kaufdaten und -preise ergeben eine korrekte Vergangenheit; korrigierst du eine alte Transaktion, rechnet der Verlauf neu — treu dem, was du erfasst hast, nicht einer Erinnerung.",
    note: "Das ist Wissensvermittlung über das Werkzeug, keine persönliche Anlageberatung.",
    back: "← Alle Hilfen", cta_app: "Dashboard öffnen", cta_anon: "Kostenlos starten",
  },
  it: {
    crumb: "Aiuto", title: "Storico e snapshot: come l'app ricorda il tuo patrimonio",
    lead: "Il grafico di evoluzione non nasce per magia: l'app salva fotografie del valore del portafoglio ogni 15 minuti e ricostruisce il passato quando serve.",
    why: "Sapere dove sei ha senso solo accanto a dove eri. È lo storico a trasformare numeri sparsi in una traiettoria — e vale la pena sapere come si costruisce, per fidarti di ciò che vedi.",
    where_label: "Dove si trova nell'app:", where: "nella Dashboard («Evoluzione del Portafoglio») e, con più dettaglio, nel pannello avanzato (finestre da 15 minuti ad ALL).",
    s1t: "Snapshot ogni 15 minuti",
    s1p: "Da quando il tuo account esiste, il valore totale del portafoglio (e di ogni classe) viene salvato ogni 15 minuti. Per questo un account nuovo ha un grafico corto: lo storico si costruisce dal giorno in cui entri — ogni giorno che passa lo arricchisce.",
    s2t: "Ricostruzione dal vivo",
    s2p: "Per i periodi lunghi, l'app ricostruisce il passato anche con i prezzi storici dei mercati e le tue transazioni — quanto valeva ciò che avevi, il giorno in cui lo avevi. I due metodi si completano: snapshot per il dettaglio fine, ricostruzione per la storia lunga.",
    s3t: "La rete di sicurezza",
    s3p: "Se le fonti dei prezzi falliscono su un tratto del grafico, l'app usa gli snapshot salvati invece di inventare valori — e lo segnala con un avviso sul grafico stesso. Preferiamo un grafico onesto a uno bello.",
    s4t: "Le finestre temporali",
    s4p: "Nel pannello avanzato scegli la finestra: da 15 minuti (l'intraday di oggi) ad ALL (tutta la storia dall'inizio). Ogni finestra aggrega i dati al ritmo giusto per leggersi bene.",
    s5t: "Una linea per classe",
    s5p: "L'evoluzione separa azioni, cripto, ETF e liquidità in linee proprie, con gli stessi colori di sempre — in una giornata storta vedi subito se è stata la cripto a tirare giù o se è caduto tutto.",
    s6t: "Lo storico vale quanto le transazioni",
    s6p: "Costo medio, P&L e ricostruzione nascono dalle tue transazioni. Date e prezzi d'acquisto corretti danno un passato corretto; se correggi una vecchia transazione, lo storico si ricalcola — fedele a ciò che hai registrato, non a un ricordo.",
    note: "Questa è formazione sullo strumento, non consulenza d'investimento personalizzata.",
    back: "← Tutte le guide", cta_app: "Apri la Dashboard", cta_anon: "Inizia gratis",
  },
  es: {
    crumb: "Ayuda", title: "Histórico y snapshots: cómo la app recuerda tu patrimonio",
    lead: "El gráfico de evolución no nace por magia: la app guarda fotografías del valor de la cartera cada 15 minutos y reconstruye el pasado cuando hace falta.",
    why: "Saber dónde estás solo significa algo junto a dónde estabas. El histórico convierte números sueltos en una trayectoria — y merece la pena saber cómo se construye para fiarte de lo que ves.",
    where_label: "Dónde está en la app:", where: "en el Panel («Evolución del Portafolio») y, con más detalle, en el panel avanzado (ventanas de 15 minutos a ALL).",
    s1t: "Snapshots cada 15 minutos",
    s1p: "Desde que tu cuenta existe, el valor total de la cartera (y de cada clase) se guarda cada 15 minutos. Por eso una cuenta nueva tiene un gráfico corto: el histórico se construye desde el día en que entras — cada día que pasa lo enriquece.",
    s2t: "Reconstrucción en vivo",
    s2p: "Para períodos largos, la app también reconstruye el pasado con los precios históricos de los mercados y tus transacciones — cuánto valía lo que tenías, el día en que lo tenías. Los dos métodos se completan: snapshots para el detalle fino, reconstrucción para la historia larga.",
    s3t: "La red de seguridad",
    s3p: "Si las fuentes de precios fallan en un tramo del gráfico, la app usa los snapshots guardados en vez de inventar valores — y lo señala con un aviso en el propio gráfico. Preferimos un gráfico honesto a uno bonito.",
    s4t: "Las ventanas de tiempo",
    s4p: "En el panel avanzado eliges la ventana: de 15 minutos (el intradía de hoy) a ALL (toda la historia desde el inicio). Cada ventana agrega los datos al ritmo justo para leerse bien.",
    s5t: "Una línea por clase",
    s5p: "La evolución separa acciones, cripto, ETFs y liquidez en líneas propias, con los mismos colores de siempre — en un mal día ves enseguida si fue la cripto la que tiró hacia abajo o si cayó todo.",
    s6t: "El histórico vale lo que valen tus transacciones",
    s6p: "El coste medio, el P&L y la reconstrucción nacen de tus transacciones. Fechas y precios de compra correctos dan un pasado correcto; si corriges una transacción antigua, el histórico se recalcula — fiel a lo que registraste, no a un recuerdo.",
    note: "Esto es educación sobre la herramienta, no asesoramiento de inversión personalizado.",
    back: "← Todas las ayudas", cta_app: "Abrir el Panel", cta_anon: "Empezar gratis",
  },
};

export default function AjudasHistorico() {
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
            <Link to="/dashboard" className={BTN}>{c.cta_app}</Link>
          ) : (
            <Link to="/register" className={BTN}>{c.cta_anon}</Link>
          )}
        </div>
      </div>
    </div>
  );
}

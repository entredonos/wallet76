import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../context/I18nContext";
import { useAuth } from "../context/AuthContext";
import { PublicHeader, Step, WhereBox, BTN } from "../components/AjudasKit";

// Artigo de ajuda: Primeiros passos (/ajudas/primeiros-passos) — 2 ago 2026.
// Escrito a partir do fluxo REAL de onboarding (chaves onboarding.* do
// I18nContext + Wallets/CSVImport): registo → confirmar email → nome da
// primeira carteira → «Onde tens os teus investimentos hoje?» → 3 caminhos
// (corretora só-leitura / importar ficheiro / à mão). Plano gratuito = 1
// carteira (wallets.limit_msg). REGRA #9: se o onboarding mudar, isto muda.

const COPY = {
  pt: {
    crumb: "Ajudas", title: "Primeiros passos: da conta vazia ao painel a mexer",
    lead: "Da criação da conta até veres o teu dinheiro no ecrã são uns minutos. Este guia percorre o caminho todo — pelos três atalhos possíveis.",
    why: "A app só é útil com os teus ativos lá dentro. O objetivo desta página é uma coisa só: chegar ao primeiro ativo o mais depressa possível.",
    where_label: "Onde começa:", where: "wallet76.com → «Começar grátis».",
    s1t: "Cria a conta e confirma o email",
    s1p: "Regista-te com email e password. Recebes um email de confirmação — abre o link e a conta fica verificada. Sem isso alguns envios (alertas, avisos) ficam à espera.",
    s2t: "Dá um nome à primeira carteira",
    s2p: "A app pergunta logo: «Vamos começar por dar um nome à tua primeira carteira?». Uma carteira é uma corretora, exchange ou um contentor teu — «Binance», «Interactive Brokers», «Reforma», «Poupança dos miúdos». O plano gratuito inclui 1 carteira; o Pro não tem limite.",
    s3t: "Escolhe como pôr os ativos",
    s3p: "Há três caminhos, e podes mudar depois: ligar a corretora (API só de leitura — a app importa posições, nunca mexe no teu dinheiro), importar um ficheiro (CSV, HTML ou XLSX exportado do XTB, DEGIRO, eToro, Revolut, Binance, Interactive Brokers, Ledger Live…) ou adicionar à mão, posição a posição.",
    s4t: "À mão: a primeira transação",
    s4p: "Escolhe o ativo (pesquisa por símbolo ou nome), escreve a quantidade e o preço a que compraste, e a data. É desta transação que nascem o custo médio e o P&L — datas e preços certos dão números certos.",
    s5t: "Vê o painel ganhar vida",
    s5p: "Com o primeiro ativo dentro, o painel e a evolução começam a preencher-se sozinhos — a app guarda o valor da carteira a cada 15 minutos, por isso o gráfico cresce a partir do dia em que entras.",
    s6t: "Os próximos passos",
    s6p: "Com a carteira a mexer: define os alvos na Alocação, cria alertas de preço, espreita o calendário de Dividendos e explora o painel avançado — cada um destes tem um artigo próprio nesta central.",
    note: "Isto é educação sobre a ferramenta, não aconselhamento de investimento personalizado.",
    back: "← Todas as ajudas", cta_app: "Abrir o Painel", cta_anon: "Criar a minha conta",
  },
  en: {
    crumb: "Help", title: "First steps: from empty account to a living dashboard",
    lead: "From creating the account to seeing your money on screen takes minutes. This guide walks the whole path — through all three shortcuts.",
    why: "The app is only useful with your assets inside. This page has one goal: get you to your first asset as fast as possible.",
    where_label: "Where it starts:", where: "wallet76.com → “Start for free”.",
    s1t: "Create the account and confirm your email",
    s1p: "Sign up with email and password. You'll get a confirmation email — open the link and the account is verified. Without it, some sends (alerts, notices) stay on hold.",
    s2t: "Name your first wallet",
    s2p: "The app asks right away: name your first wallet. A wallet is a broker, an exchange or a container of your own — “Binance”, “Interactive Brokers”, “Retirement”, “Kids' savings”. The free plan includes 1 wallet; Pro has no limit.",
    s3t: "Choose how to add your assets",
    s3p: "There are three paths, and you can switch later: connect your broker (read-only API — the app imports positions, never touches your money), import a file (CSV, HTML or XLSX exported from XTB, DEGIRO, eToro, Revolut, Binance, Interactive Brokers, Ledger Live…) or add by hand, position by position.",
    s4t: "By hand: your first transaction",
    s4p: "Pick the asset (search by symbol or name), type the quantity, the price you paid and the date. Average cost and P&L are born from this transaction — right dates and prices give right numbers.",
    s5t: "Watch the dashboard come alive",
    s5p: "With the first asset in, the dashboard and the evolution chart start filling themselves — the app saves your portfolio value every 15 minutes, so the chart grows from the day you join.",
    s6t: "What comes next",
    s6p: "With the portfolio moving: set targets in Allocation, create price alerts, check the Dividends calendar and explore the advanced panel — each has its own article in this help center.",
    note: "This is education about the tool, not personalised investment advice.",
    back: "← All help topics", cta_app: "Open the Dashboard", cta_anon: "Create my account",
  },
  fr: {
    crumb: "Aide", title: "Premiers pas : du compte vide au tableau de bord vivant",
    lead: "De la création du compte à votre argent à l'écran, il faut quelques minutes. Ce guide parcourt tout le chemin — par les trois raccourcis possibles.",
    why: "L'app n'est utile qu'avec vos actifs dedans. Cette page n'a qu'un objectif : vous amener au premier actif le plus vite possible.",
    where_label: "Où ça commence :", where: "wallet76.com → « Commencer gratuitement ».",
    s1t: "Créez le compte et confirmez l'email",
    s1p: "Inscrivez-vous avec email et mot de passe. Vous recevez un email de confirmation — ouvrez le lien et le compte est vérifié. Sans cela, certains envois (alertes, avis) restent en attente.",
    s2t: "Nommez votre premier portefeuille",
    s2p: "L'app demande tout de suite un nom pour votre premier portefeuille. Un portefeuille est un courtier, un exchange ou un contenant à vous — « Binance », « Interactive Brokers », « Retraite », « Épargne des enfants ». Le plan gratuit inclut 1 portefeuille ; Pro n'a pas de limite.",
    s3t: "Choisissez comment ajouter vos actifs",
    s3p: "Trois chemins, interchangeables : connecter le courtier (API en lecture seule — l'app importe les positions, ne touche jamais à votre argent), importer un fichier (CSV, HTML ou XLSX exporté de XTB, DEGIRO, eToro, Revolut, Binance, Interactive Brokers, Ledger Live…) ou ajouter à la main, position par position.",
    s4t: "À la main : la première transaction",
    s4p: "Choisissez l'actif (recherche par symbole ou nom), saisissez la quantité, le prix payé et la date. Le coût moyen et le P&L naissent de cette transaction — dates et prix justes donnent des chiffres justes.",
    s5t: "Regardez le tableau de bord prendre vie",
    s5p: "Avec le premier actif dedans, le tableau de bord et l'évolution se remplissent tout seuls — l'app enregistre la valeur du portefeuille toutes les 15 minutes, le graphique grandit donc dès le jour de votre arrivée.",
    s6t: "La suite",
    s6p: "Avec le portefeuille en mouvement : fixez des objectifs dans l'Allocation, créez des alertes de prix, regardez le calendrier des Dividendes et explorez le panneau avancé — chacun a son article dans ce centre d'aide.",
    note: "Ceci est de l'éducation sur l'outil, pas du conseil en investissement personnalisé.",
    back: "← Toutes les aides", cta_app: "Ouvrir le Tableau de bord", cta_anon: "Créer mon compte",
  },
  de: {
    crumb: "Hilfe", title: "Erste Schritte: vom leeren Konto zum lebendigen Dashboard",
    lead: "Von der Kontoerstellung bis zu deinem Geld auf dem Bildschirm sind es Minuten. Dieser Leitfaden geht den ganzen Weg — über alle drei Abkürzungen.",
    why: "Die App ist nur mit deinen Vermögenswerten darin nützlich. Diese Seite hat ein Ziel: dich so schnell wie möglich zum ersten Wert zu bringen.",
    where_label: "Wo es losgeht:", where: "wallet76.com → „Kostenlos starten“.",
    s1t: "Konto anlegen und E-Mail bestätigen",
    s1p: "Registriere dich mit E-Mail und Passwort. Du bekommst eine Bestätigungs-E-Mail — öffne den Link und das Konto ist verifiziert. Ohne das bleiben manche Sendungen (Alarme, Hinweise) in Wartestellung.",
    s2t: "Dem ersten Depot einen Namen geben",
    s2p: "Die App fragt sofort nach einem Namen für dein erstes Depot. Ein Depot ist ein Broker, eine Börse oder ein eigener Behälter — „Binance“, „Interactive Brokers“, „Rente“, „Sparen für die Kinder“. Der Gratisplan enthält 1 Depot; Pro hat kein Limit.",
    s3t: "Wählen, wie die Werte hineinkommen",
    s3p: "Drei Wege, später wechselbar: Broker verbinden (Nur-Lese-API — die App importiert Positionen, rührt dein Geld nie an), Datei importieren (CSV, HTML oder XLSX aus XTB, DEGIRO, eToro, Revolut, Binance, Interactive Brokers, Ledger Live…) oder von Hand, Position für Position.",
    s4t: "Von Hand: die erste Transaktion",
    s4p: "Wähle den Wert (Suche nach Symbol oder Name), gib Menge, gezahlten Preis und Datum ein. Aus dieser Transaktion entstehen Durchschnittskosten und P&L — richtige Daten und Preise ergeben richtige Zahlen.",
    s5t: "Zusehen, wie das Dashboard lebendig wird",
    s5p: "Mit dem ersten Wert drin füllen sich Dashboard und Entwicklung von selbst — die App speichert den Portfoliowert alle 15 Minuten, das Diagramm wächst also ab deinem ersten Tag.",
    s6t: "Die nächsten Schritte",
    s6p: "Mit laufendem Portfolio: Ziele in der Allokation setzen, Preisalarme anlegen, den Dividendenkalender ansehen und das erweiterte Panel erkunden — jedes davon hat einen eigenen Artikel in diesem Hilfe-Center.",
    note: "Das ist Wissensvermittlung über das Werkzeug, keine persönliche Anlageberatung.",
    back: "← Alle Hilfen", cta_app: "Dashboard öffnen", cta_anon: "Mein Konto anlegen",
  },
  it: {
    crumb: "Aiuto", title: "Primi passi: dal conto vuoto alla dashboard viva",
    lead: "Dalla creazione dell'account ai tuoi soldi sullo schermo servono minuti. Questa guida percorre tutta la strada — per le tre scorciatoie possibili.",
    why: "L'app è utile solo con i tuoi asset dentro. Questa pagina ha un solo obiettivo: portarti al primo asset il più in fretta possibile.",
    where_label: "Dove si comincia:", where: "wallet76.com → «Inizia gratis».",
    s1t: "Crea l'account e conferma l'email",
    s1p: "Registrati con email e password. Ricevi un'email di conferma — apri il link e l'account è verificato. Senza, alcuni invii (avvisi, notifiche) restano in attesa.",
    s2t: "Dai un nome al primo portafoglio",
    s2p: "L'app chiede subito un nome per il tuo primo portafoglio. Un portafoglio è un broker, un exchange o un contenitore tuo — «Binance», «Interactive Brokers», «Pensione», «Risparmi dei bambini». Il piano gratuito include 1 portafoglio; Pro non ha limiti.",
    s3t: "Scegli come mettere gli asset",
    s3p: "Tre strade, intercambiabili: collegare il broker (API in sola lettura — l'app importa le posizioni, non tocca mai i tuoi soldi), importare un file (CSV, HTML o XLSX esportato da XTB, DEGIRO, eToro, Revolut, Binance, Interactive Brokers, Ledger Live…) o aggiungere a mano, posizione per posizione.",
    s4t: "A mano: la prima transazione",
    s4p: "Scegli l'asset (cerca per simbolo o nome), scrivi quantità, prezzo pagato e data. Da questa transazione nascono costo medio e P&L — date e prezzi giusti danno numeri giusti.",
    s5t: "Guarda la dashboard prendere vita",
    s5p: "Con il primo asset dentro, dashboard ed evoluzione si riempiono da sole — l'app salva il valore del portafoglio ogni 15 minuti, quindi il grafico cresce dal giorno in cui entri.",
    s6t: "I prossimi passi",
    s6p: "Con il portafoglio in moto: imposta gli obiettivi nell'Allocazione, crea avvisi di prezzo, guarda il calendario dei Dividendi ed esplora il pannello avanzato — ognuno ha il suo articolo in questo centro assistenza.",
    note: "Questa è formazione sullo strumento, non consulenza d'investimento personalizzata.",
    back: "← Tutte le guide", cta_app: "Apri la Dashboard", cta_anon: "Creare il mio account",
  },
  es: {
    crumb: "Ayuda", title: "Primeros pasos: de la cuenta vacía al panel en marcha",
    lead: "De crear la cuenta a ver tu dinero en pantalla van unos minutos. Esta guía recorre todo el camino — por los tres atajos posibles.",
    why: "La app solo es útil con tus activos dentro. Esta página tiene un único objetivo: llevarte al primer activo lo antes posible.",
    where_label: "Dónde empieza:", where: "wallet76.com → «Empezar gratis».",
    s1t: "Crea la cuenta y confirma el email",
    s1p: "Regístrate con email y contraseña. Recibirás un email de confirmación — abre el enlace y la cuenta queda verificada. Sin eso, algunos envíos (alertas, avisos) quedan en espera.",
    s2t: "Ponle nombre a tu primera cartera",
    s2p: "La app pregunta enseguida el nombre de tu primera cartera. Una cartera es un broker, un exchange o un contenedor tuyo — «Binance», «Interactive Brokers», «Jubilación», «Ahorro de los niños». El plan gratuito incluye 1 cartera; Pro no tiene límite.",
    s3t: "Elige cómo meter los activos",
    s3p: "Hay tres caminos, intercambiables: conectar el broker (API de solo lectura — la app importa posiciones, nunca toca tu dinero), importar un archivo (CSV, HTML o XLSX exportado de XTB, DEGIRO, eToro, Revolut, Binance, Interactive Brokers, Ledger Live…) o añadir a mano, posición a posición.",
    s4t: "A mano: la primera transacción",
    s4p: "Elige el activo (busca por símbolo o nombre), escribe la cantidad, el precio pagado y la fecha. De esta transacción nacen el coste medio y el P&L — fechas y precios correctos dan números correctos.",
    s5t: "Mira el panel cobrar vida",
    s5p: "Con el primer activo dentro, el panel y la evolución se rellenan solos — la app guarda el valor de la cartera cada 15 minutos, así que el gráfico crece desde el día en que entras.",
    s6t: "Los siguientes pasos",
    s6p: "Con la cartera en marcha: define objetivos en la Asignación, crea alertas de precio, mira el calendario de Dividendos y explora el panel avanzado — cada uno tiene su artículo en este centro de ayuda.",
    note: "Esto es educación sobre la herramienta, no asesoramiento de inversión personalizado.",
    back: "← Todas las ayudas", cta_app: "Abrir el Panel", cta_anon: "Crear mi cuenta",
  },
};

export default function AjudasPrimeirosPassos() {
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

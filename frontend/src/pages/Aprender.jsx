import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../context/I18nContext";

// Página pública de educação financeira ("Aprender"), acessível sem login —
// como o /pricing. Objetivo duplo: apoiar quem está a começar E ser encontrada
// no Google (simulador de juros compostos + carteiras-tipo são pesquisas com
// volume real, ao contrário de "wallet76").
//
// Segue o padrão do Pricing.jsx: dicionário COPY próprio com as 6 línguas
// (REGRA #1), em vez de chaves no I18nContext — é conteúdo longo de página
// pública, não texto de UI partilhado.
//
// NOTA LEGAL, deliberada e não negociável: isto é EDUCAÇÃO, nunca
// "aconselhamento". Recomendação de investimento personalizada é atividade
// regulada (CMVM/DMIF); conteúdo educativo genérico com disclaimer é prática
// corrente e segura. Daí o selo no topo, o disclaimer no fim, e as carteiras
// apresentadas como "pontos de partida típicos", nunca como receitas.

// Paleta categórica validada (dataviz, 30 jul 2026): cores por CLASSE DE
// ATIVO, fixas — a mesma classe tem sempre a mesma cor em toda a página.
const PAL = { obr: "#3b82f6", acc: "#8b5cf6", imo: "#d97706", cri: "#ec4899", liq: "#059669" };

const LOCALES = { pt: "pt-PT", en: "en-IE", fr: "fr-FR", de: "de-DE", it: "it-IT", es: "es-ES" };

// Carteiras-tipo. As percentagens são os pontos de partida clássicos da
// literatura (60/40 e variantes europeias); as taxas são médias históricas de
// longo prazo arredondadas por baixo — ver COPY.rates_note.
const PROFILES = {
  cons: { rate: 3.5, parts: [["obr", 75], ["acc", 15], ["liq", 10]] },
  mod: { rate: 5.5, parts: [["obr", 45], ["acc", 40], ["imo", 10], ["liq", 5]] },
  s7030: { rate: 6.5, parts: [["acc7030", 70], ["obr", 30]] },
  agr: { rate: 8, parts: [["acc", 70], ["imo", 10], ["cri", 10], ["obr", 5], ["liq", 5]] },
};
const PROFILE_ORDER = ["cons", "mod", "s7030", "agr"];
const TABS = [
  { key: "dep", rate: 2.5 },
  { key: "cons", rate: 3.5 },
  { key: "mod", rate: 5.5 },
  { key: "s7030", rate: 6.5 },
  { key: "agr", rate: 8 },
];

const COPY = {
  pt: {
    doc_title: "Aprender a investir — simulador e carteiras-tipo | Wallet76",
    badge: "Conteúdo educativo — não é aconselhamento financeiro",
    title: "Quanto pode render o teu dinheiro?",
    sub: "Simula com os teus números, percebe os perfis de risco e vê onde a cripto encaixa. Sem jargão e sem promessas.",
    back: "Voltar ao site", start: "Começar grátis",
    assets: { obr: "Obrigações e depósitos", acc: "Ações e ETFs", acc7030: "Ações e ETFs (globais)", imo: "Imobiliário (REITs)", cri: "Cripto", liq: "Liquidez" },
    tabs: { dep: "Só depósitos", cons: "Conservador", mod: "Moderado", s7030: "70/30", agr: "Agressivo" },
    sim: {
      initial: "Montante inicial (€)", monthly: "Poupança mensal (€)", years: "Prazo (anos)", rate: "Retorno anual (%)",
      cta: "Acompanhar a minha carteira →", nocard: "Grátis, sem cartão",
      fv: "Valor estimado no fim", invested: "Investido por ti", interest: "Juros gerados",
      total: "Valor total", only_inv: "Só o que investiste", yr: "a",
      comp: "Nos depósitos a ~2,5%, os mesmos números dariam {dep}. A diferença — {diff} — é o custo de não investir. (E a inflação morde os dois.)",
    },
    profiles: {
      title: "Que carteira combina contigo?",
      sub: "Quatro carteiras-tipo com percentagens típicas — pontos de partida educativos, não receitas.",
      use_rate: "Usar esta taxa no simulador ↑",
      names: { cons: "Conservador", mod: "Moderado", s7030: "70/30", agr: "Agressivo" },
      tags: { cons: "Sem sustos", mod: "Equilíbrio", s7030: "Simples e eficaz", agr: "10+ anos" },
      why_label: "Porquê assim:",
      why: {
        cons: "a fatia grande em obrigações e depósitos amortece as quedas; os 15% de ações dão crescimento acima da inflação. Para dinheiro com prazo curto — ou para dormir descansado. Retorno histórico típico ~3–4%/ano.",
        mod: "metade defende, metade ataca. Captura boa parte do crescimento das ações com cerca de metade dos sustos. Retorno histórico típico ~5–6%/ano, horizonte 5+ anos.",
        s7030: "a receita mais simples que funciona — 70% num ETF global de ações, 30% em obrigações. Dois produtos, rebalancear uma vez por ano, historicamente ~6–7%/ano. A favorita de quem não quer pensar nisto todos os dias.",
        agr: "com 10+ anos, as quedas — que vão acontecer, e podem passar de −30% — têm tempo para recuperar. A cripto entra, mas limitada a 10% (vê a secção abaixo). Retorno histórico típico ~7–9%/ano, com estômago.",
      },
    },
    crypto: {
      title: "E a cripto, onde entra?",
      sub: "Entra — como fatia da carteira, não como carteira. A pergunta certa não é “invisto em cripto?”, é “quantos % aguento?”.",
      winter_title: "O que um inverno cripto (−70%) faz à carteira toda",
      winter_sub: "Mesma carteira agressiva, três doses de cripto:",
      w0: "carteira cai −0 pts por via da cripto", w10: "−7 pts — recuperável", w30: "−21 pts — anos de poupança apagados",
      winter_p: "É por isto que as carteiras-tipo limitam a cripto a 5–10%: chega para participar na subida, não chega para um mau ciclo destruir o plano. Quedas de 70–80% já aconteceram três vezes desde 2013.",
      rules_title: "Regras práticas que se aprendem à bruta",
      r1t: "Percentagem primeiro, moeda depois.", r1: "Decide os % da carteira antes de discutir se é BTC, ETH ou outra.",
      r2t: "Rebalancear é vender caro.", r2: "Se a cripto disparar e passar de 10% para 25% da carteira, rebalancear obriga-te a realizar ganhos — automático e sem emoção.",
      r3t: "Nunca com dinheiro de prazo curto.", r3: "Cripto é a última fatia a entrar, depois do fundo de emergência e do resto do plano.",
      app_note: "No Wallet76, a cripto vive ao lado das ações e ETFs — Binance, Bybit e a tua corretora na mesma carteira, com a % de cada classe sempre à vista.",
    },
    alloc: {
      title: "Do plano à disciplina — o teu gráfico de Alocação",
      sub: "Escolher a carteira é o passo fácil. Mantê-la é o que dá dinheiro — e é para isso que serve o painel de Alocação.",
      example: "Exemplo: carteira real vs plano moderado (o traço │ é o plano)",
      orient: { up: "Reforçar", down: "Aliviar", ok: "No alvo" },
      c1t: "A barra é o que tens", c1: "— todas as corretoras somadas, atualizado com preços em tempo real.",
      c2t: "O traço │ é o teu plano", c2: "— as % sugeridas que definiste (podes começar por uma carteira-tipo desta página).",
      c3t: "A orientação diz o resto", c3: "— fugiu mais de 5 pontos: “Reforçar” ou “Aliviar”. Perto do alvo: em paz. Rebalancear é coisa de poucas vezes por ano.",
      cta: "Criar a minha carteira grátis", cta_sub: "2 minutos, sem cartão. Importa da corretora ou regista à mão.",
    },
    disclaimer: "Nota importante: esta página é conteúdo educativo genérico e não constitui aconselhamento financeiro, recomendação de investimento ou oferta. As taxas usadas são médias históricas de longo prazo, não promessas; rentabilidades passadas não garantem rentabilidades futuras. Investir envolve risco de perda, e a cripto em particular pode perder a maior parte do valor. Considera a tua situação pessoal e, se necessário, um profissional habilitado.",
  },
  en: {
    doc_title: "Learn to invest — simulator & model portfolios | Wallet76",
    badge: "Educational content — not financial advice",
    title: "How much could your money grow?",
    sub: "Run your own numbers, understand risk profiles, and see where crypto fits. No jargon, no promises.",
    back: "Back to site", start: "Start for free",
    assets: { obr: "Bonds & deposits", acc: "Stocks & ETFs", acc7030: "Stocks & ETFs (global)", imo: "Real estate (REITs)", cri: "Crypto", liq: "Cash" },
    tabs: { dep: "Deposits only", cons: "Conservative", mod: "Moderate", s7030: "70/30", agr: "Aggressive" },
    sim: {
      initial: "Starting amount (€)", monthly: "Monthly savings (€)", years: "Horizon (years)", rate: "Annual return (%)",
      cta: "Track my portfolio →", nocard: "Free, no card needed",
      fv: "Estimated final value", invested: "What you put in", interest: "Interest earned",
      total: "Total value", only_inv: "Just what you invested", yr: "y",
      comp: "In deposits at ~2.5%, the same numbers would give {dep}. The difference — {diff} — is the cost of not investing. (And inflation bites both.)",
    },
    profiles: {
      title: "Which portfolio fits you?",
      sub: "Four model portfolios with typical percentages — educational starting points, not recipes.",
      use_rate: "Use this rate in the simulator ↑",
      names: { cons: "Conservative", mod: "Moderate", s7030: "70/30", agr: "Aggressive" },
      tags: { cons: "No surprises", mod: "Balanced", s7030: "Simple & effective", agr: "10+ years" },
      why_label: "Why it looks like this:",
      why: {
        cons: "the large slice of bonds and deposits cushions the falls; the 15% in stocks keeps you ahead of inflation. For short-horizon money — or for sleeping well. Typical historical return ~3–4%/yr.",
        mod: "half defends, half attacks. Captures much of the stock market's growth with roughly half the scares. Typical historical return ~5–6%/yr, horizon 5+ years.",
        s7030: "the simplest recipe that works — 70% in a global equity ETF, 30% in bonds. Two products, rebalance once a year, historically ~6–7%/yr. The favourite of people who don't want to think about this daily.",
        agr: "with 10+ years, the falls — which will happen, and can exceed −30% — have time to recover. Crypto is included but capped at 10% (see below). Typical historical return ~7–9%/yr, strong stomach required.",
      },
    },
    crypto: {
      title: "And crypto — where does it fit?",
      sub: "It fits — as a slice of the portfolio, not as the portfolio. The right question isn't “should I buy crypto?”, it's “what % can I stomach?”.",
      winter_title: "What a crypto winter (−70%) does to the whole portfolio",
      winter_sub: "Same aggressive portfolio, three doses of crypto:",
      w0: "portfolio loses −0 pts via crypto", w10: "−7 pts — recoverable", w30: "−21 pts — years of savings erased",
      winter_p: "This is why model portfolios cap crypto at 5–10%: enough to participate in the upside, not enough for one bad cycle to destroy the plan. Drops of 70–80% have happened three times since 2013.",
      rules_title: "Practical rules people learn the hard way",
      r1t: "Percentage first, coin second.", r1: "Decide the portfolio % before debating BTC vs ETH vs anything else.",
      r2t: "Rebalancing means selling high.", r2: "If crypto surges from 10% to 25% of your portfolio, rebalancing forces you to take profits — automatic and emotion-free.",
      r3t: "Never with short-term money.", r3: "Crypto is the last slice in, after the emergency fund and the rest of the plan.",
      app_note: "In Wallet76, crypto lives next to your stocks and ETFs — Binance, Bybit and your broker in one portfolio, with each asset class's % always visible.",
    },
    alloc: {
      title: "From plan to discipline — your Allocation chart",
      sub: "Choosing a portfolio is the easy part. Sticking to it is what pays — and that's what the Allocation panel is for.",
      example: "Example: real portfolio vs moderate plan (the │ mark is the plan)",
      orient: { up: "Add", down: "Trim", ok: "On target" },
      c1t: "The bar is what you own", c1: "— all brokers combined, updated with live prices.",
      c2t: "The │ mark is your plan", c2: "— the target % you set (you can start from a model portfolio on this page).",
      c3t: "The guidance does the rest", c3: "— drifted more than 5 points: “Add” or “Trim”. Close to target: at peace. Rebalancing is a few-times-a-year thing.",
      cta: "Create my free portfolio", cta_sub: "2 minutes, no card. Import from your broker or add manually.",
    },
    disclaimer: "Important note: this page is generic educational content and does not constitute financial advice, an investment recommendation or an offer. The rates used are long-term historical averages, not promises; past performance does not guarantee future results. Investing involves risk of loss, and crypto in particular can lose most of its value. Consider your personal situation and, if needed, a licensed professional.",
  },
  fr: {
    doc_title: "Apprendre à investir — simulateur et portefeuilles types | Wallet76",
    badge: "Contenu éducatif — pas un conseil financier",
    title: "Combien votre argent peut-il rapporter ?",
    sub: "Simulez avec vos chiffres, comprenez les profils de risque et voyez où la crypto s'intègre. Sans jargon et sans promesses.",
    back: "Retour au site", start: "Commencer gratuitement",
    assets: { obr: "Obligations et dépôts", acc: "Actions et ETF", acc7030: "Actions et ETF (monde)", imo: "Immobilier (REIT)", cri: "Crypto", liq: "Liquidités" },
    tabs: { dep: "Dépôts seuls", cons: "Prudent", mod: "Équilibré", s7030: "70/30", agr: "Dynamique" },
    sim: {
      initial: "Montant initial (€)", monthly: "Épargne mensuelle (€)", years: "Durée (années)", rate: "Rendement annuel (%)",
      cta: "Suivre mon portefeuille →", nocard: "Gratuit, sans carte",
      fv: "Valeur estimée à la fin", invested: "Ce que vous versez", interest: "Intérêts générés",
      total: "Valeur totale", only_inv: "Vos versements seuls", yr: "a",
      comp: "Sur des dépôts à ~2,5 %, les mêmes chiffres donneraient {dep}. La différence — {diff} — c'est le coût de ne pas investir. (Et l'inflation mord les deux.)",
    },
    profiles: {
      title: "Quel portefeuille vous ressemble ?",
      sub: "Quatre portefeuilles types avec des pourcentages typiques — des points de départ éducatifs, pas des recettes.",
      use_rate: "Utiliser ce taux dans le simulateur ↑",
      names: { cons: "Prudent", mod: "Équilibré", s7030: "70/30", agr: "Dynamique" },
      tags: { cons: "Sans frayeurs", mod: "Équilibre", s7030: "Simple et efficace", agr: "10 ans et +" },
      why_label: "Pourquoi cette composition :",
      why: {
        cons: "la grande part d'obligations et de dépôts amortit les chutes ; les 15 % d'actions gardent une longueur d'avance sur l'inflation. Pour l'argent à court horizon — ou pour dormir tranquille. Rendement historique typique ~3–4 %/an.",
        mod: "une moitié défend, l'autre attaque. Capture une bonne partie de la croissance des actions avec environ moitié moins de frayeurs. Rendement historique typique ~5–6 %/an, horizon 5 ans et plus.",
        s7030: "la recette la plus simple qui fonctionne — 70 % dans un ETF actions monde, 30 % en obligations. Deux produits, un rééquilibrage par an, historiquement ~6–7 %/an. La préférée de ceux qui ne veulent pas y penser tous les jours.",
        agr: "avec 10 ans et plus devant soi, les chutes — qui arriveront, et peuvent dépasser −30 % — ont le temps de se rattraper. La crypto est incluse mais plafonnée à 10 % (voir plus bas). Rendement historique typique ~7–9 %/an, estomac solide requis.",
      },
    },
    crypto: {
      title: "Et la crypto, où s'intègre-t-elle ?",
      sub: "Elle s'intègre — comme une part du portefeuille, pas comme le portefeuille. La bonne question n'est pas “dois-je acheter de la crypto ?” mais “quel % puis-je encaisser ?”.",
      winter_title: "Ce qu'un hiver crypto (−70 %) fait à tout le portefeuille",
      winter_sub: "Même portefeuille dynamique, trois doses de crypto :",
      w0: "le portefeuille perd −0 pt via la crypto", w10: "−7 pts — récupérable", w30: "−21 pts — des années d'épargne effacées",
      winter_p: "C'est pour cela que les portefeuilles types plafonnent la crypto à 5–10 % : assez pour participer à la hausse, pas assez pour qu'un mauvais cycle détruise le plan. Des chutes de 70–80 % se sont produites trois fois depuis 2013.",
      rules_title: "Règles pratiques qu'on apprend à ses dépens",
      r1t: "Le pourcentage d'abord, la pièce ensuite.", r1: "Décidez du % du portefeuille avant de débattre BTC contre ETH.",
      r2t: "Rééquilibrer, c'est vendre haut.", r2: "Si la crypto bondit de 10 % à 25 % du portefeuille, le rééquilibrage vous force à prendre vos gains — automatique et sans émotion.",
      r3t: "Jamais avec de l'argent à court terme.", r3: "La crypto est la dernière part à entrer, après le fonds d'urgence et le reste du plan.",
      app_note: "Dans Wallet76, la crypto vit à côté des actions et des ETF — Binance, Bybit et votre courtier dans un même portefeuille, avec le % de chaque classe toujours visible.",
    },
    alloc: {
      title: "Du plan à la discipline — votre graphique d'Allocation",
      sub: "Choisir le portefeuille est la partie facile. S'y tenir est ce qui rapporte — et c'est à ça que sert le panneau d'Allocation.",
      example: "Exemple : portefeuille réel vs plan équilibré (le trait │ est le plan)",
      orient: { up: "Renforcer", down: "Alléger", ok: "Dans la cible" },
      c1t: "La barre, c'est ce que vous avez", c1: "— tous les courtiers additionnés, aux prix en temps réel.",
      c2t: "Le trait │, c'est votre plan", c2: "— les % cibles que vous avez définis (vous pouvez partir d'un portefeuille type de cette page).",
      c3t: "L'orientation fait le reste", c3: "— dérive de plus de 5 points : “Renforcer” ou “Alléger”. Proche de la cible : en paix. Rééquilibrer, c'est quelques fois par an.",
      cta: "Créer mon portefeuille gratuit", cta_sub: "2 minutes, sans carte. Importez depuis votre courtier ou saisissez à la main.",
    },
    disclaimer: "Note importante : cette page est un contenu éducatif générique et ne constitue ni un conseil financier, ni une recommandation d'investissement, ni une offre. Les taux utilisés sont des moyennes historiques de long terme, pas des promesses ; les performances passées ne préjugent pas des performances futures. Investir comporte un risque de perte, et la crypto en particulier peut perdre l'essentiel de sa valeur. Tenez compte de votre situation personnelle et, si besoin, d'un professionnel habilité.",
  },
  de: {
    doc_title: "Investieren lernen — Simulator & Musterportfolios | Wallet76",
    badge: "Bildungsinhalt — keine Finanzberatung",
    title: "Wie viel kann aus Ihrem Geld werden?",
    sub: "Rechnen Sie mit Ihren Zahlen, verstehen Sie Risikoprofile und sehen Sie, wo Krypto hineinpasst. Ohne Jargon, ohne Versprechen.",
    back: "Zurück zur Website", start: "Kostenlos starten",
    assets: { obr: "Anleihen & Einlagen", acc: "Aktien & ETFs", acc7030: "Aktien & ETFs (global)", imo: "Immobilien (REITs)", cri: "Krypto", liq: "Liquidität" },
    tabs: { dep: "Nur Einlagen", cons: "Konservativ", mod: "Ausgewogen", s7030: "70/30", agr: "Offensiv" },
    sim: {
      initial: "Startbetrag (€)", monthly: "Monatliche Sparrate (€)", years: "Laufzeit (Jahre)", rate: "Jahresrendite (%)",
      cta: "Mein Portfolio verfolgen →", nocard: "Kostenlos, ohne Karte",
      fv: "Geschätzter Endwert", invested: "Ihre Einzahlungen", interest: "Erwirtschaftete Zinsen",
      total: "Gesamtwert", only_inv: "Nur Ihre Einzahlungen", yr: "J",
      comp: "Bei Einlagen zu ~2,5 % ergäben dieselben Zahlen {dep}. Die Differenz — {diff} — ist der Preis des Nicht-Investierens. (Und die Inflation beißt beide.)",
    },
    profiles: {
      title: "Welches Portfolio passt zu Ihnen?",
      sub: "Vier Musterportfolios mit typischen Prozentsätzen — als Lern-Ausgangspunkte, nicht als Rezepte.",
      use_rate: "Diese Rendite im Simulator verwenden ↑",
      names: { cons: "Konservativ", mod: "Ausgewogen", s7030: "70/30", agr: "Offensiv" },
      tags: { cons: "Keine Schrecken", mod: "Balance", s7030: "Einfach & wirksam", agr: "10+ Jahre" },
      why_label: "Warum so:",
      why: {
        cons: "der große Anteil an Anleihen und Einlagen federt Rückschläge ab; die 15 % Aktien halten Sie über der Inflation. Für Geld mit kurzem Horizont — oder für ruhigen Schlaf. Typische historische Rendite ~3–4 %/Jahr.",
        mod: "eine Hälfte verteidigt, die andere greift an. Nimmt einen guten Teil des Aktienwachstums mit — bei etwa der Hälfte der Schrecken. Typische historische Rendite ~5–6 %/Jahr, Horizont 5+ Jahre.",
        s7030: "das einfachste Rezept, das funktioniert — 70 % in einem globalen Aktien-ETF, 30 % in Anleihen. Zwei Produkte, einmal im Jahr rebalancieren, historisch ~6–7 %/Jahr. Der Favorit aller, die nicht täglich daran denken wollen.",
        agr: "mit 10+ Jahren haben die Rückschläge — die kommen werden und −30 % übersteigen können — Zeit, sich zu erholen. Krypto ist dabei, aber auf 10 % begrenzt (siehe unten). Typische historische Rendite ~7–9 %/Jahr, starke Nerven nötig.",
      },
    },
    crypto: {
      title: "Und Krypto — wo passt es hin?",
      sub: "Es passt — als Scheibe des Portfolios, nicht als das Portfolio. Die richtige Frage ist nicht „soll ich Krypto kaufen?“, sondern „wie viel % halte ich aus?“.",
      winter_title: "Was ein Krypto-Winter (−70 %) mit dem Gesamtportfolio macht",
      winter_sub: "Gleiches offensives Portfolio, drei Krypto-Dosierungen:",
      w0: "Portfolio verliert −0 Pkt. durch Krypto", w10: "−7 Pkt. — verkraftbar", w30: "−21 Pkt. — Jahre des Sparens ausgelöscht",
      winter_p: "Deshalb begrenzen Musterportfolios Krypto auf 5–10 %: genug, um am Aufschwung teilzuhaben, zu wenig, als dass ein schlechter Zyklus den Plan zerstört. Einbrüche von 70–80 % gab es seit 2013 drei Mal.",
      rules_title: "Praxisregeln, die man sonst auf die harte Tour lernt",
      r1t: "Erst der Prozentsatz, dann die Münze.", r1: "Legen Sie den Portfolio-Anteil fest, bevor Sie über BTC vs. ETH diskutieren.",
      r2t: "Rebalancieren heißt teuer verkaufen.", r2: "Springt Krypto von 10 % auf 25 % des Portfolios, zwingt Sie das Rebalancing, Gewinne mitzunehmen — automatisch und ohne Emotion.",
      r3t: "Nie mit kurzfristigem Geld.", r3: "Krypto ist die letzte Scheibe — nach dem Notgroschen und dem Rest des Plans.",
      app_note: "In Wallet76 lebt Krypto neben Aktien und ETFs — Binance, Bybit und Ihr Broker in einem Portfolio, mit dem Anteil jeder Anlageklasse stets im Blick.",
    },
    alloc: {
      title: "Vom Plan zur Disziplin — Ihr Allokations-Chart",
      sub: "Das Portfolio zu wählen ist der leichte Teil. Dabei zu bleiben bringt das Geld — und genau dafür ist das Allokations-Panel da.",
      example: "Beispiel: echtes Portfolio vs. ausgewogener Plan (der Strich │ ist der Plan)",
      orient: { up: "Aufstocken", down: "Reduzieren", ok: "Im Ziel" },
      c1t: "Der Balken ist Ihr Bestand", c1: "— alle Broker zusammengezählt, mit Echtzeitkursen.",
      c2t: "Der Strich │ ist Ihr Plan", c2: "— die Ziel-Prozente, die Sie festgelegt haben (ein Musterportfolio dieser Seite ist ein guter Start).",
      c3t: "Die Orientierung erledigt den Rest", c3: "— mehr als 5 Punkte abgedriftet: „Aufstocken“ oder „Reduzieren“. Nah am Ziel: Ruhe. Rebalancieren ist eine Sache von wenigen Malen im Jahr.",
      cta: "Mein Portfolio kostenlos anlegen", cta_sub: "2 Minuten, ohne Karte. Vom Broker importieren oder von Hand erfassen.",
    },
    disclaimer: "Wichtiger Hinweis: Diese Seite ist allgemeiner Bildungsinhalt und stellt weder Finanzberatung noch eine Anlageempfehlung oder ein Angebot dar. Die verwendeten Renditen sind langfristige historische Durchschnitte, keine Versprechen; vergangene Wertentwicklung garantiert keine zukünftigen Ergebnisse. Investieren birgt Verlustrisiken, und gerade Krypto kann den Großteil seines Wertes verlieren. Berücksichtigen Sie Ihre persönliche Situation und ziehen Sie bei Bedarf eine zugelassene Fachperson hinzu.",
  },
  it: {
    doc_title: "Imparare a investire — simulatore e portafogli modello | Wallet76",
    badge: "Contenuto educativo — non è consulenza finanziaria",
    title: "Quanto può rendere il tuo denaro?",
    sub: "Simula con i tuoi numeri, capisci i profili di rischio e scopri dove entra la crypto. Senza gergo e senza promesse.",
    back: "Torna al sito", start: "Inizia gratis",
    assets: { obr: "Obbligazioni e depositi", acc: "Azioni ed ETF", acc7030: "Azioni ed ETF (globali)", imo: "Immobiliare (REIT)", cri: "Crypto", liq: "Liquidità" },
    tabs: { dep: "Solo depositi", cons: "Prudente", mod: "Moderato", s7030: "70/30", agr: "Aggressivo" },
    sim: {
      initial: "Importo iniziale (€)", monthly: "Risparmio mensile (€)", years: "Orizzonte (anni)", rate: "Rendimento annuo (%)",
      cta: "Seguire il mio portafoglio →", nocard: "Gratis, senza carta",
      fv: "Valore stimato alla fine", invested: "Quanto versi tu", interest: "Interessi generati",
      total: "Valore totale", only_inv: "Solo i tuoi versamenti", yr: "a",
      comp: "Nei depositi al ~2,5%, gli stessi numeri darebbero {dep}. La differenza — {diff} — è il costo di non investire. (E l'inflazione morde entrambi.)",
    },
    profiles: {
      title: "Quale portafoglio ti somiglia?",
      sub: "Quattro portafogli modello con percentuali tipiche — punti di partenza educativi, non ricette.",
      use_rate: "Usa questo tasso nel simulatore ↑",
      names: { cons: "Prudente", mod: "Moderato", s7030: "70/30", agr: "Aggressivo" },
      tags: { cons: "Niente spaventi", mod: "Equilibrio", s7030: "Semplice ed efficace", agr: "10+ anni" },
      why_label: "Perché così:",
      why: {
        cons: "la fetta grande di obbligazioni e depositi ammortizza le cadute; il 15% di azioni ti tiene sopra l'inflazione. Per denaro con orizzonte breve — o per dormire tranquillo. Rendimento storico tipico ~3–4%/anno.",
        mod: "metà difende, metà attacca. Cattura buona parte della crescita azionaria con circa la metà degli spaventi. Rendimento storico tipico ~5–6%/anno, orizzonte 5+ anni.",
        s7030: "la ricetta più semplice che funziona — 70% in un ETF azionario globale, 30% in obbligazioni. Due prodotti, ribilanciamento una volta l'anno, storicamente ~6–7%/anno. La preferita di chi non vuole pensarci ogni giorno.",
        agr: "con 10+ anni davanti, le cadute — che arriveranno, e possono superare il −30% — hanno tempo di recuperare. La crypto c'è, ma limitata al 10% (vedi sotto). Rendimento storico tipico ~7–9%/anno, stomaco forte richiesto.",
      },
    },
    crypto: {
      title: "E la crypto, dove entra?",
      sub: "Entra — come fetta del portafoglio, non come portafoglio. La domanda giusta non è “compro crypto?”, ma “quanti % reggo?”.",
      winter_title: "Cosa fa un inverno crypto (−70%) all'intero portafoglio",
      winter_sub: "Stesso portafoglio aggressivo, tre dosi di crypto:",
      w0: "il portafoglio perde −0 pt via crypto", w10: "−7 pt — recuperabile", w30: "−21 pt — anni di risparmi cancellati",
      winter_p: "Per questo i portafogli modello limitano la crypto al 5–10%: abbastanza per partecipare alla salita, non abbastanza perché un ciclo cattivo distrugga il piano. Cali del 70–80% sono già successi tre volte dal 2013.",
      rules_title: "Regole pratiche che si imparano a proprie spese",
      r1t: "Prima la percentuale, poi la moneta.", r1: "Decidi i % del portafoglio prima di discutere se BTC, ETH o altro.",
      r2t: "Ribilanciare è vendere alto.", r2: "Se la crypto schizza dal 10% al 25% del portafoglio, il ribilanciamento ti obbliga a realizzare i guadagni — automatico e senza emozioni.",
      r3t: "Mai con denaro a breve termine.", r3: "La crypto è l'ultima fetta a entrare, dopo il fondo di emergenza e il resto del piano.",
      app_note: "In Wallet76 la crypto vive accanto ad azioni ed ETF — Binance, Bybit e il tuo broker in un unico portafoglio, con la % di ogni classe sempre in vista.",
    },
    alloc: {
      title: "Dal piano alla disciplina — il tuo grafico di Allocazione",
      sub: "Scegliere il portafoglio è la parte facile. Mantenerlo è ciò che paga — ed è a questo che serve il pannello di Allocazione.",
      example: "Esempio: portafoglio reale vs piano moderato (il segno │ è il piano)",
      orient: { up: "Rafforzare", down: "Alleggerire", ok: "In linea" },
      c1t: "La barra è ciò che possiedi", c1: "— tutti i broker sommati, con prezzi in tempo reale.",
      c2t: "Il segno │ è il tuo piano", c2: "— le % obiettivo che hai definito (puoi partire da un portafoglio modello di questa pagina).",
      c3t: "L'orientamento fa il resto", c3: "— scostamento oltre 5 punti: “Rafforzare” o “Alleggerire”. Vicino all'obiettivo: in pace. Ribilanciare è cosa da poche volte l'anno.",
      cta: "Crea il mio portafoglio gratis", cta_sub: "2 minuti, senza carta. Importa dal broker o registra a mano.",
    },
    disclaimer: "Nota importante: questa pagina è contenuto educativo generico e non costituisce consulenza finanziaria, raccomandazione di investimento né offerta. I tassi usati sono medie storiche di lungo periodo, non promesse; i rendimenti passati non garantiscono risultati futuri. Investire comporta rischio di perdita, e la crypto in particolare può perdere gran parte del valore. Considera la tua situazione personale e, se necessario, un professionista abilitato.",
  },
  es: {
    doc_title: "Aprender a invertir — simulador y carteras modelo | Wallet76",
    badge: "Contenido educativo — no es asesoramiento financiero",
    title: "¿Cuánto puede rendir tu dinero?",
    sub: "Simula con tus números, entiende los perfiles de riesgo y mira dónde encaja la cripto. Sin jerga y sin promesas.",
    back: "Volver al sitio", start: "Empezar gratis",
    assets: { obr: "Bonos y depósitos", acc: "Acciones y ETFs", acc7030: "Acciones y ETFs (globales)", imo: "Inmobiliario (REITs)", cri: "Cripto", liq: "Liquidez" },
    tabs: { dep: "Solo depósitos", cons: "Conservador", mod: "Moderado", s7030: "70/30", agr: "Agresivo" },
    sim: {
      initial: "Importe inicial (€)", monthly: "Ahorro mensual (€)", years: "Plazo (años)", rate: "Rentabilidad anual (%)",
      cta: "Seguir mi cartera →", nocard: "Gratis, sin tarjeta",
      fv: "Valor estimado al final", invested: "Lo que aportas tú", interest: "Intereses generados",
      total: "Valor total", only_inv: "Solo tus aportaciones", yr: "a",
      comp: "En depósitos al ~2,5%, los mismos números darían {dep}. La diferencia — {diff} — es el coste de no invertir. (Y la inflación muerde a los dos.)",
    },
    profiles: {
      title: "¿Qué cartera va contigo?",
      sub: "Cuatro carteras modelo con porcentajes típicos — puntos de partida educativos, no recetas.",
      use_rate: "Usar esta tasa en el simulador ↑",
      names: { cons: "Conservador", mod: "Moderado", s7030: "70/30", agr: "Agresivo" },
      tags: { cons: "Sin sustos", mod: "Equilibrio", s7030: "Simple y eficaz", agr: "10+ años" },
      why_label: "Por qué así:",
      why: {
        cons: "la porción grande de bonos y depósitos amortigua las caídas; el 15% de acciones te mantiene por delante de la inflación. Para dinero con plazo corto — o para dormir tranquilo. Rentabilidad histórica típica ~3–4%/año.",
        mod: "la mitad defiende, la mitad ataca. Captura buena parte del crecimiento de las acciones con aproximadamente la mitad de los sustos. Rentabilidad histórica típica ~5–6%/año, horizonte 5+ años.",
        s7030: "la receta más simple que funciona — 70% en un ETF global de acciones, 30% en bonos. Dos productos, rebalancear una vez al año, históricamente ~6–7%/año. La favorita de quien no quiere pensar en esto a diario.",
        agr: "con 10+ años por delante, las caídas — que llegarán, y pueden superar el −30% — tienen tiempo de recuperarse. La cripto entra, pero limitada al 10% (mira más abajo). Rentabilidad histórica típica ~7–9%/año, con estómago.",
      },
    },
    crypto: {
      title: "¿Y la cripto, dónde entra?",
      sub: "Entra — como porción de la cartera, no como la cartera. La pregunta correcta no es “¿compro cripto?”, sino “¿qué % aguanto?”.",
      winter_title: "Lo que un invierno cripto (−70%) le hace a toda la cartera",
      winter_sub: "Misma cartera agresiva, tres dosis de cripto:",
      w0: "la cartera cae −0 pts vía cripto", w10: "−7 pts — recuperable", w30: "−21 pts — años de ahorro borrados",
      winter_p: "Por esto las carteras modelo limitan la cripto al 5–10%: suficiente para participar en la subida, no tanto como para que un mal ciclo destruya el plan. Caídas del 70–80% ya han ocurrido tres veces desde 2013.",
      rules_title: "Reglas prácticas que se aprenden por las malas",
      r1t: "Porcentaje primero, moneda después.", r1: "Decide los % de la cartera antes de discutir si BTC, ETH u otra.",
      r2t: "Rebalancear es vender caro.", r2: "Si la cripto se dispara del 10% al 25% de la cartera, rebalancear te obliga a realizar ganancias — automático y sin emoción.",
      r3t: "Nunca con dinero a corto plazo.", r3: "La cripto es la última porción en entrar, después del fondo de emergencia y del resto del plan.",
      app_note: "En Wallet76, la cripto vive junto a las acciones y ETFs — Binance, Bybit y tu bróker en una misma cartera, con el % de cada clase siempre a la vista.",
    },
    alloc: {
      title: "Del plan a la disciplina — tu gráfico de Asignación",
      sub: "Elegir la cartera es la parte fácil. Mantenerla es lo que paga — y para eso sirve el panel de Asignación.",
      example: "Ejemplo: cartera real vs plan moderado (la marca │ es el plan)",
      orient: { up: "Reforzar", down: "Aligerar", ok: "En objetivo" },
      c1t: "La barra es lo que tienes", c1: "— todos los brókers sumados, con precios en tiempo real.",
      c2t: "La marca │ es tu plan", c2: "— los % objetivo que definiste (puedes empezar por una cartera modelo de esta página).",
      c3t: "La orientación hace el resto", c3: "— si se desvía más de 5 puntos: “Reforzar” o “Aligerar”. Cerca del objetivo: en paz. Rebalancear es cosa de pocas veces al año.",
      cta: "Crear mi cartera gratis", cta_sub: "2 minutos, sin tarjeta. Importa de tu bróker o registra a mano.",
    },
    disclaimer: "Nota importante: esta página es contenido educativo genérico y no constituye asesoramiento financiero, recomendación de inversión ni oferta. Las tasas usadas son medias históricas de largo plazo, no promesas; las rentabilidades pasadas no garantizan resultados futuros. Invertir implica riesgo de pérdida, y la cripto en particular puede perder la mayor parte de su valor. Considera tu situación personal y, si es necesario, un profesional habilitado.",
  },
};

// ---------------------------------------------------------------- helpers

function fv(initial, monthly, years, annualPct) {
  const r = Math.pow(1 + annualPct / 100, 1 / 12) - 1;
  const n = Math.round(years * 12);
  const tot = [];
  const inv = [];
  let v = initial;
  for (let k = 0; k <= n; k++) {
    if (k) v = v * (1 + r) + monthly;
    tot.push(v);
    inv.push(initial + monthly * k);
  }
  return { tot, inv };
}

function Donut({ parts }) {
  const r = 44;
  const C = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg width="132" height="132" viewBox="0 0 110 110" aria-hidden="true">
      {parts.map(([k, pct], i) => {
        const len = (pct / 100) * C;
        const el = (
          <circle key={i} cx="55" cy="55" r={r} fill="none"
            stroke={PAL[k === "acc7030" ? "acc" : k]} strokeWidth="13"
            strokeDasharray={`${Math.max(0, len - 2)} ${C - len + 2}`}
            strokeDashoffset={-off} transform="rotate(-90 55 55)" />
        );
        off += len;
        return el;
      })}
    </svg>
  );
}

// Barra "atual vs plano" do exemplo da secção de Alocação (estática, educativa)
function PlanBar({ label, color, atual, alvo, chip, chipCls }) {
  return (
    <div className="my-3">
      <div className="flex justify-between text-xs text-zinc-400 mb-1">
        <span>{label}</span>
        <span className="text-zinc-100 tabular-nums">
          {atual}% → {alvo}% <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-semibold align-middle ml-1 ${chipCls}`}>{chip}</span>
        </span>
      </div>
      <div className="relative h-2.5 rounded-md bg-[#0b0e11] overflow-visible">
        <div className="h-full rounded-md" style={{ width: `${atual}%`, background: color }} />
        <div className="absolute -top-[3px] -bottom-[3px] w-[2px] bg-zinc-100/60" style={{ left: `${alvo}%` }} />
      </div>
    </div>
  );
}

export default function Aprender() {
  const { lang } = useI18n();
  const c = COPY[lang] || COPY.en;
  const locale = LOCALES[lang] || "en-IE";

  const [ini, setIni] = useState("1000");
  const [mes, setMes] = useState("150");
  const [anos, setAnos] = useState("25");
  const [taxa, setTaxa] = useState("5.5");
  const [tab, setTab] = useState("mod");
  const [perfil, setPerfil] = useState("mod");

  useEffect(() => { document.title = c.doc_title; }, [c]);

  const eur = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
    [locale]
  );

  const years = Math.min(60, Math.max(1, +anos || 1));
  const sim = useMemo(
    () => fv(+ini || 0, +mes || 0, years, +taxa || 0),
    [ini, mes, years, taxa]
  );
  const dep = useMemo(
    () => fv(+ini || 0, +mes || 0, years, 2.5),
    [ini, mes, years]
  );
  const final = sim.tot[sim.tot.length - 1];
  const invested = sim.inv[sim.inv.length - 1];
  const depFinal = dep.tot[dep.tot.length - 1];

  // Gráfico de área: eixo Y recessivo, série "só investido" como referência.
  const chart = useMemo(() => {
    const W = 640, H = 240, L = 52, B = 24, T = 10, R = 8;
    const max = Math.max(1, final) * 1.06;
    const sx = (W - L - R) / (sim.tot.length - 1 || 1);
    const sy = (H - B - T) / max;
    const pt = (a, i) => `${(L + i * sx).toFixed(1)},${(H - B - a * sy).toFixed(1)}`;
    const grid = [0, 1, 2, 3].map((i) => ({
      y: H - B - ((max * i) / 3) * sy,
      label: `${Math.round(max * i / 3 / 1000)}k€`,
    }));
    const step = Math.max(1, Math.ceil(years / 6));
    const xTicks = [];
    for (let a = 0; a <= years; a += step) xTicks.push({ x: L + a * 12 * sx, label: `${a}${c.sim.yr}` });
    return {
      W, H, L, B,
      grid, xTicks,
      area: `M${sim.tot.map(pt).join(" L")} L${W - R},${H - B} L${L},${H - B} Z`,
      lineTot: `M${sim.tot.map(pt).join(" L")}`,
      lineInv: `M${sim.inv.map(pt).join(" L")}`,
    };
  }, [sim, years, final, c]);

  const compText = c.sim.comp
    .replace("{dep}", eur.format(depFinal))
    .replace("{diff}", eur.format(final - depFinal));

  const p = PROFILES[perfil];

  const input = "w-full bg-[#0b0e11] text-zinc-100 border border-zinc-800 rounded-lg px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500";
  const label = "block text-[13px] text-zinc-400 mt-3.5 mb-1.5 first:mt-0";
  const card = "bg-[#14181d] border border-zinc-800 rounded-xl p-6";
  const btn = "inline-block bg-blue-600 hover:bg-blue-500 transition-colors text-white font-semibold text-sm rounded-lg px-4 py-2.5";
  const chipUp = "bg-emerald-600/15 text-emerald-400";
  const chipDown = "bg-amber-600/15 text-amber-400";
  const chipOk = "bg-[#1a1f26] text-zinc-400";

  return (
    <div className="min-h-screen bg-[#0b0e11] text-zinc-100" style={{ font: "16px/1.55 system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-[#0b0e11]/90 backdrop-blur px-6 py-3.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/" className="font-bold">W⁷ Wallet76</Link>
          <div className="flex items-center gap-2.5">
            <Link to="/" className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:inline">{c.back}</Link>
            <Link to="/register" className={btn}>{c.start}</Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6">
        <h1 className="text-3xl font-bold pt-12">{c.title}</h1>
        <p className="text-zinc-400 text-[15px] mt-2 max-w-2xl">{c.sub}</p>
        <span className="inline-block text-xs text-blue-400 border border-zinc-800 rounded-full px-3 py-1 mt-3.5">{c.badge}</span>

        {/* ------- 1. Simulador ------- */}
        <div className="flex flex-wrap gap-2 mt-6 mb-3.5" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key}
              onClick={() => { setTab(t.key); setTaxa(String(t.rate)); }}
              className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${tab === t.key ? "bg-blue-600 border-blue-600 text-white" : "bg-[#14181d] border-zinc-800 text-zinc-400 hover:text-white"}`}>
              {c.tabs[t.key]} (~{String(t.rate).replace(".", lang === "en" ? "." : ",")}%)
            </button>
          ))}
        </div>
        <div className="grid md:grid-cols-[320px_1fr] gap-4">
          <div className={card}>
            <label className={label} htmlFor="ap-ini">{c.sim.initial}</label>
            <input id="ap-ini" type="number" min="0" className={input} value={ini} onChange={(e) => setIni(e.target.value)} />
            <label className={label} htmlFor="ap-mes">{c.sim.monthly}</label>
            <input id="ap-mes" type="number" min="0" className={input} value={mes} onChange={(e) => setMes(e.target.value)} />
            <label className={label} htmlFor="ap-anos">{c.sim.years}</label>
            <input id="ap-anos" type="number" min="1" max="60" className={input} value={anos} onChange={(e) => setAnos(e.target.value)} />
            <label className={label} htmlFor="ap-taxa">{c.sim.rate}</label>
            <input id="ap-taxa" type="number" step="0.5" className={input} value={taxa} onChange={(e) => { setTaxa(e.target.value); setTab(""); }} />
            <Link to="/register" className={`${btn} w-full text-center mt-5`}>{c.sim.cta}</Link>
            <div className="text-xs text-zinc-500 text-center mt-2">{c.sim.nocard}</div>
          </div>
          <div className={card}>
            <div className="flex flex-wrap gap-6 mb-2">
              <div>
                <div className="text-xs text-zinc-500">{c.sim.fv}</div>
                <div className="text-3xl font-bold tabular-nums">{eur.format(final)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">{c.sim.invested}</div>
                <div className="text-2xl font-bold tabular-nums text-zinc-400">{eur.format(invested)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">{c.sim.interest}</div>
                <div className="text-2xl font-bold tabular-nums text-emerald-400">{eur.format(final - invested)}</div>
              </div>
            </div>
            <svg viewBox={`0 0 ${chart.W} ${chart.H}`} width="100%" height="240" role="img" aria-label={`${c.sim.total} / ${c.sim.only_inv}`}>
              {chart.grid.map((g, i) => (
                <g key={i}>
                  <line x1={chart.L} y1={g.y} x2={chart.W - 8} y2={g.y} stroke="#242a32" />
                  <text x={chart.L - 6} y={g.y + 4} textAnchor="end" style={{ font: "11.5px system-ui", fill: "#6b7280" }}>{g.label}</text>
                </g>
              ))}
              {chart.xTicks.map((t, i) => (
                <text key={i} x={t.x} y={chart.H - 6} textAnchor="middle" style={{ font: "11.5px system-ui", fill: "#6b7280" }}>{t.label}</text>
              ))}
              <path d={chart.area} fill="#3b82f6" opacity="0.10" />
              <path d={chart.lineInv} fill="none" stroke="#6b7280" strokeWidth="2" />
              <path d={chart.lineTot} fill="none" stroke="#3b82f6" strokeWidth="2" />
            </svg>
            <div className="flex gap-4 text-[13px] text-zinc-400 mt-2">
              <span className="flex items-center gap-2"><i className="inline-block w-4 h-[3px] rounded bg-blue-500" />{c.sim.total}</span>
              <span className="flex items-center gap-2"><i className="inline-block w-4 h-[3px] rounded bg-zinc-500" />{c.sim.only_inv}</span>
            </div>
            <div className="text-[13.5px] text-zinc-400 border-t border-zinc-800 mt-3.5 pt-3.5">{compText}</div>
          </div>
        </div>

        {/* ------- 2. Perfis ------- */}
        <h2 className="text-[22px] font-bold mt-14">{c.profiles.title}</h2>
        <p className="text-zinc-400 text-sm mt-1 mb-4">{c.profiles.sub}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
          {PROFILE_ORDER.map((k) => (
            <button key={k} onClick={() => setPerfil(k)}
              className={`text-left rounded-xl border px-4 py-3 transition-colors ${perfil === k ? "border-blue-500 ring-1 ring-blue-500 bg-[#14181d]" : "border-zinc-800 bg-[#14181d] hover:border-zinc-600"}`}>
              <span className="block font-semibold text-[14.5px]">{c.profiles.names[k]}</span>
              <span className="block text-xs text-zinc-400">{c.profiles.tags[k]}</span>
            </button>
          ))}
        </div>
        <div className={card}>
          <div className="flex flex-wrap items-center gap-6">
            <Donut parts={p.parts} />
            <ul className="flex-1 min-w-[240px] text-sm text-zinc-400">
              {p.parts.map(([k, pct]) => (
                <li key={k} className="flex items-center gap-2.5 py-1">
                  <span className="w-2.5 h-2.5 rounded flex-none" style={{ background: PAL[k === "acc7030" ? "acc" : k] }} />
                  {c.assets[k]}
                  <b className="ml-auto text-zinc-100 tabular-nums">{pct}%</b>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-zinc-400 border-t border-zinc-800 mt-4 pt-4">
            <b className="text-zinc-100">{c.profiles.why_label}</b> {c.profiles.why[perfil]}
          </p>
          <button className={`${btn} mt-3.5`} onClick={() => { setTaxa(String(p.rate)); setTab(perfil); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            {c.profiles.use_rate}
          </button>
        </div>

        {/* ------- 3. Cripto ------- */}
        <h2 className="text-[22px] font-bold mt-14">{c.crypto.title}</h2>
        <p className="text-zinc-400 text-sm mt-1 mb-4">{c.crypto.sub}</p>
        <div className="grid md:grid-cols-2 gap-4">
          <div className={card}>
            <h3 className="text-[15px] font-semibold">{c.crypto.winter_title}</h3>
            <div className="text-xs text-zinc-500 mt-1 mb-2.5">{c.crypto.winter_sub}</div>
            {[[0, c.crypto.w0], [10, c.crypto.w10], [30, c.crypto.w30]].map(([pct, txt]) => (
              <div key={pct} className="my-3">
                <div className="flex justify-between text-[13px] text-zinc-400 mb-1">
                  <span>{pct}% {c.assets.cri.toLowerCase()}</span>
                  <b className="text-zinc-100">{txt}</b>
                </div>
                <div className="h-2.5 rounded-md bg-[#0b0e11] flex gap-[2px] overflow-hidden">
                  <i style={{ width: `${pct}%`, background: PAL.cri }} />
                  <i className="flex-1 bg-[#1a1f26]" />
                </div>
              </div>
            ))}
            <p className="text-sm text-zinc-400 mt-3">{c.crypto.winter_p}</p>
          </div>
          <div className={card}>
            <h3 className="text-[15px] font-semibold mb-2.5">{c.crypto.rules_title}</h3>
            {[[c.crypto.r1t, c.crypto.r1], [c.crypto.r2t, c.crypto.r2], [c.crypto.r3t, c.crypto.r3]].map(([t, b], i) => (
              <div key={i} className={`flex gap-2.5 py-2.5 text-[13.5px] text-zinc-400 ${i ? "border-t border-zinc-800" : ""}`}>
                <span className="flex-none w-5 h-5 rounded-full bg-[#1a1f26] text-blue-400 text-[11.5px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <span><b className="text-zinc-100">{t}</b> {b}</span>
              </div>
            ))}
            <p className="text-sm text-zinc-400 mt-3">
              {c.crypto.app_note} <Link to="/register" className="text-blue-400 hover:underline">→</Link>
            </p>
          </div>
        </div>

        {/* ------- 4. Alocação ------- */}
        <h2 className="text-[22px] font-bold mt-14">{c.alloc.title}</h2>
        <p className="text-zinc-400 text-sm mt-1 mb-4">{c.alloc.sub}</p>
        <div className="grid md:grid-cols-[1.2fr_1fr] gap-4">
          <div className={card}>
            <div className="text-xs text-zinc-500 mb-2">{c.alloc.example}</div>
            <PlanBar label={c.assets.acc} color={PAL.acc} atual={46} alvo={40} chip={c.alloc.orient.down} chipCls={chipDown} />
            <PlanBar label={c.assets.cri} color={PAL.cri} atual={22} alvo={10} chip={c.alloc.orient.down} chipCls={chipDown} />
            <PlanBar label={c.assets.obr} color={PAL.obr} atual={17} alvo={35} chip={c.alloc.orient.up} chipCls={chipUp} />
            <PlanBar label={c.assets.imo} color={PAL.imo} atual={10} alvo={10} chip={c.alloc.orient.ok} chipCls={chipOk} />
            <PlanBar label={c.assets.liq} color={PAL.liq} atual={5} alvo={5} chip={c.alloc.orient.ok} chipCls={chipOk} />
          </div>
          <div className={card}>
            {[[c.alloc.c1t, c.alloc.c1], [c.alloc.c2t, c.alloc.c2], [c.alloc.c3t, c.alloc.c3]].map(([t, b], i) => (
              <div key={i} className={`flex gap-2.5 py-2.5 text-[13.5px] text-zinc-400 ${i ? "border-t border-zinc-800" : ""}`}>
                <span className="flex-none w-5 h-5 rounded-full bg-[#1a1f26] text-blue-400 text-[11.5px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <span><b className="text-zinc-100">{t}</b> {b}</span>
              </div>
            ))}
            <Link to="/register" className={`${btn} mt-4`}>{c.alloc.cta}</Link>
            <div className="text-xs text-zinc-500 mt-2">{c.alloc.cta_sub}</div>
          </div>
        </div>

        <p className="text-[13px] text-zinc-500 border-t border-zinc-800 mt-14 pt-6 pb-12 max-w-3xl">
          <b>{c.badge}.</b> {c.disclaimer}
        </p>
      </div>
    </div>
  );
}

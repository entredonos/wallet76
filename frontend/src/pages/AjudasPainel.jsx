import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../context/I18nContext";
import { useAuth } from "../context/AuthContext";
import { PublicHeader, WhereBox, BTN } from "../components/AjudasKit";
import img1 from "../assets/ajudas/painel-1.webp";
import img2 from "../assets/ajudas/painel-2.webp";
import img3 from "../assets/ajudas/painel-3.webp";
import img4 from "../assets/ajudas/painel-4.webp";
import img5 from "../assets/ajudas/painel-5.webp";
import img6 from "../assets/ajudas/painel-6.webp";

// Guia do painel avançado (/ajudas/painel) — 2 ago 2026. Seis capturas REAIS
// do Dashboard (conta do Jose, aprovadas por ele a 2 ago; email e blocos
// ADMIN fora do recorte), anotadas com pinos numerados; cada secção lista a
// legenda dos pinos. As imagens são UM só conjunto em PT — só o texto vai
// nas 6 línguas (decisão de 2 ago: manter 6 conjuntos de capturas seria
// incomportável a cada mudança de UI).
// REGRA #9: se o Dashboard mudar, este artigo (texto + capturas) muda na
// mesma sessão de trabalho.

const IMGS = [img1, img2, img3, img4, img5, img6];

const COPY = {
  pt: {
    crumb: "Ajudas", title: "O painel avançado, imagem a imagem",
    lead: "O painel avançado é o dashboard completo: gráficos, distribuição, liquidez, dividendos e a tabela de tudo. Este guia percorre-o zona a zona.",
    why: "A vista rápida diz-te «quanto»; o painel avançado diz-te «porquê e onde». As capturas abaixo são reais — os números vêm de uma carteira verdadeira.",
    where_label: "Onde está na app:", where: "no Painel, botão «Painel avançado» no canto superior direito. O botão «Resumo» faz o caminho inverso.",
    s: [
      { t: "A vista rápida — o que abres por defeito", p: "O resumo de cinco segundos: quatro números, as carteiras e a semana. Tudo o resto vive no painel avançado.", l: [
        "Saldo total — o valor de tudo o que tens, na tua moeda base.",
        "Total investido — o dinheiro que lá puseste.",
        "Lucro/Prejuízo — a diferença entre os dois, em valor e em %.",
        "Variação 24h — quanto a carteira mexeu no último dia.",
        "As tuas carteiras (corretoras e exchanges), cada uma com saldo e mini-gráfico.",
        "A evolução dos últimos dias, por classe.",
        "O botão «Painel avançado» — abre tudo o que este guia explica a seguir." ] },
      { t: "O topo do painel avançado", p: "", l: [
        "«Resumo» — volta à vista rápida.",
        "Sentimento do mercado cripto (índice Fear & Greed, de 0 a 100).",
        "O mesmo termómetro para as ações.",
        "Os chips de âmbito — Global ou só uma classe. Filtram TUDO o que está por baixo." ] },
      { t: "Evolução e Distribuição", p: "", l: [
        "O valor da carteira e a variação do período escolhido.",
        "As janelas de tempo, de 15 minutos a ALL (desde o início).",
        "Uma linha por classe — vês qual delas puxou a carteira para cima ou para baixo.",
        "A legenda das classes (as cores são sempre as mesmas em toda a app).",
        "Ver a distribuição por Classe ou por Ativos.",
        "Alvo vs Atual vs Desvio vs Ajuste — o resumo da Alocação; os alvos definem-se na página Alocação (há um artigo só sobre isso)." ] },
      { t: "Quem mexeu nas últimas 24 horas", p: "", l: [
        "As maiores subidas do dia entre os teus ativos.",
        "As maiores descidas.",
        "O melhor ativo desde a compra.",
        "O pior — estes dois medem desde que compraste, não só hoje." ] },
      { t: "Liquidez e próximos dividendos", p: "", l: [
        "A barra líquido vs menos líquido do teu património.",
        "Líquido = vendável em dias (ações, ETFs, cripto); menos líquido = fundos, obrigações, REITs.",
        "Dividendos estimados a cair nos próximos 30 dias.",
        "«Ver calendário» abre a página de Dividendos completa (também tem artigo próprio)." ] },
      { t: "A tabela completa dos ativos", p: "Todas as posições, ordenáveis por qualquer coluna.", l: [
        "Tipo (ações, cripto, ETFs…).",
        "Preço atual do ativo.",
        "Valor da posição (quantidade × preço).",
        "Custo médio por unidade — o que pagaste, em média.",
        "P&L — quanto ganhas ou perdes face ao que pagaste, em valor e %.",
        "% da carteira — o peso deste ativo no total.",
        "As últimas 24 horas em mini-gráfico.",
        "Em que carteira/corretora está a posição.",
        "Ações rápidas: criar um alerta de preço ou eliminar." ] },
    ],
    note: "Isto é educação sobre a ferramenta, não aconselhamento de investimento personalizado.",
    back: "← Todas as ajudas", cta_app: "Abrir o Painel", cta_anon: "Começar grátis",
  },
  en: {
    crumb: "Help", title: "The advanced panel, image by image",
    lead: "The advanced panel is the full dashboard: charts, distribution, liquidity, dividends and the complete table. This guide walks through it zone by zone.",
    why: "The quick view tells you «how much»; the advanced panel tells you «why and where». The screenshots below are real — the numbers come from a real portfolio.",
    where_label: "Where it lives in the app:", where: "on the Dashboard, “Advanced panel” button in the top-right corner. The “Summary” button takes you back.",
    s: [
      { t: "The quick view — what opens by default", p: "The five-second summary: four numbers, your wallets and the week. Everything else lives in the advanced panel.", l: [
        "Total balance — the value of everything you hold, in your base currency.",
        "Total invested — the money you put in.",
        "Profit/Loss — the difference between the two, in value and %.",
        "24h change — how much the portfolio moved in the last day.",
        "Your wallets (brokers and exchanges), each with balance and mini-chart.",
        "The last days' evolution, by class.",
        "The “Advanced panel” button — opens everything this guide explains next." ] },
      { t: "The top of the advanced panel", p: "", l: [
        "“Summary” — back to the quick view.",
        "Crypto market sentiment (Fear & Greed index, 0 to 100).",
        "The same thermometer for stocks.",
        "The scope chips — Global or a single class. They filter EVERYTHING below." ] },
      { t: "Evolution and Distribution", p: "", l: [
        "The portfolio value and the change over the chosen period.",
        "Time windows, from 15 minutes to ALL (since the beginning).",
        "One line per class — you see which one pulled the portfolio up or down.",
        "The class legend (colours are the same across the whole app).",
        "View the distribution by Class or by Assets.",
        "Target vs Current vs Deviation vs Adjustment — the Allocation summary; targets are set on the Allocation page (there's an article just for that)." ] },
      { t: "Who moved in the last 24 hours", p: "", l: [
        "The day's biggest risers among your assets.",
        "The biggest fallers.",
        "The best asset since purchase.",
        "The worst — these two measure since you bought, not just today." ] },
      { t: "Liquidity and upcoming dividends", p: "", l: [
        "The liquid vs less-liquid bar of your wealth.",
        "Liquid = sellable in days (stocks, ETFs, crypto); less liquid = funds, bonds, REITs.",
        "Dividends estimated to land in the next 30 days.",
        "“See calendar” opens the full Dividends page (it has its own article too)." ] },
      { t: "The complete asset table", p: "Every position, sortable by any column.", l: [
        "Type (stocks, crypto, ETFs…).",
        "Current price.",
        "Position value (quantity × price).",
        "Average cost per unit — what you paid, on average.",
        "P&L — how much you gain or lose vs what you paid, in value and %.",
        "% of portfolio — this asset's weight in the total.",
        "The last 24 hours as a mini-chart.",
        "Which wallet/broker holds the position.",
        "Quick actions: create a price alert or delete." ] },
    ],
    note: "This is education about the tool, not personalised investment advice.",
    back: "← All help topics", cta_app: "Open the Dashboard", cta_anon: "Start for free",
  },
  fr: {
    crumb: "Aide", title: "Le panneau avancé, image par image",
    lead: "Le panneau avancé est le tableau de bord complet : graphiques, répartition, liquidité, dividendes et la table de tout. Ce guide le parcourt zone par zone.",
    why: "La vue rapide vous dit « combien » ; le panneau avancé vous dit « pourquoi et où ». Les captures ci-dessous sont réelles — les chiffres viennent d'un vrai portefeuille.",
    where_label: "Où le trouver dans l'app :", where: "sur le Tableau de bord, bouton « Panneau avancé » en haut à droite. Le bouton « Résumé » fait le chemin inverse.",
    s: [
      { t: "La vue rapide — ce qui s'ouvre par défaut", p: "Le résumé de cinq secondes : quatre chiffres, vos portefeuilles et la semaine. Tout le reste vit dans le panneau avancé.", l: [
        "Solde total — la valeur de tout ce que vous détenez, dans votre devise de base.",
        "Total investi — l'argent que vous y avez mis.",
        "Gain/Perte — la différence entre les deux, en valeur et en %.",
        "Variation 24 h — combien le portefeuille a bougé le dernier jour.",
        "Vos portefeuilles (courtiers et exchanges), chacun avec solde et mini-graphique.",
        "L'évolution des derniers jours, par classe.",
        "Le bouton « Panneau avancé » — ouvre tout ce que ce guide explique ensuite." ] },
      { t: "Le haut du panneau avancé", p: "", l: [
        "« Résumé » — retour à la vue rapide.",
        "Sentiment du marché crypto (indice Fear & Greed, de 0 à 100).",
        "Le même thermomètre pour les actions.",
        "Les puces de périmètre — Global ou une seule classe. Elles filtrent TOUT ce qui est en dessous." ] },
      { t: "Évolution et Répartition", p: "", l: [
        "La valeur du portefeuille et la variation de la période choisie.",
        "Les fenêtres de temps, de 15 minutes à ALL (depuis le début).",
        "Une ligne par classe — vous voyez laquelle a tiré le portefeuille vers le haut ou le bas.",
        "La légende des classes (les couleurs sont les mêmes dans toute l'app).",
        "Voir la répartition par Classe ou par Actifs.",
        "Objectif vs Actuel vs Écart vs Ajustement — le résumé de l'Allocation ; les objectifs se définissent sur la page Allocation (il y a un article dédié)." ] },
      { t: "Qui a bougé dans les dernières 24 heures", p: "", l: [
        "Les plus fortes hausses du jour parmi vos actifs.",
        "Les plus fortes baisses.",
        "Le meilleur actif depuis l'achat.",
        "Le pire — ces deux-là mesurent depuis l'achat, pas seulement aujourd'hui." ] },
      { t: "Liquidité et prochains dividendes", p: "", l: [
        "La barre liquide vs moins liquide de votre patrimoine.",
        "Liquide = vendable en jours (actions, ETF, crypto) ; moins liquide = fonds, obligations, REIT.",
        "Dividendes estimés à tomber dans les 30 prochains jours.",
        "« Voir le calendrier » ouvre la page Dividendes complète (elle a aussi son article)." ] },
      { t: "La table complète des actifs", p: "Toutes les positions, triables par n'importe quelle colonne.", l: [
        "Type (actions, crypto, ETF…).",
        "Prix actuel.",
        "Valeur de la position (quantité × prix).",
        "Coût moyen par unité — ce que vous avez payé, en moyenne.",
        "P&L — combien vous gagnez ou perdez par rapport à ce que vous avez payé, en valeur et en %.",
        "% du portefeuille — le poids de cet actif dans le total.",
        "Les dernières 24 heures en mini-graphique.",
        "Quel portefeuille/courtier détient la position.",
        "Actions rapides : créer une alerte de prix ou supprimer." ] },
    ],
    note: "Ceci est de l'éducation sur l'outil, pas du conseil en investissement personnalisé.",
    back: "← Toutes les aides", cta_app: "Ouvrir le Tableau de bord", cta_anon: "Commencer gratuitement",
  },
  de: {
    crumb: "Hilfe", title: "Das erweiterte Panel, Bild für Bild",
    lead: "Das erweiterte Panel ist das vollständige Dashboard: Diagramme, Verteilung, Liquidität, Dividenden und die komplette Tabelle. Dieser Leitfaden geht es Zone für Zone durch.",
    why: "Die Schnellansicht sagt dir «wie viel»; das erweiterte Panel sagt dir «warum und wo». Die Screenshots unten sind echt — die Zahlen stammen aus einem echten Portfolio.",
    where_label: "Wo es in der App steht:", where: "im Dashboard, Knopf „Erweitertes Panel“ oben rechts. Der Knopf „Übersicht“ führt zurück.",
    s: [
      { t: "Die Schnellansicht — was standardmäßig aufgeht", p: "Die Fünf-Sekunden-Zusammenfassung: vier Zahlen, deine Depots und die Woche. Alles andere lebt im erweiterten Panel.", l: [
        "Gesamtsaldo — der Wert von allem, was du hältst, in deiner Basiswährung.",
        "Investiert gesamt — das Geld, das du hineingesteckt hast.",
        "Gewinn/Verlust — die Differenz der beiden, in Wert und %.",
        "24-h-Änderung — wie stark sich das Portfolio am letzten Tag bewegt hat.",
        "Deine Depots (Broker und Börsen), jedes mit Saldo und Mini-Chart.",
        "Die Entwicklung der letzten Tage, nach Klasse.",
        "Der Knopf „Erweitertes Panel“ — öffnet alles, was dieser Leitfaden als Nächstes erklärt." ] },
      { t: "Der obere Teil des erweiterten Panels", p: "", l: [
        "„Übersicht“ — zurück zur Schnellansicht.",
        "Krypto-Marktstimmung (Fear-&-Greed-Index, 0 bis 100).",
        "Dasselbe Thermometer für Aktien.",
        "Die Bereichs-Chips — Global oder nur eine Klasse. Sie filtern ALLES darunter." ] },
      { t: "Entwicklung und Verteilung", p: "", l: [
        "Der Portfoliowert und die Änderung im gewählten Zeitraum.",
        "Zeitfenster von 15 Minuten bis ALL (seit Beginn).",
        "Eine Linie pro Klasse — du siehst, welche das Portfolio nach oben oder unten gezogen hat.",
        "Die Klassenlegende (die Farben sind in der ganzen App dieselben).",
        "Die Verteilung nach Klasse oder nach Werten ansehen.",
        "Ziel vs Aktuell vs Abweichung vs Anpassung — die Zusammenfassung der Allokation; die Ziele setzt du auf der Allokationsseite (dazu gibt es einen eigenen Artikel)." ] },
      { t: "Wer sich in den letzten 24 Stunden bewegt hat", p: "", l: [
        "Die größten Anstiege des Tages unter deinen Werten.",
        "Die größten Rückgänge.",
        "Der beste Wert seit dem Kauf.",
        "Der schlechteste — diese beiden messen seit dem Kauf, nicht nur heute." ] },
      { t: "Liquidität und anstehende Dividenden", p: "", l: [
        "Der Balken liquide vs weniger liquide deines Vermögens.",
        "Liquide = in Tagen verkäuflich (Aktien, ETFs, Krypto); weniger liquide = Fonds, Anleihen, REITs.",
        "Geschätzte Dividenden der nächsten 30 Tage.",
        "„Kalender ansehen“ öffnet die vollständige Dividendenseite (auch sie hat einen eigenen Artikel)." ] },
      { t: "Die vollständige Wertetabelle", p: "Alle Positionen, nach jeder Spalte sortierbar.", l: [
        "Typ (Aktien, Krypto, ETFs…).",
        "Aktueller Preis.",
        "Positionswert (Menge × Preis).",
        "Durchschnittskosten pro Einheit — was du im Schnitt bezahlt hast.",
        "P&L — wie viel du gegenüber dem Kaufpreis gewinnst oder verlierst, in Wert und %.",
        "% des Portfolios — das Gewicht dieses Werts im Gesamten.",
        "Die letzten 24 Stunden als Mini-Chart.",
        "In welchem Depot/Broker die Position liegt.",
        "Schnellaktionen: Preisalarm anlegen oder löschen." ] },
    ],
    note: "Das ist Wissensvermittlung über das Werkzeug, keine persönliche Anlageberatung.",
    back: "← Alle Hilfen", cta_app: "Dashboard öffnen", cta_anon: "Kostenlos starten",
  },
  it: {
    crumb: "Aiuto", title: "Il pannello avanzato, immagine per immagine",
    lead: "Il pannello avanzato è la dashboard completa: grafici, distribuzione, liquidità, dividendi e la tabella di tutto. Questa guida lo percorre zona per zona.",
    why: "La vista rapida ti dice «quanto»; il pannello avanzato ti dice «perché e dove». Le catture qui sotto sono reali — i numeri vengono da un portafoglio vero.",
    where_label: "Dove si trova nell'app:", where: "nella Dashboard, pulsante «Pannello avanzato» in alto a destra. Il pulsante «Riepilogo» fa il percorso inverso.",
    s: [
      { t: "La vista rapida — ciò che si apre di default", p: "Il riassunto di cinque secondi: quattro numeri, i tuoi portafogli e la settimana. Tutto il resto vive nel pannello avanzato.", l: [
        "Saldo totale — il valore di tutto ciò che possiedi, nella tua valuta base.",
        "Totale investito — i soldi che ci hai messo.",
        "Profitto/Perdita — la differenza tra i due, in valore e in %.",
        "Variazione 24h — quanto il portafoglio si è mosso nell'ultimo giorno.",
        "I tuoi portafogli (broker ed exchange), ognuno con saldo e mini-grafico.",
        "L'evoluzione degli ultimi giorni, per classe.",
        "Il pulsante «Pannello avanzato» — apre tutto ciò che questa guida spiega di seguito." ] },
      { t: "La parte alta del pannello avanzato", p: "", l: [
        "«Riepilogo» — torna alla vista rapida.",
        "Sentiment del mercato cripto (indice Fear & Greed, da 0 a 100).",
        "Lo stesso termometro per le azioni.",
        "I chip di ambito — Globale o una sola classe. Filtrano TUTTO ciò che sta sotto." ] },
      { t: "Evoluzione e Distribuzione", p: "", l: [
        "Il valore del portafoglio e la variazione del periodo scelto.",
        "Le finestre temporali, da 15 minuti ad ALL (dall'inizio).",
        "Una linea per classe — vedi quale ha tirato il portafoglio su o giù.",
        "La legenda delle classi (i colori sono gli stessi in tutta l'app).",
        "Vedere la distribuzione per Classe o per Asset.",
        "Obiettivo vs Attuale vs Scarto vs Aggiustamento — il riassunto dell'Allocazione; gli obiettivi si impostano nella pagina Allocazione (c'è un articolo dedicato)." ] },
      { t: "Chi si è mosso nelle ultime 24 ore", p: "", l: [
        "I maggiori rialzi del giorno tra i tuoi asset.",
        "I maggiori ribassi.",
        "Il miglior asset dall'acquisto.",
        "Il peggiore — questi due misurano dall'acquisto, non solo oggi." ] },
      { t: "Liquidità e prossimi dividendi", p: "", l: [
        "La barra liquido vs meno liquido del tuo patrimonio.",
        "Liquido = vendibile in giorni (azioni, ETF, cripto); meno liquido = fondi, obbligazioni, REIT.",
        "Dividendi stimati in arrivo nei prossimi 30 giorni.",
        "«Vedi calendario» apre la pagina Dividendi completa (anche lei ha il suo articolo)." ] },
      { t: "La tabella completa degli asset", p: "Tutte le posizioni, ordinabili per qualsiasi colonna.", l: [
        "Tipo (azioni, cripto, ETF…).",
        "Prezzo attuale.",
        "Valore della posizione (quantità × prezzo).",
        "Costo medio per unità — quanto hai pagato, in media.",
        "P&L — quanto guadagni o perdi rispetto a quanto hai pagato, in valore e %.",
        "% del portafoglio — il peso di questo asset sul totale.",
        "Le ultime 24 ore in mini-grafico.",
        "In quale portafoglio/broker sta la posizione.",
        "Azioni rapide: creare un avviso di prezzo o eliminare." ] },
    ],
    note: "Questa è formazione sullo strumento, non consulenza d'investimento personalizzata.",
    back: "← Tutte le guide", cta_app: "Apri la Dashboard", cta_anon: "Inizia gratis",
  },
  es: {
    crumb: "Ayuda", title: "El panel avanzado, imagen a imagen",
    lead: "El panel avanzado es el dashboard completo: gráficos, distribución, liquidez, dividendos y la tabla de todo. Esta guía lo recorre zona a zona.",
    why: "La vista rápida te dice «cuánto»; el panel avanzado te dice «por qué y dónde». Las capturas de abajo son reales — los números vienen de una cartera de verdad.",
    where_label: "Dónde está en la app:", where: "en el Panel, botón «Panel avanzado» en la esquina superior derecha. El botón «Resumen» hace el camino inverso.",
    s: [
      { t: "La vista rápida — lo que se abre por defecto", p: "El resumen de cinco segundos: cuatro números, tus carteras y la semana. Todo lo demás vive en el panel avanzado.", l: [
        "Saldo total — el valor de todo lo que tienes, en tu moneda base.",
        "Total invertido — el dinero que pusiste.",
        "Ganancia/Pérdida — la diferencia entre los dos, en valor y en %.",
        "Variación 24h — cuánto se movió la cartera en el último día.",
        "Tus carteras (brokers y exchanges), cada una con saldo y mini-gráfico.",
        "La evolución de los últimos días, por clase.",
        "El botón «Panel avanzado» — abre todo lo que esta guía explica a continuación." ] },
      { t: "La parte alta del panel avanzado", p: "", l: [
        "«Resumen» — vuelve a la vista rápida.",
        "Sentimiento del mercado cripto (índice Fear & Greed, de 0 a 100).",
        "El mismo termómetro para las acciones.",
        "Los chips de ámbito — Global o una sola clase. Filtran TODO lo de abajo." ] },
      { t: "Evolución y Distribución", p: "", l: [
        "El valor de la cartera y la variación del período elegido.",
        "Las ventanas de tiempo, de 15 minutos a ALL (desde el inicio).",
        "Una línea por clase — ves cuál tiró de la cartera hacia arriba o abajo.",
        "La leyenda de las clases (los colores son los mismos en toda la app).",
        "Ver la distribución por Clase o por Activos.",
        "Objetivo vs Actual vs Desvío vs Ajuste — el resumen de la Asignación; los objetivos se definen en la página Asignación (hay un artículo solo de eso)." ] },
      { t: "Quién se movió en las últimas 24 horas", p: "", l: [
        "Las mayores subidas del día entre tus activos.",
        "Las mayores bajadas.",
        "El mejor activo desde la compra.",
        "El peor — estos dos miden desde que compraste, no solo hoy." ] },
      { t: "Liquidez y próximos dividendos", p: "", l: [
        "La barra líquido vs menos líquido de tu patrimonio.",
        "Líquido = vendible en días (acciones, ETFs, cripto); menos líquido = fondos, bonos, REITs.",
        "Dividendos estimados que llegan en los próximos 30 días.",
        "«Ver calendario» abre la página de Dividendos completa (también tiene su artículo)." ] },
      { t: "La tabla completa de activos", p: "Todas las posiciones, ordenables por cualquier columna.", l: [
        "Tipo (acciones, cripto, ETFs…).",
        "Precio actual.",
        "Valor de la posición (cantidad × precio).",
        "Coste medio por unidad — lo que pagaste, de media.",
        "P&L — cuánto ganas o pierdes frente a lo que pagaste, en valor y %.",
        "% de la cartera — el peso de este activo en el total.",
        "Las últimas 24 horas en mini-gráfico.",
        "En qué cartera/broker está la posición.",
        "Acciones rápidas: crear una alerta de precio o eliminar." ] },
    ],
    note: "Esto es educación sobre la herramienta, no asesoramiento de inversión personalizado.",
    back: "← Todas las ayudas", cta_app: "Abrir el Panel", cta_anon: "Empezar gratis",
  },
};

export default function AjudasPainel() {
  const { lang } = useI18n();
  const { user } = useAuth();
  const c = COPY[lang] || COPY.en;

  useEffect(() => {
    document.title = `${c.title} · Wallet76`;
  }, [c.title]);

  return (
    <div className="min-h-screen bg-[#0b0e11] text-zinc-100" style={{ font: "16px/1.55 system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <PublicHeader />
      <div className="max-w-3xl mx-auto px-6 pb-20">
        <div className="text-[12px] text-zinc-500 pt-8">
          <Link to="/ajudas" className="text-blue-400 hover:underline">{c.crumb}</Link> / {c.title.split(",")[0].trim()}
        </div>
        <h1 className="text-2xl font-bold mt-2">{c.title}</h1>
        <p className="text-[14.5px] text-zinc-400 mt-2">{c.lead}</p>
        <p className="text-[13.5px] text-zinc-500 mt-3 mb-5">{c.why}</p>
        <WhereBox label={c.where_label}>{c.where}</WhereBox>

        {c.s.map((sec, i) => (
          <div key={i} className="mb-10">
            <h2 className="font-semibold text-[16px] mb-1">
              <span className="text-blue-400 mr-2">{i + 1}.</span>{sec.t}
            </h2>
            {sec.p && <p className="text-[13px] text-zinc-500 mb-2">{sec.p}</p>}
            <div className="bg-[#14181d] border border-zinc-800 rounded-xl overflow-hidden mt-2 mb-3">
              <img src={IMGS[i]} alt={sec.t} loading="lazy" className="w-full block" />
            </div>
            <div className="space-y-1.5">
              {sec.l.map((item, j) => (
                <div key={j} className="flex gap-2.5 text-[13px] text-zinc-400">
                  <span className="flex-none w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">{j + 1}</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

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

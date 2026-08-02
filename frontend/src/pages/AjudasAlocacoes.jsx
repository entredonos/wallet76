import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../context/I18nContext";
import { useAuth } from "../context/AuthContext";
import { PublicHeader, Step, WhereBox, BTN } from "../components/AjudasKit";

// Artigo de ajuda: Alocações (/ajudas/alocacoes) — 2 ago 2026. O primeiro
// artigo da central e o MOLDE de todos os seguintes: lead de duas linhas
// («para que serve»), caixa «onde está na app», passos numerados, disclaimer
// educação-não-aconselhamento (mesma nota legal do Aprender) e, no fim, o
// caminho de volta ao índice e à app. As capturas de ecrã anotadas entram
// numa fase seguinte (tiradas da app em PT; só o texto vai ×6).
// A margem de 1 ponto referida no passo 3 é o ACT_MARGIN do Alocacao.jsx —
// se esse valor mudar, este texto tem de mudar com ele.

const COPY = {
  pt: {
    crumb: "Ajudas", title: "Alocações: dizer ao dinheiro para onde ir",
    lead: "Defines a percentagem que queres em cada classe de ativos e a app compara-a com o que tens de verdade — e transforma a diferença em ordens simples: reforçar, aliviar ou deixar estar.",
    why: "Sem alvos, uma carteira cresce ao acaso: o que subiu muito passa a pesar demais e o risco muda sem ninguém ter decidido nada. A alocação é o teu plano — esta página é onde o plano se vê e se cumpre.",
    where_label: "Onde está na app:", where: "menu lateral → «Alocação». No telemóvel: separador «Mais» → «Alocação».",
    s1t: "Define os alvos",
    s1p: "No cartão «Alocação por grupos», toca em «Editar percentagens», escreve o alvo de cada classe (têm de somar 100%) e guarda. Não há alvo certo universal — é o teu nível de risco; se estás a começar, a página Aprender mostra pontos de partida típicos.",
    s2t: "Lê o cartão fechado",
    s2p: "Com o editor fechado, cada classe é uma linha: a barra na cor da classe mostra o que tens hoje, o risco branco marca o alvo, e o chip diz a ação — ▲ Reforçar, ▼ Aliviar ou ✓ no alvo.",
    s3t: "Muda para o modo «Ação»",
    s3p: "No seletor de vistas, escolhe «Ação». A página transforma-se num plano: uma coluna com o que reforçar, outra com o que aliviar, já com os valores calculados. Diferenças até 1 ponto percentual contam como «no alvo» — ruído não é ordem.",
    s4t: "Abre os ativos de uma classe",
    s4p: "Toca em «ver ativos» para olhar para dentro da classe: cada ativo tem um anel de progresso face ao peso sugerido — vermelho longe, âmbar a meio caminho ou acima, verde no ponto.",
    s5t: "Rebalanceia à tua maneira",
    s5p: "Usa os valores do modo Ação como lista para os próximos reforços. Muita gente prefere reforçar o que falta em vez de vender o que sobra (menos custos e, em muitos países, menos impostos) — mas a decisão é tua e depende da tua situação.",
    s6t: "Volta cá de vez em quando",
    s6p: "Os preços mexem todos os dias; o teu plano não precisa de ti todos os dias. Uma olhada por semana ou por mês chega — a página só te pede ação quando um chip muda para ▲ ou ▼.",
    note: "Isto é educação sobre a ferramenta, não aconselhamento de investimento personalizado.",
    back: "← Todas as ajudas", cta_app: "Abrir a Alocação", cta_anon: "Começar grátis",
  },
  en: {
    crumb: "Help", title: "Allocations: telling your money where to go",
    lead: "You set the percentage you want in each asset class and the app compares it with what you actually hold — turning the gap into simple orders: add, trim, or leave alone.",
    why: "Without targets, a portfolio grows at random: whatever rallied ends up overweight and your risk changes without anyone deciding it. Your allocation is the plan — this page is where the plan is seen and followed.",
    where_label: "Where it lives in the app:", where: "side menu → “Allocation”. On mobile: “More” tab → “Allocation”.",
    s1t: "Set your targets",
    s1p: "In the “Allocation by groups” card, tap “Edit percentages”, type a target for each class (they must add up to 100%) and save. There is no universally right target — it's your risk level; if you're just starting, the Learn page shows typical starting points.",
    s2t: "Read the closed card",
    s2p: "With the editor closed, each class is one line: the bar in the class colour shows what you hold today, the white tick marks your target, and the chip names the action — ▲ Add, ▼ Trim or ✓ on target.",
    s3t: "Switch to Action mode",
    s3p: "In the view selector, pick “Action”. The page becomes a plan: one column with what to add, one with what to trim, amounts already worked out. Gaps of up to 1 percentage point count as “on target” — noise is not an order.",
    s4t: "Open a class's assets",
    s4p: "Tap “view assets” to look inside a class: each asset gets a progress ring against its suggested weight — red far away, amber halfway or above, green on the spot.",
    s5t: "Rebalance your way",
    s5p: "Use the Action-mode amounts as a shopping list for your next contributions. Many people prefer topping up what's missing over selling what's overweight (fewer fees and, in many countries, less tax) — but the call is yours and depends on your situation.",
    s6t: "Come back now and then",
    s6p: "Prices move every day; your plan doesn't need you every day. A look once a week or month is plenty — the page only asks for action when a chip turns ▲ or ▼.",
    note: "This is education about the tool, not personalised investment advice.",
    back: "← All help topics", cta_app: "Open Allocation", cta_anon: "Start for free",
  },
  fr: {
    crumb: "Aide", title: "Allocations : dire à votre argent où aller",
    lead: "Vous fixez le pourcentage voulu pour chaque classe d'actifs et l'app le compare à ce que vous détenez vraiment — l'écart devient des ordres simples : renforcer, alléger ou ne rien faire.",
    why: "Sans objectifs, un portefeuille grandit au hasard : ce qui a beaucoup monté finit par trop peser et le risque change sans que personne ne l'ait décidé. L'allocation est votre plan — cette page est l'endroit où le plan se voit et se tient.",
    where_label: "Où la trouver dans l'app :", where: "menu latéral → « Allocation ». Sur mobile : onglet « Plus » → « Allocation ».",
    s1t: "Fixez vos objectifs",
    s1p: "Dans la carte « Allocation par groupes », touchez « Modifier les pourcentages », saisissez l'objectif de chaque classe (le total doit faire 100 %) et enregistrez. Il n'y a pas d'objectif universel — c'est votre niveau de risque ; si vous débutez, la page Apprendre montre des points de départ typiques.",
    s2t: "Lisez la carte fermée",
    s2p: "Éditeur fermé, chaque classe tient sur une ligne : la barre à la couleur de la classe montre ce que vous détenez, le trait blanc marque l'objectif, et la puce nomme l'action — ▲ Renforcer, ▼ Alléger ou ✓ dans la cible.",
    s3t: "Passez en mode « Action »",
    s3p: "Dans le sélecteur de vues, choisissez « Action ». La page devient un plan : une colonne à renforcer, une à alléger, montants déjà calculés. Un écart jusqu'à 1 point de pourcentage compte comme « dans la cible » — le bruit n'est pas un ordre.",
    s4t: "Ouvrez les actifs d'une classe",
    s4p: "Touchez « voir les actifs » pour regarder dans la classe : chaque actif a un anneau de progression face à son poids suggéré — rouge loin, ambre à mi-chemin ou au-dessus, vert au point.",
    s5t: "Rééquilibrez à votre façon",
    s5p: "Utilisez les montants du mode Action comme liste pour vos prochains versements. Beaucoup préfèrent renforcer ce qui manque plutôt que vendre ce qui dépasse (moins de frais et, dans bien des pays, moins d'impôts) — mais la décision vous appartient et dépend de votre situation.",
    s6t: "Revenez de temps en temps",
    s6p: "Les prix bougent tous les jours ; votre plan n'a pas besoin de vous tous les jours. Un coup d'œil par semaine ou par mois suffit — la page ne demande une action que lorsqu'une puce passe à ▲ ou ▼.",
    note: "Ceci est de l'éducation sur l'outil, pas du conseil en investissement personnalisé.",
    back: "← Toutes les aides", cta_app: "Ouvrir l'Allocation", cta_anon: "Commencer gratuitement",
  },
  de: {
    crumb: "Hilfe", title: "Allokationen: dem Geld sagen, wohin es soll",
    lead: "Du legst fest, wie viel Prozent in jede Anlageklasse sollen, und die App vergleicht das mit dem, was du wirklich hältst — aus der Lücke werden einfache Aufträge: aufstocken, abbauen oder lassen.",
    why: "Ohne Ziele wächst ein Portfolio zufällig: Was stark gestiegen ist, wiegt irgendwann zu viel, und das Risiko ändert sich, ohne dass es jemand entschieden hat. Die Allokation ist dein Plan — auf dieser Seite wird er sichtbar und eingehalten.",
    where_label: "Wo es in der App steht:", where: "Seitenmenü → „Allokation“. Am Handy: Tab „Mehr“ → „Allokation“.",
    s1t: "Ziele festlegen",
    s1p: "Tippe in der Karte „Allokation nach Gruppen“ auf „Prozente bearbeiten“, gib je Klasse ein Ziel ein (zusammen 100 %) und speichere. Ein universell richtiges Ziel gibt es nicht — es ist dein Risikoniveau; für den Anfang zeigt die Lernen-Seite typische Startpunkte.",
    s2t: "Die geschlossene Karte lesen",
    s2p: "Bei geschlossenem Editor ist jede Klasse eine Zeile: Der Balken in der Klassenfarbe zeigt den Ist-Stand, der weiße Strich markiert das Ziel, und der Chip nennt die Aktion — ▲ Aufstocken, ▼ Abbauen oder ✓ im Ziel.",
    s3t: "In den Aktionsmodus wechseln",
    s3p: "Wähle im Ansichts-Umschalter „Aktion“. Die Seite wird zum Plan: eine Spalte zum Aufstocken, eine zum Abbauen, Beträge schon ausgerechnet. Abweichungen bis 1 Prozentpunkt gelten als „im Ziel“ — Rauschen ist kein Auftrag.",
    s4t: "Die Werte einer Klasse öffnen",
    s4p: "Tippe auf „Werte ansehen“, um in die Klasse zu schauen: Jeder Wert hat einen Fortschrittsring gegenüber seinem vorgeschlagenen Gewicht — rot weit weg, bernsteinfarben auf halbem Weg oder darüber, grün am Punkt.",
    s5t: "Auf deine Art rebalancen",
    s5p: "Nutze die Beträge aus dem Aktionsmodus als Einkaufsliste für die nächsten Sparraten. Viele stocken lieber auf, was fehlt, statt zu verkaufen, was übergewichtet ist (weniger Gebühren und in vielen Ländern weniger Steuern) — aber die Entscheidung liegt bei dir und hängt von deiner Lage ab.",
    s6t: "Ab und zu vorbeischauen",
    s6p: "Kurse bewegen sich jeden Tag; dein Plan braucht dich nicht jeden Tag. Ein Blick pro Woche oder Monat reicht — die Seite verlangt erst etwas, wenn ein Chip auf ▲ oder ▼ springt.",
    note: "Das ist Wissensvermittlung über das Werkzeug, keine persönliche Anlageberatung.",
    back: "← Alle Hilfen", cta_app: "Allokation öffnen", cta_anon: "Kostenlos starten",
  },
  it: {
    crumb: "Aiuto", title: "Allocazioni: dire ai soldi dove andare",
    lead: "Imposti la percentuale che vuoi in ogni classe di attivi e l'app la confronta con ciò che possiedi davvero — trasformando la differenza in ordini semplici: rafforzare, alleggerire o lasciar stare.",
    why: "Senza obiettivi un portafoglio cresce a caso: ciò che è salito molto finisce per pesare troppo e il rischio cambia senza che nessuno l'abbia deciso. L'allocazione è il tuo piano — questa pagina è dove il piano si vede e si rispetta.",
    where_label: "Dove si trova nell'app:", where: "menu laterale → «Allocazione». Su mobile: scheda «Altro» → «Allocazione».",
    s1t: "Imposta gli obiettivi",
    s1p: "Nella scheda «Allocazione per gruppi», tocca «Modifica percentuali», scrivi l'obiettivo di ogni classe (devono sommare al 100%) e salva. Non esiste un obiettivo giusto universale — è il tuo livello di rischio; se stai iniziando, la pagina Impara mostra punti di partenza tipici.",
    s2t: "Leggi la scheda chiusa",
    s2p: "Con l'editor chiuso ogni classe è una riga: la barra nel colore della classe mostra ciò che hai oggi, la tacca bianca segna l'obiettivo e il chip dice l'azione — ▲ Rafforzare, ▼ Alleggerire o ✓ in linea.",
    s3t: "Passa alla modalità «Azione»",
    s3p: "Nel selettore di viste scegli «Azione». La pagina diventa un piano: una colonna con cosa rafforzare, una con cosa alleggerire, importi già calcolati. Scarti fino a 1 punto percentuale contano come «in linea» — il rumore non è un ordine.",
    s4t: "Apri gli asset di una classe",
    s4p: "Tocca «vedi asset» per guardare dentro la classe: ogni asset ha un anello di avanzamento rispetto al peso suggerito — rosso lontano, ambra a metà strada o sopra, verde al punto giusto.",
    s5t: "Ribilancia a modo tuo",
    s5p: "Usa gli importi della modalità Azione come lista per i prossimi versamenti. Molti preferiscono rafforzare ciò che manca invece di vendere ciò che è in eccesso (meno costi e, in molti paesi, meno tasse) — ma la decisione è tua e dipende dalla tua situazione.",
    s6t: "Torna ogni tanto",
    s6p: "I prezzi si muovono ogni giorno; il tuo piano non ha bisogno di te ogni giorno. Un'occhiata a settimana o al mese basta — la pagina chiede un'azione solo quando un chip passa a ▲ o ▼.",
    note: "Questa è formazione sullo strumento, non consulenza d'investimento personalizzata.",
    back: "← Tutte le guide", cta_app: "Apri l'Allocazione", cta_anon: "Inizia gratis",
  },
  es: {
    crumb: "Ayuda", title: "Asignaciones: decirle al dinero adónde ir",
    lead: "Defines el porcentaje que quieres en cada clase de activos y la app lo compara con lo que tienes de verdad — convirtiendo la diferencia en órdenes simples: reforzar, aliviar o dejar estar.",
    why: "Sin objetivos, una cartera crece al azar: lo que subió mucho acaba pesando demasiado y el riesgo cambia sin que nadie lo haya decidido. La asignación es tu plan — esta página es donde el plan se ve y se cumple.",
    where_label: "Dónde está en la app:", where: "menú lateral → «Asignación». En el móvil: pestaña «Más» → «Asignación».",
    s1t: "Define los objetivos",
    s1p: "En la tarjeta «Asignación por grupos», toca «Editar porcentajes», escribe el objetivo de cada clase (deben sumar 100%) y guarda. No hay un objetivo correcto universal — es tu nivel de riesgo; si estás empezando, la página Aprender muestra puntos de partida típicos.",
    s2t: "Lee la tarjeta cerrada",
    s2p: "Con el editor cerrado, cada clase es una línea: la barra del color de la clase muestra lo que tienes hoy, la marca blanca señala el objetivo y el chip dice la acción — ▲ Reforzar, ▼ Aliviar o ✓ en objetivo.",
    s3t: "Cambia al modo «Acción»",
    s3p: "En el selector de vistas elige «Acción». La página se convierte en un plan: una columna con qué reforzar, otra con qué aliviar, con los importes ya calculados. Diferencias de hasta 1 punto porcentual cuentan como «en objetivo» — el ruido no es una orden.",
    s4t: "Abre los activos de una clase",
    s4p: "Toca «ver activos» para mirar dentro de la clase: cada activo tiene un anillo de progreso frente a su peso sugerido — rojo lejos, ámbar a medio camino o por encima, verde en el punto.",
    s5t: "Reequilibra a tu manera",
    s5p: "Usa los importes del modo Acción como lista para tus próximas aportaciones. Mucha gente prefiere reforzar lo que falta antes que vender lo que sobra (menos costes y, en muchos países, menos impuestos) — pero la decisión es tuya y depende de tu situación.",
    s6t: "Vuelve de vez en cuando",
    s6p: "Los precios se mueven cada día; tu plan no te necesita cada día. Un vistazo a la semana o al mes basta — la página solo pide acción cuando un chip pasa a ▲ o ▼.",
    note: "Esto es educación sobre la herramienta, no asesoramiento de inversión personalizado.",
    back: "← Todas las ayudas", cta_app: "Abrir la Asignación", cta_anon: "Empezar gratis",
  },
};

export default function AjudasAlocacoes() {
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
            <Link to="/alocacao" className={BTN}>{c.cta_app}</Link>
          ) : (
            <Link to="/register" className={BTN}>{c.cta_anon}</Link>
          )}
        </div>
      </div>
    </div>
  );
}

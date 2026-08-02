import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../context/I18nContext";
import { useAuth } from "../context/AuthContext";
import { PublicHeader, Step, WhereBox, BTN } from "../components/AjudasKit";

// Artigo de ajuda: Alertas de preço (/ajudas/alertas) — 2 ago 2026. Escrito
// a partir do ecrã real (Alerts.jsx + chaves alert.* do I18nContext): criar
// («Das suas posições» ou pesquisa), condição Acima/Abaixo + preço alvo,
// canais (email sempre; push/Telegram nas Definições; aviso do navegador só
// com o separador aberto), lista com Alvo/Atual/Distância/Estado, limite do
// plano gratuito. Desde 1 ago aceita os 4 tipos: ações, ETFs, REITs, cripto.

const COPY = {
  pt: {
    crumb: "Ajudas", title: "Alertas de preço: a app vigia por ti",
    lead: "Define um preço-alvo para qualquer ativo — ações, ETFs, REITs ou cripto — e recebe o aviso quando for atravessado, mesmo com a app fechada.",
    why: "Ver cotações todos os dias é a receita para decisões impulsivas. Um alerta inverte o jogo: decides o preço com calma, hoje — e o mercado é que te chama quando lá chegar.",
    where_label: "Onde está na app:", where: "menu lateral → «Alertas». No telemóvel: separador «Mais» → «Alertas».",
    s1t: "Cria o alerta",
    s1p: "Toca em «Novo Alerta». Podes escolher um ativo «Das suas posições» (um toque) ou pesquisar qualquer ativo do mercado — não precisas de o ter em carteira para o vigiar.",
    s2t: "Define a condição",
    s2p: "Escolhe «Acima» ou «Abaixo» e escreve o preço alvo. A app mostra o preço atual e a distância percentual até ao alvo, para calibrares. Há uma nota opcional para te lembrares porquê (ex.: «alvo de take profit»).",
    s3t: "Escolhe onde queres ser avisado",
    s3p: "O email vai sempre. Nas Definições podes ligar mais dois canais: notificações push neste dispositivo e o Telegram (mensagem instantânea do bot). O aviso do navegador, esse, só funciona com o separador aberto — por isso existem os outros.",
    s4t: "Acompanha na lista",
    s4p: "Cada alerta mostra Alvo, Atual, Distância e Estado — Ativo, Pausado ou Acionado com a data. Podes editar o alvo ou eliminar o alerta a qualquer momento.",
    s5t: "Quando dispara",
    s5p: "O alerta passa a «Acionado» e fica na lista com a data, como registo. Não volta a disparar sozinho — se quiseres continuar a vigiar o mesmo ativo, cria um novo com o próximo alvo.",
    s6t: "Usa alvos com significado",
    s6p: "Um alerta por «curiosidade» só te devolve o hábito de olhar. Os melhores alvos vêm do teu plano: o preço a que reforçarias, o preço a que aliviarias, o limiar que muda a tua tese. No plano gratuito há um limite de alertas ativos; no Pro são ilimitados.",
    note: "Isto é educação sobre a ferramenta, não aconselhamento de investimento personalizado.",
    back: "← Todas as ajudas", cta_app: "Abrir os Alertas", cta_anon: "Começar grátis",
  },
  en: {
    crumb: "Help", title: "Price alerts: the app keeps watch for you",
    lead: "Set a target price for any asset — stocks, ETFs, REITs or crypto — and get notified when it's crossed, even with the app closed.",
    why: "Checking prices every day is a recipe for impulsive decisions. An alert flips the game: you pick the price calmly, today — and the market calls you when it gets there.",
    where_label: "Where it lives in the app:", where: "side menu → “Alerts”. On mobile: “More” tab → “Alerts”.",
    s1t: "Create the alert",
    s1p: "Tap “New Alert”. Pick an asset “From your holdings” (one tap) or search any asset on the market — you don't need to own it to watch it.",
    s2t: "Set the condition",
    s2p: "Choose “Above” or “Below” and type the target price. The app shows the current price and the percentage distance to your target, so you can calibrate. An optional note reminds you why (e.g. “take-profit target”).",
    s3t: "Choose where to be notified",
    s3p: "Email always goes out. In Settings you can enable two more channels: push notifications on this device and Telegram (an instant message from the bot). The browser notification only works with the tab open — that's why the others exist.",
    s4t: "Follow the list",
    s4p: "Each alert shows Target, Current, Distance and Status — Active, Paused, or Triggered with its date. You can edit the target or delete the alert at any time.",
    s5t: "When it fires",
    s5p: "The alert turns “Triggered” and stays in the list with the date, as a record. It won't fire again by itself — to keep watching the same asset, create a new one with your next target.",
    s6t: "Use targets that mean something",
    s6p: "A “curiosity” alert just gives you back the habit of checking. The best targets come from your plan: the price you'd add at, the price you'd trim at, the threshold that changes your thesis. The free plan has a limit of active alerts; Pro is unlimited.",
    note: "This is education about the tool, not personalised investment advice.",
    back: "← All help topics", cta_app: "Open Alerts", cta_anon: "Start for free",
  },
  fr: {
    crumb: "Aide", title: "Alertes de prix : l'app veille pour vous",
    lead: "Fixez un prix cible pour n'importe quel actif — actions, ETF, REIT ou crypto — et soyez prévenu quand il est franchi, même app fermée.",
    why: "Regarder les cours tous les jours, c'est la recette des décisions impulsives. Une alerte inverse le jeu : vous choisissez le prix au calme, aujourd'hui — et c'est le marché qui vous appelle quand il y arrive.",
    where_label: "Où les trouver dans l'app :", where: "menu latéral → « Alertes ». Sur mobile : onglet « Plus » → « Alertes ».",
    s1t: "Créez l'alerte",
    s1p: "Touchez « Nouvelle alerte ». Choisissez un actif « Depuis vos positions » (un geste) ou cherchez n'importe quel actif du marché — pas besoin de le détenir pour le surveiller.",
    s2t: "Définissez la condition",
    s2p: "Choisissez « Au-dessus » ou « En dessous » et saisissez le prix cible. L'app affiche le prix actuel et la distance en pourcentage jusqu'à la cible, pour calibrer. Une note optionnelle rappelle le pourquoi (ex. : « cible de take profit »).",
    s3t: "Choisissez où être prévenu",
    s3p: "L'email part toujours. Dans les Réglages, deux canaux de plus : notifications push sur cet appareil et Telegram (message instantané du bot). La notification du navigateur, elle, ne marche qu'onglet ouvert — d'où les autres.",
    s4t: "Suivez la liste",
    s4p: "Chaque alerte affiche Cible, Actuel, Distance et État — Active, En pause, ou Déclenchée avec sa date. Vous pouvez modifier la cible ou supprimer l'alerte à tout moment.",
    s5t: "Quand elle se déclenche",
    s5p: "L'alerte passe à « Déclenchée » et reste dans la liste avec la date, comme trace. Elle ne se redéclenche pas seule — pour continuer à surveiller le même actif, créez-en une nouvelle avec la prochaine cible.",
    s6t: "Utilisez des cibles qui ont du sens",
    s6p: "Une alerte « par curiosité » ne fait que vous rendre l'habitude de regarder. Les meilleures cibles viennent de votre plan : le prix où vous renforceriez, celui où vous allégeriez, le seuil qui change votre thèse. Le plan gratuit limite les alertes actives ; Pro est illimité.",
    note: "Ceci est de l'éducation sur l'outil, pas du conseil en investissement personnalisé.",
    back: "← Toutes les aides", cta_app: "Ouvrir les Alertes", cta_anon: "Commencer gratuitement",
  },
  de: {
    crumb: "Hilfe", title: "Preisalarme: die App hält für dich Wache",
    lead: "Lege für jeden Vermögenswert — Aktien, ETFs, REITs oder Krypto — einen Zielpreis fest und werde benachrichtigt, wenn er durchbrochen wird, auch bei geschlossener App.",
    why: "Jeden Tag auf Kurse zu schauen ist das Rezept für impulsive Entscheidungen. Ein Alarm dreht das Spiel um: Du wählst den Preis in Ruhe, heute — und der Markt ruft dich, wenn er dort ankommt.",
    where_label: "Wo es in der App steht:", where: "Seitenmenü → „Alarme“. Am Handy: Tab „Mehr“ → „Alarme“.",
    s1t: "Alarm anlegen",
    s1p: "Tippe auf „Neuer Alarm“. Wähle einen Wert „Aus deinen Positionen“ (ein Tipp) oder suche jeden beliebigen Wert am Markt — du musst ihn nicht besitzen, um ihn zu beobachten.",
    s2t: "Bedingung festlegen",
    s2p: "Wähle „Über“ oder „Unter“ und gib den Zielpreis ein. Die App zeigt den aktuellen Preis und die prozentuale Distanz zum Ziel, zum Kalibrieren. Eine optionale Notiz erinnert ans Warum (z. B. „Take-Profit-Ziel“).",
    s3t: "Wählen, wo du benachrichtigt wirst",
    s3p: "Die E-Mail geht immer raus. In den Einstellungen kannst du zwei weitere Kanäle aktivieren: Push-Benachrichtigungen auf diesem Gerät und Telegram (Sofortnachricht vom Bot). Die Browser-Benachrichtigung funktioniert nur bei offenem Tab — deshalb gibt es die anderen.",
    s4t: "Die Liste verfolgen",
    s4p: "Jeder Alarm zeigt Ziel, Aktuell, Distanz und Status — Aktiv, Pausiert oder Ausgelöst mit Datum. Du kannst das Ziel jederzeit ändern oder den Alarm löschen.",
    s5t: "Wenn er auslöst",
    s5p: "Der Alarm wird „Ausgelöst“ und bleibt mit Datum in der Liste, als Protokoll. Er löst nicht von selbst erneut aus — willst du denselben Wert weiter beobachten, lege einen neuen mit dem nächsten Ziel an.",
    s6t: "Ziele mit Bedeutung wählen",
    s6p: "Ein „Neugier“-Alarm gibt dir nur die Gewohnheit des Nachschauens zurück. Die besten Ziele kommen aus deinem Plan: der Preis, zu dem du aufstocken würdest, der, zu dem du abbauen würdest, die Schwelle, die deine These ändert. Der Gratisplan begrenzt aktive Alarme; Pro ist unbegrenzt.",
    note: "Das ist Wissensvermittlung über das Werkzeug, keine persönliche Anlageberatung.",
    back: "← Alle Hilfen", cta_app: "Alarme öffnen", cta_anon: "Kostenlos starten",
  },
  it: {
    crumb: "Aiuto", title: "Avvisi di prezzo: l'app fa la guardia per te",
    lead: "Imposta un prezzo obiettivo per qualsiasi asset — azioni, ETF, REIT o cripto — e ricevi l'avviso quando viene attraversato, anche ad app chiusa.",
    why: "Guardare le quotazioni ogni giorno è la ricetta delle decisioni impulsive. Un avviso ribalta il gioco: scegli il prezzo con calma, oggi — ed è il mercato a chiamarti quando ci arriva.",
    where_label: "Dove si trovano nell'app:", where: "menu laterale → «Avvisi». Su mobile: scheda «Altro» → «Avvisi».",
    s1t: "Crea l'avviso",
    s1p: "Tocca «Nuovo avviso». Scegli un asset «Dalle tue posizioni» (un tocco) o cerca qualsiasi asset sul mercato — non serve possederlo per sorvegliarlo.",
    s2t: "Definisci la condizione",
    s2p: "Scegli «Sopra» o «Sotto» e scrivi il prezzo obiettivo. L'app mostra il prezzo attuale e la distanza percentuale dall'obiettivo, per calibrare. Una nota opzionale ricorda il perché (es.: «obiettivo di take profit»).",
    s3t: "Scegli dove essere avvisato",
    s3p: "L'email parte sempre. Nelle Impostazioni puoi attivare altri due canali: notifiche push su questo dispositivo e Telegram (messaggio istantaneo dal bot). La notifica del browser funziona solo con la scheda aperta — per questo esistono gli altri.",
    s4t: "Segui la lista",
    s4p: "Ogni avviso mostra Obiettivo, Attuale, Distanza e Stato — Attivo, In pausa o Scattato con la data. Puoi modificare l'obiettivo o eliminare l'avviso in qualsiasi momento.",
    s5t: "Quando scatta",
    s5p: "L'avviso diventa «Scattato» e resta nella lista con la data, come registro. Non scatta di nuovo da solo — per continuare a sorvegliare lo stesso asset, creane uno nuovo con il prossimo obiettivo.",
    s6t: "Usa obiettivi che significano qualcosa",
    s6p: "Un avviso «per curiosità» ti restituisce solo l'abitudine di guardare. I migliori obiettivi vengono dal tuo piano: il prezzo a cui rafforzeresti, quello a cui alleggeriresti, la soglia che cambia la tua tesi. Il piano gratuito limita gli avvisi attivi; Pro è illimitato.",
    note: "Questa è formazione sullo strumento, non consulenza d'investimento personalizzata.",
    back: "← Tutte le guide", cta_app: "Apri gli Avvisi", cta_anon: "Inizia gratis",
  },
  es: {
    crumb: "Ayuda", title: "Alertas de precio: la app vigila por ti",
    lead: "Define un precio objetivo para cualquier activo — acciones, ETFs, REITs o cripto — y recibe el aviso cuando se cruce, incluso con la app cerrada.",
    why: "Mirar cotizaciones cada día es la receta de las decisiones impulsivas. Una alerta invierte el juego: eliges el precio con calma, hoy — y es el mercado quien te llama cuando llegue.",
    where_label: "Dónde está en la app:", where: "menú lateral → «Alertas». En el móvil: pestaña «Más» → «Alertas».",
    s1t: "Crea la alerta",
    s1p: "Toca «Nueva alerta». Elige un activo «De tus posiciones» (un toque) o busca cualquier activo del mercado — no necesitas tenerlo para vigilarlo.",
    s2t: "Define la condición",
    s2p: "Elige «Por encima» o «Por debajo» y escribe el precio objetivo. La app muestra el precio actual y la distancia porcentual hasta el objetivo, para calibrar. Hay una nota opcional para recordar el porqué (ej.: «objetivo de take profit»).",
    s3t: "Elige dónde quieres el aviso",
    s3p: "El email sale siempre. En Ajustes puedes activar dos canales más: notificaciones push en este dispositivo y Telegram (mensaje instantáneo del bot). El aviso del navegador solo funciona con la pestaña abierta — por eso existen los otros.",
    s4t: "Síguelo en la lista",
    s4p: "Cada alerta muestra Objetivo, Actual, Distancia y Estado — Activa, Pausada o Disparada con su fecha. Puedes editar el objetivo o eliminar la alerta en cualquier momento.",
    s5t: "Cuando se dispara",
    s5p: "La alerta pasa a «Disparada» y queda en la lista con la fecha, como registro. No vuelve a dispararse sola — para seguir vigilando el mismo activo, crea una nueva con el siguiente objetivo.",
    s6t: "Usa objetivos con significado",
    s6p: "Una alerta «por curiosidad» solo te devuelve el hábito de mirar. Los mejores objetivos salen de tu plan: el precio al que reforzarías, al que aliviarías, el umbral que cambia tu tesis. El plan gratuito limita las alertas activas; Pro es ilimitado.",
    note: "Esto es educación sobre la herramienta, no asesoramiento de inversión personalizado.",
    back: "← Todas las ayudas", cta_app: "Abrir las Alertas", cta_anon: "Empezar gratis",
  },
};

export default function AjudasAlertas() {
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
            <Link to="/alerts" className={BTN}>{c.cta_app}</Link>
          ) : (
            <Link to="/register" className={BTN}>{c.cta_anon}</Link>
          )}
        </div>
      </div>
    </div>
  );
}

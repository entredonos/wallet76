import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../context/I18nContext";

const TAGS = {
  new:      { label: { pt: "Novo", en: "New", fr: "Nouveau", de: "Neu", it: "Novità", es: "Nuevo" },            cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  improved: { label: { pt: "Melhoria", en: "Improved", fr: "Amélioration", de: "Verbesserung", it: "Miglioramento", es: "Mejora" }, cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  security: { label: { pt: "Segurança", en: "Security", fr: "Sécurité", de: "Sicherheit", it: "Sicurezza", es: "Seguridad" },       cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  legal:    { label: { pt: "Legal", en: "Legal", fr: "Légal", de: "Rechtliches", it: "Legale", es: "Legal" },   cls: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
};

const ENTRIES = [
  { date: "2026-07-18", tag: "new", t: {
    pt: { title: "Planos e preços em várias moedas", desc: "Podes agora ver os preços em EUR, CHF, USD ou BRL e escolher a moeda na página de preços. Limites mais claros entre o plano Gratuito e o Pro." },
    en: { title: "Multi-currency plans and pricing", desc: "You can now view prices in EUR, CHF, USD or BRL and pick your currency on the pricing page. Clearer limits between the Free and Pro plans." },
    fr: { title: "Formules et tarifs multi-devises", desc: "Vous pouvez désormais afficher les prix en EUR, CHF, USD ou BRL et choisir votre devise sur la page des tarifs. Des limites plus claires entre les formules Gratuite et Pro." },
    de: { title: "Mehrwährungs-Pläne und Preise", desc: "Sie können Preise jetzt in EUR, CHF, USD oder BRL anzeigen und Ihre Währung auf der Preisseite wählen. Klarere Grenzen zwischen Gratis- und Pro-Plan." },
    it: { title: "Piani e prezzi multivaluta", desc: "Ora puoi vedere i prezzi in EUR, CHF, USD o BRL e scegliere la valuta nella pagina dei prezzi. Limiti più chiari tra piano Gratuito e Pro." },
    es: { title: "Planes y precios multidivisa", desc: "Ahora puedes ver los precios en EUR, CHF, USD o BRL y elegir tu moneda en la página de precios. Límites más claros entre el plan Gratis y Pro." },
  }},
  { date: "2026-07-15", tag: "improved", t: {
    pt: { title: "Alertas mais fiáveis, agora com Telegram e push", desc: "Melhorámos a resiliência dos preços para os alertas dispararem de forma consistente. Os utilizadores Pro recebem alertas também por Telegram e notificações push, além do email." },
    en: { title: "More reliable alerts, now with Telegram and push", desc: "We improved price resilience so alerts fire consistently. Pro users also get alerts via Telegram and push notifications, in addition to email." },
    fr: { title: "Alertes plus fiables, désormais avec Telegram et push", desc: "Nous avons amélioré la résilience des prix pour des alertes cohérentes. Les utilisateurs Pro reçoivent aussi des alertes via Telegram et notifications push, en plus de l'e-mail." },
    de: { title: "Zuverlässigere Alarme, jetzt mit Telegram und Push", desc: "Wir haben die Preis-Resilienz verbessert, damit Alarme zuverlässig auslösen. Pro-Nutzer erhalten Alarme zusätzlich per Telegram und Push-Benachrichtigungen, neben E-Mail." },
    it: { title: "Avvisi più affidabili, ora con Telegram e push", desc: "Abbiamo migliorato la resilienza dei prezzi per avvisi coerenti. Gli utenti Pro ricevono avvisi anche via Telegram e notifiche push, oltre all'email." },
    es: { title: "Alertas más fiables, ahora con Telegram y push", desc: "Mejoramos la resiliencia de precios para que las alertas se disparen de forma constante. Los usuarios Pro reciben alertas también por Telegram y notificaciones push, además del correo." },
  }},
  { date: "2026-07-12", tag: "security", t: {
    pt: { title: "Segurança reforçada", desc: "Autenticação de dois fatores (2FA), encriptação das chaves de brokers e melhor gestão de sessões para manter a tua conta protegida." },
    en: { title: "Strengthened security", desc: "Two-factor authentication (2FA), encryption of broker keys and improved session management to keep your account protected." },
    fr: { title: "Sécurité renforcée", desc: "Authentification à deux facteurs (2FA), chiffrement des clés de courtiers et meilleure gestion des sessions pour protéger votre compte." },
    de: { title: "Verstärkte Sicherheit", desc: "Zwei-Faktor-Authentifizierung (2FA), Verschlüsselung der Broker-Schlüssel und verbessertes Sitzungsmanagement zum Schutz Ihres Kontos." },
    it: { title: "Sicurezza rafforzata", desc: "Autenticazione a due fattori (2FA), cifratura delle chiavi dei broker e migliore gestione delle sessioni per proteggere il tuo account." },
    es: { title: "Seguridad reforzada", desc: "Autenticación de dos factores (2FA), cifrado de las claves de brokers y mejor gestión de sesiones para proteger tu cuenta." },
  }},
  { date: "2026-07-08", tag: "improved", t: {
    pt: { title: "Emails e ajuda no teu idioma", desc: "Os emails de verificação e recuperação e o painel de ajuda passam a respeitar o idioma que escolheste, nas 6 línguas suportadas." },
    en: { title: "Emails and help in your language", desc: "Verification and recovery emails and the help panel now follow the language you chose, across all 6 supported languages." },
    fr: { title: "E-mails et aide dans votre langue", desc: "Les e-mails de vérification et de récupération et le panneau d'aide respectent désormais la langue choisie, dans les 6 langues prises en charge." },
    de: { title: "E-Mails und Hilfe in Ihrer Sprache", desc: "Verifizierungs- und Wiederherstellungs-E-Mails sowie das Hilfefenster folgen jetzt Ihrer gewählten Sprache, in allen 6 unterstützten Sprachen." },
    it: { title: "Email e aiuto nella tua lingua", desc: "Le email di verifica e recupero e il pannello di aiuto ora rispettano la lingua scelta, in tutte e 6 le lingue supportate." },
    es: { title: "Correos y ayuda en tu idioma", desc: "Los correos de verificación y recuperación y el panel de ayuda ahora respetan el idioma que elegiste, en los 6 idiomas admitidos." },
  }},
  { date: "2026-07-05", tag: "legal", t: {
    pt: { title: "Privacidade e conformidade", desc: "Política de privacidade atualizada com a lista de subprocessadores (RGPD) e a lei suíça de proteção de dados (nLPD), termos mais claros e página de informação legal." },
    en: { title: "Privacy and compliance", desc: "Updated privacy policy with the subprocessor list (GDPR) and Swiss data protection law (nFADP), clearer terms and a legal notice page." },
    fr: { title: "Confidentialité et conformité", desc: "Politique de confidentialité mise à jour avec la liste des sous-traitants (RGPD) et la loi suisse sur la protection des données (nLPD), des conditions plus claires et une page de mentions légales." },
    de: { title: "Datenschutz und Compliance", desc: "Aktualisierte Datenschutzerklärung mit Liste der Auftragsverarbeiter (DSGVO) und schweizerischem Datenschutzgesetz (revDSG), klarere Bedingungen und eine Impressum-Seite." },
    it: { title: "Privacy e conformità", desc: "Informativa sulla privacy aggiornata con l'elenco dei responsabili (GDPR) e la legge svizzera sulla protezione dei dati (nLPD), termini più chiari e una pagina di note legali." },
    es: { title: "Privacidad y cumplimiento", desc: "Política de privacidad actualizada con la lista de subprocesadores (RGPD) y la ley suiza de protección de datos (nLPD), términos más claros y una página de aviso legal." },
  }},
];

const COPY = {
  pt: { title: "Estado e novidades", subtitle: "Estado do serviço em tempo real e histórico de melhorias.", operational: "Todos os sistemas operacionais", down: "Problemas detetados", checking: "A verificar…", last: "Última verificação" },
  en: { title: "Status & updates", subtitle: "Real-time service status and a history of improvements.", operational: "All systems operational", down: "Issues detected", checking: "Checking…", last: "Last checked" },
  fr: { title: "État et nouveautés", subtitle: "État du service en temps réel et historique des améliorations.", operational: "Tous les systèmes opérationnels", down: "Problèmes détectés", checking: "Vérification…", last: "Dernière vérification" },
  de: { title: "Status & Neuigkeiten", subtitle: "Echtzeit-Servicestatus und Verlauf der Verbesserungen.", operational: "Alle Systeme betriebsbereit", down: "Probleme erkannt", checking: "Wird geprüft…", last: "Zuletzt geprüft" },
  it: { title: "Stato e novità", subtitle: "Stato del servizio in tempo reale e cronologia dei miglioramenti.", operational: "Tutti i sistemi operativi", down: "Problemi rilevati", checking: "Verifica in corso…", last: "Ultima verifica" },
  es: { title: "Estado y novedades", subtitle: "Estado del servicio en tiempo real e historial de mejoras.", operational: "Todos los sistemas operativos", down: "Problemas detectados", checking: "Comprobando…", last: "Última comprobación" },
};

const LOCALE = { pt: "pt-PT", en: "en-GB", fr: "fr-FR", de: "de-DE", it: "it-IT", es: "es-ES" };

export default function Status() {
  const { lang } = useI18n();
  const c = COPY[lang] || COPY.en;
  const loc = LOCALE[lang] || "en-GB";

  const [state, setState] = useState("checking"); // checking | up | down
  const [checkedAt, setCheckedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        await api.get("/", { timeout: 8000 });
        if (!cancelled) { setState("up"); setCheckedAt(new Date()); }
      } catch {
        if (!cancelled) { setState("down"); setCheckedAt(new Date()); }
      }
    };
    check();
    const id = setInterval(check, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const banner =
    state === "up"
      ? { icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />, text: c.operational, cls: "border-emerald-500/30 bg-emerald-500/5" }
      : state === "down"
      ? { icon: <AlertTriangle className="w-5 h-5 text-red-400" />, text: c.down, cls: "border-red-500/30 bg-red-500/5" }
      : { icon: <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />, text: c.checking, cls: "border-zinc-700 bg-zinc-900" };

  const fmtDate = (iso) => {
    try { return new Date(iso + "T00:00:00").toLocaleDateString(loc, { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return iso; }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-sm mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Wallet76
        </Link>
        <h1 className="text-3xl font-bold text-zinc-100 mb-2">{c.title}</h1>
        <p className="text-sm text-zinc-500 mb-8">{c.subtitle}</p>

        <div className={`flex items-center gap-3 rounded-xl border px-5 py-4 mb-12 ${banner.cls}`}>
          {banner.icon}
          <span className="font-semibold text-zinc-100">{banner.text}</span>
          {checkedAt && (
            <span className="ml-auto text-xs text-zinc-500">
              {c.last}: {checkedAt.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        <div className="relative border-l border-zinc-800 pl-6 space-y-10">
          {ENTRIES.map((e) => {
            const tr = e.t[lang] || e.t.en;
            const tag = TAGS[e.tag];
            return (
              <div key={e.date + tr.title} className="relative">
                <span className="absolute -left-[27px] top-1.5 w-2.5 h-2.5 rounded-full bg-zinc-600 ring-4 ring-zinc-950" />
                <div className="flex items-center gap-3 mb-1.5">
                  <span className="text-xs text-zinc-500">{fmtDate(e.date)}</span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${tag.cls}`}>
                    {tag.label[lang] || tag.label.en}
                  </span>
                </div>
                <h2 className="text-base font-semibold text-zinc-100 mb-1">{tr.title}</h2>
                <p className="text-sm text-zinc-400 leading-relaxed">{tr.desc}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-14 pt-8 border-t border-zinc-800 flex gap-6 text-xs text-zinc-600">
          <Link to="/pricing" className="hover:text-zinc-400 transition-colors">Pricing</Link>
          <Link to="/" className="hover:text-zinc-400 transition-colors">Back to Wallet76</Link>
        </div>
      </div>
    </div>
  );
}

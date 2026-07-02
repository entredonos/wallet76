import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";

const KEY = "wallet76_cookie_consent";

const TEXT = {
  en: {
    msg: "We use strictly necessary cookies to keep you logged in and remember your preferences. No advertising or tracking cookies.",
    accept: "Accept",
    decline: "Decline",
    privacy: "Privacy Policy",
  },
  pt: {
    msg: "Usamos cookies estritamente necessários para manter a sessão e lembrar as suas preferências. Sem cookies de publicidade ou rastreamento.",
    accept: "Aceitar",
    decline: "Recusar",
    privacy: "Política de Privacidade",
  },
  fr: {
    msg: "Nous utilisons uniquement des cookies strictement nécessaires pour maintenir votre session et mémoriser vos préférences. Pas de cookies publicitaires.",
    accept: "Accepter",
    decline: "Refuser",
    privacy: "Politique de confidentialité",
  },
  de: {
    msg: "Wir verwenden nur unbedingt notwendige Cookies, um Sie angemeldet zu halten und Ihre Einstellungen zu speichern. Keine Werbe-Cookies.",
    accept: "Akzeptieren",
    decline: "Ablehnen",
    privacy: "Datenschutzerklärung",
  },
  it: {
    msg: "Utilizziamo solo cookie strettamente necessari per mantenerti connesso e ricordare le tue preferenze. Nessun cookie pubblicitario.",
    accept: "Accetta",
    decline: "Rifiuta",
    privacy: "Informativa sulla Privacy",
  },
  es: {
    msg: "Usamos solo cookies estrictamente necesarias para mantenerte conectado y recordar tus preferencias. Sin cookies publicitarias ni de rastreo.",
    accept: "Aceptar",
    decline: "Rechazar",
    privacy: "Política de Privacidad",
  },
};

export default function CookieBanner({ lang = "en" }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const respond = (accepted) => {
    try { localStorage.setItem(KEY, accepted ? "accepted" : "declined"); } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  const tx = TEXT[lang] || TEXT.en;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-start gap-3 mb-3">
          <Cookie className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-zinc-400 leading-relaxed">
            {tx.msg}{" "}
            <Link to="/privacy" className="text-zinc-300 underline underline-offset-2 hover:text-white transition-colors">
              {tx.privacy}
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => respond(true)}
            className="flex-1 bg-white text-zinc-950 text-xs font-semibold py-2 rounded-lg hover:bg-zinc-100 transition-colors"
          >
            {tx.accept}
          </button>
          <button
            onClick={() => respond(false)}
            className="flex-1 border border-zinc-700 text-zinc-400 text-xs font-semibold py-2 rounded-lg hover:border-zinc-500 hover:text-zinc-200 transition-colors"
          >
            {tx.decline}
          </button>
        </div>
      </div>
    </div>
  );
}

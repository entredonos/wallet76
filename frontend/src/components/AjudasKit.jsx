import React from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../context/I18nContext";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/wallet76-logo.png";

// Kit partilhado das páginas públicas de ajuda (/ajudas e /ajudas/*) — 2 ago
// 2026. Duas peças: o cabeçalho público que olha para a sessão (pedido do
// Jose: quem vem da app não pode ter de voltar pelo landing — com sessão o
// CTA vira «Voltar à app» → /dashboard) e os blocos do artigo-tipo (passo
// numerado, caixa «onde está na app»). As labels vivem aqui ×6 (REGRA #1),
// no padrão dos COPY locais do Pricing/Aprender.

const LBL = {
  pt: { back: "Voltar ao site", start: "Começar grátis", app: "← Voltar à app" },
  en: { back: "Back to site", start: "Start for free", app: "← Back to the app" },
  fr: { back: "Retour au site", start: "Commencer gratuitement", app: "← Retour à l'app" },
  de: { back: "Zurück zur Website", start: "Kostenlos starten", app: "← Zurück zur App" },
  it: { back: "Torna al sito", start: "Inizia gratis", app: "← Torna all'app" },
  es: { back: "Volver al sitio", start: "Empezar gratis", app: "← Volver a la app" },
};

export const BTN =
  "inline-block bg-blue-600 hover:bg-blue-500 transition-colors text-white font-semibold text-sm rounded-lg px-4 py-2.5";
export const GHOST =
  "inline-block bg-[#1a1f26] hover:bg-[#242a32] transition-colors border border-zinc-800 text-zinc-100 font-semibold text-sm rounded-lg px-4 py-2.5";

export function PublicHeader() {
  const { lang } = useI18n();
  const { user } = useAuth();
  const l = LBL[lang] || LBL.en;
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-800 bg-[#0b0e11]/90 backdrop-blur px-6 py-3.5">
      <div className="max-w-3xl mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <img src={logo} alt="Wallet76" className="h-8 w-auto shrink-0" />
          <span className="font-extrabold tracking-tight text-white truncate">Wallet76</span>
        </Link>
        <div className="flex items-center gap-2.5">
          {!user && (
            <Link to="/" className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:inline">
              {l.back}
            </Link>
          )}
          {user ? (
            <Link to="/dashboard" className={GHOST}>{l.app}</Link>
          ) : (
            <Link to="/register" className={BTN}>{l.start}</Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function Step({ n, title, children }) {
  return (
    <div className="flex gap-3.5 mb-6">
      <div className="flex-none w-7 h-7 rounded-full bg-[#1a1f26] border border-zinc-800 flex items-center justify-center text-[13px] font-bold text-blue-400">
        {n}
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-[15px] mb-0.5 text-zinc-100">{title}</div>
        <div className="text-sm text-zinc-400 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

export function WhereBox({ label, children }) {
  return (
    <div className="bg-blue-600/10 border border-blue-500/25 rounded-xl px-4 py-3 text-[13px] text-zinc-300 mb-7">
      <b className="text-blue-300">{label}</b> {children}
    </div>
  );
}

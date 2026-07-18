import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useI18n, LANGUAGES } from "../context/I18nContext";
import { Button } from "../components/ui/button";
import { ShieldCheck, LogOut, Languages as LanguagesIcon, Coins, ChevronRight } from "lucide-react";
import { api } from "../lib/api";

// Único email de admin da app — mesma condição usada em Layout.jsx para a
// entrada "ADMIN · Feedback" da sidebar desktop.

// "Perfil" — 5º separador da barra de baixo no mobile (ver Layout.jsx).
// Página nova, deliberadamente simples: é o resumo/atalhos que a versão
// desktop já tinha escondidos no rodapé da sidebar (Idioma, Moeda, Sair —
// ver Layout.jsx linhas ~356-407), mas que no mobile só eram alcançáveis
// abrindo o menu hambúrguer — nada disto tinha um separador próprio e
// descobrível. A página de Definições completa (PIN/biometria/subscrição/
// danger zone) continua a existir tal como estava, agora só acessível a
// partir do cartão "Segurança" aqui, em vez de ser o próprio 5º separador
// (5 jul 2026: reportado que o separador "Perfil" do mockup mostrava a
// página de Definições, sem nada a ver com o que foi aprovado).
const CURRENCIES = ["USD", "EUR", "CHF", "BRL"];

export default function Profile({ currency, setCurrency }) {
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useI18n();
  const navigate = useNavigate();
  const isAdmin = !!user?.is_admin;
  const [unreadFeedback, setUnreadFeedback] = useState(0);

  // A sidebar desktop já faz polling contínuo disto (Layout.jsx); aqui
  // basta uma leitura ao entrar na página — o Perfil não fica aberto em
  // fundo o tempo todo como a sidebar.
  useEffect(() => {
    if (!isAdmin) return;
    api.get("/feedback/unread-count").then((r) => setUnreadFeedback(r.data?.count || 0)).catch(() => {});
  }, [isAdmin]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="space-y-6 fade-in max-w-2xl">
      <div>
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("profile.kicker")}</div>
        <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mt-2">{t("profile.title")}</h1>
      </div>

      {/* Avatar + email */}
      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-6 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center text-xl font-semibold text-zinc-300 shrink-0">
          {(user?.email || "?")[0].toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-sm text-zinc-100 truncate" data-testid="profile-email">{user?.email}</div>
          <div className="text-xs text-zinc-400">{user?.name || t("profile.no_name")}</div>
        </div>
      </div>

      {/* Idioma */}
      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <LanguagesIcon className="w-4 h-4 text-blue-400" />
          <div className="text-sm font-medium text-zinc-200">{t("profile.language")}</div>
        </div>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2.5"
          data-testid="profile-lang-select"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
          ))}
        </select>
      </div>

      {/* Moeda */}
      {setCurrency && (
        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Coins className="w-4 h-4 text-amber-400" />
            <div className="text-sm font-medium text-zinc-200">{t("profile.currency")}</div>
          </div>
          <div className="grid grid-cols-4 gap-2" data-testid="profile-currency-toggle">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                data-testid={`profile-currency-${c.toLowerCase()}`}
                className={`py-2 rounded-lg text-sm font-mono border transition-colors ${
                  currency === c
                    ? "bg-zinc-100 text-zinc-950 border-zinc-100"
                    : "text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Segurança — link para a página de Definições completa */}
      <Link
        to="/settings"
        className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-6 flex items-center justify-between hover:border-zinc-700 hover:bg-zinc-900/70 transition-all"
        data-testid="profile-security-link"
      >
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <div>
            <div className="text-sm font-medium text-zinc-200">{t("profile.security")}</div>
            <div className="text-xs text-zinc-400 mt-0.5">{t("profile.security_desc")}</div>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
      </Link>

      {/* ADMIN · Feedback — só visível para a conta admin (mesma condição
          da sidebar desktop em Layout.jsx). No mobile, o menu hambúrguer
          técnicamente já tem este link (reutiliza a mesma Sidebar), mas na
          prática a navegação do telemóvel vive no Perfil/bottom-nav, onde
          isto nunca aparecia (6 jul 2026: "nao me aparece o ADMIN
          FEEDBACK... coloca, para o admin só"). */}
      {isAdmin && (
        <Link
          to="/admin/feedback"
          onClick={() => {
            if (unreadFeedback > 0) {
              api.patch("/feedback/mark-all-read").then(() => setUnreadFeedback(0)).catch(() => {});
            }
          }}
          className="bg-zinc-900/40 border border-amber-500/30 rounded-xl p-6 flex items-center justify-between hover:border-amber-500/60 hover:bg-amber-500/5 transition-all"
          data-testid="profile-admin-feedback-link"
        >
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <div className="text-sm font-medium text-amber-300">{t("nav.admin_feedback")}</div>
          </div>
          <div className="flex items-center gap-2">
            {unreadFeedback > 0 && (
              <span className="bg-amber-400 text-zinc-950 text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {unreadFeedback > 99 ? "99+" : unreadFeedback}
              </span>
            )}
            <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
          </div>
        </Link>
      )}

      {/* Sair */}
      <Button
        variant="outline"
        onClick={handleLogout}
        className="w-full justify-center bg-zinc-900/40 border-rose-500/30 text-rose-400 hover:bg-rose-500/10 py-5"
        data-testid="profile-logout-btn"
      >
        <LogOut className="w-4 h-4 mr-2" /> {t("profile.logout")}
      </Button>
    </div>
  );
}

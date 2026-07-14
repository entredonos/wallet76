import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useI18n } from "../context/I18nContext";
import walletLogo from "../assets/wallet76-logo80x60.png";

const BROKERS = ["DEGIRO", "IBKR", "Trading212", "Binance"];

// Cache em memória (não localStorage — reinicia a cada reload completo, de
// propósito) da decisão "preciso mostrar o wizard?". Sem isto, como cada
// rota protegida monta o seu próprio <Protected> (ver App.js), navegar entre
// páginas desmontava e remontava este componente a cada clique, disparando
// sempre 2 pedidos novos (/preferences + /wallets) a competir com os
// pedidos da própria página — o sintoma reportado foi o esqueleto cinzento
// a demorar mais a desaparecer. Com o cache, só a primeira montagem por
// sessão de página faz os pedidos; as seguintes resolvem-se de imediato.
let onboardingDecisionCache = null; // null = ainda não sabido, true/false = decidido

/**
 * Assistente de configuração inicial — estilo conversacional (uma pergunta
 * de cada vez, sem contador "passo X de Y"), mostrado só uma vez por
 * utilizador. Montado em App.js ao lado do WhatsNewModal, mas só depois de
 * resolvido se é preciso (ver onDone) para os dois nunca aparecerem ao
 * mesmo tempo no primeiro login.
 *
 * Critério para mostrar: onboarding_completed ainda não está true NAS
 * preferências guardadas no servidor E o utilizador ainda não tem nenhuma
 * carteira. A segunda condição é a rede de segurança para utilizadores já
 * existentes antes desta funcionalidade existir — nunca lhes aparece o
 * assistente do zero só porque a flag ainda não tinha sido gravada.
 */
export default function OnboardingWizard({ onDone }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [walletName, setWalletName] = useState("");
  const [broker, setBroker] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [createdWalletId, setCreatedWalletId] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (onboardingDecisionCache === false) { onDone?.(); return; }
    if (onboardingDecisionCache === true) { setVisible(true); return; }

    let cancelled = false;
    (async () => {
      try {
        const [prefsRes, walletsRes] = await Promise.all([
          api.get("/preferences"),
          api.get("/wallets"),
        ]);
        if (cancelled) return;
        const alreadyDone = !!prefsRes.data?.onboarding_completed;
        const hasWallets = (walletsRes.data || []).length > 0;
        if (!alreadyDone && !hasWallets) {
          onboardingDecisionCache = true;
          setVisible(true);
        } else {
          onboardingDecisionCache = false;
          if (!alreadyDone) {
            // Utilizador já tinha carteiras antes desta funcionalidade —
            // marca como concluído sem mostrar nada, para não perguntar
            // novamente em cada login.
            api.put("/preferences", { onboarding_completed: true }).catch(() => {});
          }
          onDone?.();
        }
      } catch {
        if (!cancelled) onDone?.();
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (visible && step === 0) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [visible, step]);

  const finish = async (path) => {
    onboardingDecisionCache = false;
    try { await api.put("/preferences", { onboarding_completed: true }); } catch { /* noop */ }
    setVisible(false);
    onDone?.();
    if (path) navigate(path);
  };

  const submitWalletName = async (e) => {
    e.preventDefault();
    const name = walletName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError("");
    try {
      const res = await api.post("/wallets", { name });
      setCreatedWalletId(res.data?.id || null);
      setStep(1);
    } catch {
      setError(t("onboarding.wallet_error"));
    } finally {
      setCreating(false);
    }
  };

  const pickBroker = (b) => {
    setBroker(b);
    setStep(2);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[95] bg-zinc-950/98 backdrop-blur-xl flex items-center justify-center px-5"
      data-testid="onboarding-wizard"
    >
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-10 opacity-60">
          <img src={walletLogo} alt="Wallet76" className="w-9 h-9 rounded object-contain" />
          <span className="text-sm text-zinc-400">Wallet76</span>
        </div>

        {step === 0 && (
          <form onSubmit={submitWalletName}>
            <p className="text-xl sm:text-2xl font-medium leading-snug mb-6 text-zinc-100">
              {t("onboarding.greeting")}
            </p>
            <input
              ref={inputRef}
              type="text"
              value={walletName}
              onChange={(e) => setWalletName(e.target.value)}
              placeholder={t("onboarding.wallet_placeholder")}
              aria-label={t("onboarding.greeting")}
              className="w-full bg-transparent border-0 border-b-2 border-zinc-700 focus:border-emerald-400 outline-none rounded-none py-2 text-lg text-zinc-100 placeholder:text-zinc-600 transition-colors"
            />
            {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-zinc-600">
                {creating ? t("onboarding.creating") : t("onboarding.enter_hint")}
              </p>
              <button
                type="button"
                onClick={() => finish("/dashboard")}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                {t("onboarding.skip")}
              </button>
            </div>
          </form>
        )}

        {step === 1 && (
          <div>
            <p className="text-xl sm:text-2xl font-medium leading-snug mb-6 text-zinc-100">
              {t("onboarding.brokers_question")}
            </p>
            <div className="flex flex-wrap gap-2">
              {BROKERS.map((b) => (
                <button
                  key={b}
                  onClick={() => pickBroker(b)}
                  className="border border-zinc-700 hover:border-emerald-400 hover:text-emerald-300 rounded-full px-4 py-2 text-sm text-zinc-300 transition-colors"
                >
                  {b}
                </button>
              ))}
              <button
                onClick={() => pickBroker(null)}
                className="border border-zinc-700 hover:border-emerald-400 hover:text-emerald-300 rounded-full px-4 py-2 text-sm text-zinc-300 transition-colors"
              >
                {t("onboarding.broker_unknown")}
              </button>
            </div>
            <button
              onClick={() => finish("/dashboard")}
              className="text-xs text-zinc-500 hover:text-zinc-300 mt-6 block"
            >
              {t("onboarding.skip")}
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <p className="text-xl sm:text-2xl font-medium leading-snug mb-2 text-zinc-100">
              {t("onboarding.done_title", { name: walletName.trim() })}
            </p>
            <p className="text-sm text-zinc-400 leading-relaxed mb-7">
              {t("onboarding.done_body")}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => finish(createdWalletId ? `/transactions?wallet=${createdWalletId}&open=1` : "/transactions?open=1")}
                className="bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-medium rounded-lg px-5 py-3 text-sm transition-colors"
              >
                {t("onboarding.cta_add_transaction")}
              </button>
              <button
                onClick={() => finish("/dashboard")}
                className="text-zinc-400 hover:text-zinc-200 text-sm px-5 py-3"
              >
                {t("onboarding.cta_go_dashboard")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

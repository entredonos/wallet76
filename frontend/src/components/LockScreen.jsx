import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { Lock, Fingerprint, KeyRound, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { Capacitor } from "@capacitor/core";
import * as SimpleBiometric from "../lib/simpleBiometric";
import { detectPlatform } from "../lib/pwaInstall";

// 9 jul 2026 — "no PC ou via web nunca peça biometria pois normalmente os
// PCs e notebooks podem não ter leitor". Nem o WebAuthn nem o plugin nativo
// fazem sentido aqui: um leitor de biometria registado no telemóvel não é
// acessível a partir de um browser de PC de qualquer forma (a credencial
// WebAuthn fica presa ao aparelho que a criou), e nem todo o PC/notebook tem
// hardware biométrico. Em desktop/web, o modo "biometric" é tratado como se
// fosse "none" — a app nunca pede biometria nesse contexto.
const isDesktopWeb = !Capacitor.isNativePlatform() && detectPlatform() === "desktop";

function b64urlToBuf(b64url) {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

function bufToB64url(buf) {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < bytes.byteLength; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * App-level lock screen overlay. Renders nothing if lock_mode is "none".
 * Once unlocked, calls onUnlock() and stays out of the way.
 */
export default function LockScreen({ onUnlock }) {
  const { t } = useI18n();
  const { logout, user } = useAuth();
  const [status, setStatus] = useState(null); // null = loading, then {lock_mode}
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadStatus = async () => {
    try {
      const { data } = await api.get("/security/status");
      if (data.lock_mode === "none" || (data.lock_mode === "biometric" && isDesktopWeb)) {
        onUnlock?.();
        setStatus({ lock_mode: "none" });
        return;
      }
      setStatus(data);
      if (data.lock_mode === "biometric") {
        // auto-trigger biometric prompt (só chega aqui em telemóvel/nativo — ver isDesktopWeb acima)
        setTimeout(() => doBiometric(true), 250);
      }
    } catch (e) {
      // Segurança (17 jul 2026) — NÃO desbloquear em erro. Antes, um erro aqui
      // (backend em cold start, timeout, 500) chamava onUnlock() e abria a app
      // — um bypass do PIN/biometria (bastava cortar a rede, ex.: modo avião).
      // A sessão já é válida via cookie httpOnly; nada se perde em esperar.
      // Mostramos um estado de erro com "tentar de novo" + "sair".
      setStatus({ lock_mode: "error" });
    }
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line
  }, []);

  const verifyPin = async () => {
    if (!pin) return;
    setBusy(true); setError("");
    try {
      await api.post("/security/pin/verify", { pin });
      onUnlock?.();
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || t("lock.wrong_pin"));
      setPin("");
    } finally { setBusy(false); }
  };

  const doBiometric = async (auto = false) => {
    // App nativa (Capacitor, 8 jul 2026): a WebView do Android/iOS não tem
    // suporte fiável para WebAuthn platform authenticator, por isso usamos
    // o plugin nativo (leitor de impressão digital/Face ID do próprio SO)
    // como gate local — a sessão já existe via cookie httpOnly, o biométrico
    // aqui só confirma presença do dono do aparelho antes de reabrir a app.
    if (Capacitor.isNativePlatform()) {
      setBusy(true); setError("");
      try {
        const avail = await SimpleBiometric.isAvailable();
        if (!avail.isAvailable) {
          if (!auto) setError(t("settings.biometric_unsupported"));
          return;
        }
        await SimpleBiometric.verify({
          reason: t("lock.biometric_prompt"),
          title: "Wallet76",
        });
        // Confirma que a sessão (cookie) ainda é válida antes de desbloquear.
        await api.get("/security/status");
        onUnlock?.();
      } catch (e) {
        if (!auto) setError(e?.message || t("lock.biometric_failed"));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!window.PublicKeyCredential) {
      setError(t("settings.biometric_unsupported"));
      return;
    }
    setBusy(true); setError("");
    try {
      const { data: options } = await api.post("/security/biometric/auth/options", {});
      const publicKey = {
        ...options,
        challenge: b64urlToBuf(options.challenge),
        allowCredentials: (options.allowCredentials || []).map((c) => ({ ...c, id: b64urlToBuf(c.id) })),
      };
      const assertion = await navigator.credentials.get({ publicKey });
      const body = {
        id: assertion.id,
        rawId: bufToB64url(assertion.rawId),
        type: assertion.type,
        response: {
          clientDataJSON: bufToB64url(assertion.response.clientDataJSON),
          authenticatorData: bufToB64url(assertion.response.authenticatorData),
          signature: bufToB64url(assertion.response.signature),
          userHandle: assertion.response.userHandle ? bufToB64url(assertion.response.userHandle) : null,
        },
      };
      await api.post("/security/biometric/auth/verify", body);
      onUnlock?.();
    } catch (e) {
      if (!auto) setError(e?.message || t("lock.biometric_failed"));
    } finally { setBusy(false); }
  };

  if (!status || status.lock_mode === "none") return null;

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950/95 backdrop-blur-xl flex items-center justify-center px-4" data-testid="lock-screen">
      <div className="w-full max-w-sm bg-zinc-900/60 border border-zinc-800 rounded-2xl p-8 text-center shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center mx-auto mb-5">
          {status.lock_mode === "pin" ? <KeyRound className="w-7 h-7 text-blue-300"/> : <Fingerprint className="w-7 h-7 text-blue-300"/>}
        </div>
        <div className="font-display text-2xl font-light text-zinc-100">Wallet76</div>
        <div className="text-xs font-mono text-zinc-400 mt-1 mb-6">{user?.email}</div>

        {status.lock_mode === "pin" && (
          <div className="space-y-3">
            <input
              type="password" inputMode="numeric" pattern="\d*" maxLength={6}
              value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") verifyPin(); }}
              placeholder="••••"
              autoFocus
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-3 font-mono text-2xl text-center tracking-[0.6em] text-zinc-100 focus:outline-none focus:border-blue-500/60"
              data-testid="lock-pin-input"
            />
            <button
              onClick={verifyPin}
              disabled={busy || !pin}
              className="w-full bg-zinc-100 text-zinc-950 hover:bg-white disabled:opacity-50 rounded-md py-2.5 font-medium"
              data-testid="lock-pin-submit"
            >
              {busy ? "…" : t("lock.unlock")}
            </button>
          </div>
        )}

        {status.lock_mode === "biometric" && (
          <div className="space-y-3">
            <div className="text-sm text-zinc-400">{t("lock.biometric_prompt")}</div>
            <button
              onClick={() => doBiometric(false)}
              disabled={busy}
              className="w-full bg-blue-500 text-zinc-950 hover:bg-blue-400 disabled:opacity-50 rounded-md py-3 font-medium inline-flex items-center justify-center gap-2"
              data-testid="lock-biometric-btn"
            >
              <Fingerprint className="w-5 h-5"/>
              {busy ? "…" : t("lock.use_biometric")}
            </button>
          </div>
        )}

        {status.lock_mode === "error" && (
          <div className="space-y-3">
            <div className="text-sm text-zinc-400">{t("lock.status_error")}</div>
            <button
              onClick={async () => { setBusy(true); await loadStatus(); setBusy(false); }}
              disabled={busy}
              className="w-full bg-zinc-100 text-zinc-950 hover:bg-white disabled:opacity-50 rounded-md py-2.5 font-medium"
              data-testid="lock-retry"
            >
              {busy ? "…" : t("lock.retry")}
            </button>
          </div>
        )}

        {error && <div className="mt-3 text-xs font-mono text-rose-400" data-testid="lock-error">{error}</div>}

        <button
          onClick={() => { logout(); }}
          className="mt-6 inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.2em] text-zinc-400 hover:text-zinc-300"
          data-testid="lock-logout"
        >
          <LogOut className="w-3 h-3"/> {t("common.logout") || "Sign out"}
        </button>
      </div>
    </div>
  );
}

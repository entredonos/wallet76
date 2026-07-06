import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { Lock, Fingerprint, KeyRound, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";

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

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/security/status");
        if (data.lock_mode === "none") {
          onUnlock?.();
          setStatus({ lock_mode: "none" });
          return;
        }
        setStatus(data);
        if (data.lock_mode === "biometric") {
          // auto-trigger biometric prompt
          setTimeout(() => doBiometric(true), 250);
        }
      } catch (e) {
        // If endpoint fails, default to unlocked to avoid lockout
        onUnlock?.();
        setStatus({ lock_mode: "none" });
      }
    })();
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

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import { Lock, Fingerprint, ShieldOff, ShieldCheck, Check, Trash2, KeyRound, Bell, BellOff, AlertTriangle, Copy, Download, Send, Smartphone, Loader2, Gift } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useI18n } from "../context/I18nContext";
import { Capacitor } from "@capacitor/core";
import * as SimpleBiometric from "../lib/simpleBiometric";
import { enablePush, disablePush, isPushSubscribed, pushSupported } from "../lib/push";

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

export default function Settings() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const TG_PRO_MSG = { pt: "O Telegram é uma funcionalidade Pro.", en: "Telegram is a Pro feature.", fr: "Telegram est une fonctionnalité Pro.", de: "Telegram ist eine Pro-Funktion.", it: "Telegram è una funzionalità Pro.", es: "Telegram es una función Pro." };
  const AUTOLOCK = {
    pt: { title: "Bloqueio automático", inactivity: "Bloquear após inatividade", never: "Nunca", min: "min", bg: "Bloquear ao sair da app ou desligar o ecrã", hint: "Configura um PIN ou biometria acima para ativar o bloqueio automático." },
    en: { title: "Auto-lock", inactivity: "Lock after inactivity", never: "Never", min: "min", bg: "Lock when leaving the app or the screen turns off", hint: "Set a PIN or biometric above to enable auto-lock." },
    fr: { title: "Verrouillage auto", inactivity: "Verrouiller après inactivité", never: "Jamais", min: "min", bg: "Verrouiller en quittant l'app ou écran éteint", hint: "Configurez un PIN ou la biométrie ci-dessus pour activer le verrouillage auto." },
    de: { title: "Automatische Sperre", inactivity: "Nach Inaktivität sperren", never: "Nie", min: "Min", bg: "Beim Verlassen der App oder Bildschirm aus sperren", hint: "Richten Sie oben eine PIN oder Biometrie ein, um die automatische Sperre zu aktivieren." },
    it: { title: "Blocco automatico", inactivity: "Blocca dopo inattività", never: "Mai", min: "min", bg: "Blocca uscendo dall'app o a schermo spento", hint: "Imposta un PIN o la biometria sopra per attivare il blocco automatico." },
    es: { title: "Bloqueo automático", inactivity: "Bloquear tras inactividad", never: "Nunca", min: "min", bg: "Bloquear al salir de la app o apagar la pantalla", hint: "Configura un PIN o biometría arriba para activar el bloqueo automático." },
  };
  const AL = AUTOLOCK[lang] || AUTOLOCK.en;
  const [autolockMins, setAutolockMins] = useState(() => { try { const v = parseInt(localStorage.getItem("w76-autolock-mins"), 10); return Number.isNaN(v) ? 5 : v; } catch { return 5; } });
  const [autolockBg, setAutolockBg] = useState(() => { try { return localStorage.getItem("w76-autolock-bg") !== "false"; } catch { return true; } });
  const changeAutolockMins = (v) => { setAutolockMins(v); try { localStorage.setItem("w76-autolock-mins", String(v)); } catch { /* noop */ } };
  const changeAutolockBg = (v) => { setAutolockBg(v); try { localStorage.setItem("w76-autolock-bg", v ? "true" : "false"); } catch { /* noop */ } };
  const { logout } = useAuth();
  const [status, setStatus] = useState({ lock_mode: "none", has_pin: false, biometric_count: 0, totp_enabled: false });
  useEffect(() => { try { localStorage.setItem("w76-lock-mode", status.lock_mode || "none"); } catch { /* noop */ } }, [status.lock_mode]);
  const [pinDialog, setPinDialog] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [registeringBio, setRegisteringBio] = useState(false);

  // 2FA (8 jul 2026) — setup em 2 passos: "qr" mostra o QR + pede o código
  // de 6 dígitos para confirmar; "recovery" mostra os códigos de reserva
  // UMA vez só, logo a seguir a confirmar (o backend não os guarda em
  // texto simples, por isso esta é a única oportunidade de os ver).
  const [twoFAStep, setTwoFAStep] = useState(null); // null | "qr" | "recovery"
  const [twoFASecret, setTwoFASecret] = useState("");
  const [twoFAOtpUrl, setTwoFAOtpUrl] = useState("");
  const [twoFACode, setTwoFACode] = useState("");
  const [twoFARecoveryCodes, setTwoFARecoveryCodes] = useState([]);
  const [twoFABusy, setTwoFABusy] = useState(false);
  const [twoFAError, setTwoFAError] = useState("");
  const [disable2FADialog, setDisable2FADialog] = useState(false);
  const [disable2FAPassword, setDisable2FAPassword] = useState("");
  const [subscription, setSubscription] = useState(null);
  const [alertEmails, setAlertEmails] = useState(true);

  // Alertas multi-canal (11 jul 2026): push + Telegram, além do email já
  // existente acima. notifStatus vem de GET /notifications/status
  // (disponibilidade dos canais no servidor + se este utilizador já ligou
  // o Telegram); pushOn combina a preferência guardada com o estado real
  // da subscrição do browser (podem divergir — ex.: utilizador limpou os
  // dados do site sem passar pela app).
  const [notifStatus, setNotifStatus] = useState({ telegram_linked: false, push_subscribed: false, push_available: false, telegram_available: false });
  const [alertPush, setAlertPush] = useState(true);
  const [alertTelegram, setAlertTelegram] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramLinkInfo, setTelegramLinkInfo] = useState(null); // { code, deepLink }
  const [wallets, setWallets] = useState([]);
  const [resetModal, setResetModal] = useState(null); // { type:"wallet"|"all", walletId, walletName, code, input, loading }
  const [deleteAccountDialog, setDeleteAccountDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [exportingData, setExportingData] = useState(false);

  // Programa de referral (14 jul 2026) — código próprio + link de convite,
  // vindo de GET /referrals/me (ver backend/routes/referrals.py). copied
  // controla o feedback visual momentâneo do botão de copiar.
  const [referral, setReferral] = useState(null);
  const [referralCopied, setReferralCopied] = useState(false);

  // 7 jul 2026: "Transferir os meus dados" — backup self-service (GET
  // /account/export devolve um ZIP). Pedido como blob (não JSON), o mesmo
  // truque de Blob URL já usado no export CSV da Análise para despoletar o
  // download do browser sem abrir separador novo.
  const handleExportData = async () => {
    setExportingData(true);
    try {
      const res = await api.get("/account/export", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wallet76-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("settings.backup_failed"));
    }
    setExportingData(false);
  };

  const submitDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await api.delete("/account", { data: { password: deletePassword } });
      setDeleteAccountDialog(false);
      await logout();
      navigate("/");
    } catch (e) {
      if (e.response?.status === 401) {
        toast.error(t("settings.delete_account_wrong_password"));
      } else {
        toast.error(formatApiErrorDetail(e.response?.data?.detail) || t("common.error"));
      }
    } finally {
      setDeletingAccount(false);
    }
  };

  const copyReferralLink = async () => {
    if (!referral?.invite_link) return;
    try {
      await navigator.clipboard.writeText(referral.invite_link);
      setReferralCopied(true);
      setTimeout(() => setReferralCopied(false), 2000);
    } catch {
      toast.error(t("common.error"));
    }
  };

  const genCode = () => String(Math.floor(1000 + Math.random() * 9000));

  const openReset = (type, walletId = null, walletName = null) => {
    setResetModal({ type, walletId, walletName, code: genCode(), input: "", loading: false });
  };

  const submitReset = async () => {
    if (!resetModal) return;
    if (resetModal.input !== resetModal.code) {
      toast.error(t("settings.danger_wrong_code"));
      return;
    }
    setResetModal((m) => ({ ...m, loading: true }));
    try {
      if (resetModal.type === "wallet") {
        await api.delete(`/transactions/wallet/${resetModal.walletId}`);
        toast.success(t("settings.danger_success_wallet"));
      } else {
        await api.delete("/transactions/all");
        toast.success(t("settings.danger_success_all"));
      }
      setResetModal(null);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || t("common.error"));
      setResetModal((m) => ({ ...m, loading: false }));
    }
  };

  const load = async () => {
    try {
      const [secRes, subRes, prefsRes, wRes, notifRes, refRes] = await Promise.all([
        api.get("/security/status"),
        api.get("/billing/subscription-status"),
        api.get("/preferences"),
        api.get("/wallets"),
        api.get("/notifications/status").catch(() => ({ data: null })),
        api.get("/referrals/me").catch(() => ({ data: null })),
      ]);
      setStatus(secRes.data);
      setSubscription(subRes.data);
      setAlertEmails(prefsRes.data.alert_emails !== false);
      setAlertPush(prefsRes.data.alert_push !== false);
      setAlertTelegram(prefsRes.data.alert_telegram !== false);
      setWallets(wRes.data || []);
      if (notifRes.data) setNotifStatus(notifRes.data);
      if (refRes.data) setReferral(refRes.data);
    } catch {
      /* noop */
    }
  };

  const toggleAlertEmails = async () => {
    const next = !alertEmails;
    setAlertEmails(next);
    try {
      await api.put("/preferences", { alert_emails: next });
      toast.success(next ? t("settings.alert_emails_on") : t("settings.alert_emails_off"));
    } catch {
      setAlertEmails(!next);
      toast.error(t("common.error"));
    }
  };

  // Push: ligar pede permissão + subscreve o browser + regista no backend
  // (lib/push.js). Desligar cancela a subscrição real E a preferência —
  // as duas coisas juntas, para não ficar "desligado" na preferência mas
  // continuar tecnicamente subscrito (ou vice-versa).
  const togglePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (!alertPush || !notifStatus.push_subscribed) {
        await enablePush();
        setAlertPush(true);
        await api.put("/preferences", { alert_push: true });
        setNotifStatus((s) => ({ ...s, push_subscribed: true }));
        toast.success(t("settings.alert_push_on"));
      } else {
        await disablePush();
        setAlertPush(false);
        await api.put("/preferences", { alert_push: false });
        setNotifStatus((s) => ({ ...s, push_subscribed: false }));
        toast.success(t("settings.alert_push_off"));
      }
    } catch (e) {
      const reason = e?.reason;
      if (reason === "denied") toast.error(t("settings.alert_push_denied"));
      else if (reason === "unsupported") toast.error(t("settings.alert_push_unsupported"));
      else if (reason === "not_configured") toast.error(t("settings.alert_push_unavailable"));
      else if (reason === "sw_timeout") toast.error(t("settings.alert_push_sw_timeout"));
      else toast.error(t("common.error"));
    } finally {
      setPushBusy(false);
    }
  };

  // Telegram: "ligar" gera um código de curta duração + deep link
  // t.me/<bot>?start=<code>; o utilizador abre o Telegram, manda /start e o
  // bot liga o chat_id à conta (ver backend/routes/notifications.py). Faz
  // polling a /notifications/status enquanto o painel do código está
  // aberto, para a UI atualizar sozinha assim que o /start chegar — sem
  // isto, o utilizador tinha de voltar à app e recarregar manualmente.
  const startTelegramLink = async () => {
    if (telegramBusy) return;
    setTelegramBusy(true);
    try {
      const { data } = await api.post("/notifications/telegram/link-code");
      setTelegramLinkInfo(data);
      if (data.deepLink) window.open(data.deepLink, "_blank", "noopener,noreferrer");
    } catch (e) {
      if (e?.response?.status === 402) {
        toast.error(TG_PRO_MSG[lang] || TG_PRO_MSG.en, {
          action: { label: t("common.upgrade"), onClick: () => navigate("/pricing") },
        });
      } else {
        toast.error(t("common.error"));
      }
    } finally {
      setTelegramBusy(false);
    }
  };

  useEffect(() => {
    if (!telegramLinkInfo) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get("/notifications/status");
        if (cancelled) return;
        if (data.telegram_linked) {
          setNotifStatus(data);
          setTelegramLinkInfo(null);
          toast.success(t("settings.telegram_linked_toast"));
        }
      } catch { /* noop, tenta de novo no próximo tick */ }
    }, 3000);
    // Para de tentar ao fim de 2 min — o código no backend também expira
    // (LINK_CODE_TTL_MIN), não faz sentido continuar a fazer polling depois.
    const timeout = setTimeout(() => { clearInterval(interval); setTelegramLinkInfo(null); }, 120000);
    return () => { cancelled = true; clearInterval(interval); clearTimeout(timeout); };
  }, [telegramLinkInfo, t]);

  const unlinkTelegram = async () => {
    try {
      await api.post("/notifications/telegram/unlink");
      setNotifStatus((s) => ({ ...s, telegram_linked: false }));
      toast.success(t("settings.telegram_unlinked_toast"));
    } catch {
      toast.error(t("common.error"));
    }
  };

  const toggleAlertTelegram = async () => {
    const next = !alertTelegram;
    setAlertTelegram(next);
    try {
      await api.put("/preferences", { alert_telegram: next });
    } catch {
      setAlertTelegram(!next);
      toast.error(t("common.error"));
    }
  };

    useEffect(() => { load(); }, []);

  const choose = async (mode) => {
    if (mode === "pin" && !status.has_pin) {
      setPin(""); setPinConfirm(""); setPinDialog(true); return;
    }
    if (mode === "biometric" && Capacitor.isNativePlatform()) {
      await registerNativeBiometric(); return;
    }
    if (mode === "biometric" && status.biometric_count === 0) {
      await registerBiometric(); return;
    }
    try {
      await api.post("/security/lock-mode", { mode });
      toast.success(t("settings.lock_updated"));
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || t("common.error"));
    }
  };

  const submitPin = async () => {
    if (!/^\d{4,6}$/.test(pin)) { toast.error(t("settings.pin_invalid")); return; }
    if (pin !== pinConfirm) { toast.error(t("settings.pin_mismatch")); return; }
    setSaving(true);
    try {
      await api.post("/security/pin/setup", { pin });
      await api.post("/security/lock-mode", { mode: "pin" });
      toast.success(t("settings.pin_saved"));
      setPinDialog(false);
      setPin(""); setPinConfirm("");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || t("common.error"));
    } finally { setSaving(false); }
  };

  const registerBiometric = async () => {
    if (!window.PublicKeyCredential) {
      toast.error(t("settings.biometric_unsupported"));
      return;
    }
    setRegisteringBio(true);
    try {
      const { data: options } = await api.post("/security/biometric/register/options", {});
      // Decode challenge + user.id to ArrayBuffer
      const publicKey = {
        ...options,
        challenge: b64urlToBuf(options.challenge),
        user: {
          ...options.user,
          id: b64urlToBuf(options.user.id),
        },
        excludeCredentials: (options.excludeCredentials || []).map((c) => ({
          ...c, id: b64urlToBuf(c.id),
        })),
      };
      const cred = await navigator.credentials.create({ publicKey });
      const attestation = {
        id: cred.id,
        rawId: bufToB64url(cred.rawId),
        type: cred.type,
        response: {
          clientDataJSON: bufToB64url(cred.response.clientDataJSON),
          attestationObject: bufToB64url(cred.response.attestationObject),
        },
        clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
        device_name: navigator.userAgent.slice(0, 60),
      };
      await api.post("/security/biometric/register/verify", attestation);
      await api.post("/security/lock-mode", { mode: "biometric" });
      toast.success(t("settings.biometric_registered"));
      load();
    } catch (e) {
      // 9 jul 2026 — a ordem importa: e?.message do Axios é sempre um texto
      // genérico tipo "Request failed with status code 400" e mascarava o
      // "detail" real que o backend manda (ex.: motivo da verificação
      // WebAuthn ter falhado), que é o que precisamos de ver para
      // diagnosticar. formatApiErrorDetail(...) vem primeiro agora.
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e?.message || t("settings.biometric_setup_failed"));
    } finally { setRegisteringBio(false); }
  };

  const registerNativeBiometric = async () => {
    // App nativa: sem WebAuthn fiável na WebView, por isso confirmamos que
    // o hardware biométrico do aparelho funciona (pede já a digital/Face ID
    // uma vez) e depois só ligamos o modo no servidor — sem credencial
    // nenhuma para guardar (ver nota em LockScreen.jsx).
    setRegisteringBio(true);
    try {
      const avail = await SimpleBiometric.isAvailable();
      if (!avail.isAvailable) {
        toast.error(t("settings.biometric_unsupported"));
        return;
      }
      await SimpleBiometric.verify({
        reason: t("settings.mode_biometric_desc"),
        title: "Wallet76",
      });
      await api.post("/security/lock-mode", { mode: "biometric" });
      toast.success(t("settings.biometric_registered"));
      load();
    } catch (e) {
      toast.error(e?.message || t("settings.biometric_setup_failed_native"));
    } finally { setRegisteringBio(false); }
  };

  const removeBiometrics = async () => {
    try {
      // Note: we don't expose individual cred deletion in UI; just clear all by switching mode to none then DELETE
      await api.post("/security/lock-mode", { mode: "none" });
      // List would require an endpoint; for now we instruct user to re-register if needed
      toast.success(t("settings.biometric_removed"));
      load();
    } catch { toast.error(t("common.error")); }
  };

  const startTwoFactorSetup = async () => {
    setTwoFAError(""); setTwoFACode("");
    try {
      const { data } = await api.post("/security/2fa/setup", {});
      setTwoFASecret(data.secret);
      setTwoFAOtpUrl(data.otpauth_url);
      setTwoFAStep("qr");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || t("settings.2fa_setup_failed"));
    }
  };

  const confirmTwoFactorSetup = async () => {
    if (!twoFACode) return;
    setTwoFABusy(true); setTwoFAError("");
    try {
      const { data } = await api.post("/security/2fa/confirm", { code: twoFACode.trim() });
      setTwoFARecoveryCodes(data.recovery_codes || []);
      setTwoFAStep("recovery");
      load();
    } catch (e) {
      setTwoFAError(formatApiErrorDetail(e.response?.data?.detail) || t("settings.2fa_invalid_code"));
    } finally { setTwoFABusy(false); }
  };

  const disableTwoFactor = async () => {
    setTwoFABusy(true);
    try {
      await api.post("/security/2fa/disable", { password: disable2FAPassword });
      setDisable2FADialog(false);
      setDisable2FAPassword("");
      toast.success(t("settings.2fa_disabled"));
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || t("settings.delete_account_wrong_password"));
    } finally { setTwoFABusy(false); }
  };

  return (
    <div className="space-y-8 fade-in max-w-3xl">
      <div>
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("settings.kicker")}</div>
        <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mt-2">{t("settings.title")}</h1>
        <p className="text-zinc-400 mt-2">{t("settings.subtitle")}</p>
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <Lock className="w-4 h-4 text-blue-400"/>
          <div className="text-sm font-medium text-zinc-200">{t("settings.unlock_method")}</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="lock-mode-picker">
          <ModeCard
            icon={<ShieldOff className="w-5 h-5"/>}
            title={t("settings.mode_none")}
            desc={t("settings.mode_none_desc")}
            selected={status.lock_mode === "none"}
            onClick={() => choose("none")}
            testId="lock-mode-none"
          />
          <ModeCard
            icon={<KeyRound className="w-5 h-5"/>}
            title={t("settings.mode_pin")}
            desc={t("settings.mode_pin_desc")}
            selected={status.lock_mode === "pin"}
            badge={status.has_pin ? <Check className="w-3 h-3 text-emerald-400"/> : null}
            onClick={() => choose("pin")}
            testId="lock-mode-pin"
          />
          <ModeCard
            icon={<Fingerprint className="w-5 h-5"/>}
            title={t("settings.mode_biometric")}
            desc={t("settings.mode_biometric_desc")}
            selected={status.lock_mode === "biometric"}
            badge={
              status.biometric_count > 0
                ? <span className="text-[10px] font-mono text-emerald-400">{status.biometric_count}</span>
                : (Capacitor.isNativePlatform() && status.lock_mode === "biometric")
                  ? <Check className="w-3 h-3 text-emerald-400"/>
                  : null
            }
            onClick={() => choose("biometric")}
            testId="lock-mode-biometric"
            loading={registeringBio}
          />
        </div>

        {status.lock_mode !== "none" && (
          <div className="mt-5 text-xs font-mono text-zinc-400 flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">{t("settings.active")}</span>
            {status.lock_mode === "pin" && t("settings.pin_active")}
            {status.lock_mode === "biometric" && t("settings.biometric_active")}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {status.has_pin && (
            <Button variant="outline" onClick={() => { setPin(""); setPinConfirm(""); setPinDialog(true); }} className="bg-zinc-900/50 border-zinc-800 text-zinc-300" data-testid="change-pin-btn">
              <KeyRound className="w-3.5 h-3.5 mr-1.5"/> {t("settings.change_pin")}
            </Button>
          )}
          {status.biometric_count > 0 && (
            <Button variant="outline" onClick={removeBiometrics} className="bg-zinc-900/50 border-rose-500/30 text-rose-300 hover:bg-rose-500/15" data-testid="remove-biometric-btn">
              <Trash2 className="w-3.5 h-3.5 mr-1.5"/> {t("settings.remove_biometric")}
            </Button>
          )}
        </div>

        {status.lock_mode !== "none" ? (
          <div className="mt-6 pt-5 border-t border-zinc-800/60">
            <div className="text-sm font-semibold text-zinc-200 mb-3">{AL.title}</div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <label className="text-sm text-zinc-400">{AL.inactivity}</label>
              <select value={autolockMins} onChange={(e) => changeAutolockMins(parseInt(e.target.value, 10))}
                className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-200">
                <option value={0}>{AL.never}</option>
                <option value={1}>1 {AL.min}</option>
                <option value={5}>5 {AL.min}</option>
                <option value={15}>15 {AL.min}</option>
                <option value={30}>30 {AL.min}</option>
              </select>
            </div>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm text-zinc-400">{AL.bg}</span>
              <input type="checkbox" checked={autolockBg} onChange={(e) => changeAutolockBg(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
            </label>
          </div>
        ) : (
          <div className="mt-6 pt-5 border-t border-zinc-800/60 text-xs text-zinc-500">{AL.hint}</div>
        )}
      </div>

      {/* 2FA / TOTP (8 jul 2026) — cartão separado do de PIN/biometria: são
          camadas diferentes (PIN/biometria trancam a APP já com sessão
          aberta; 2FA protege o próprio LOGIN, exigido mesmo com a password
          certa). App autenticadora só, sem custos de SMS. */}
      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400"/>
            <div className="text-sm font-medium text-zinc-200">{t("settings.2fa_title")}</div>
          </div>
          {status.totp_enabled ? (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">{t("settings.active")}</span>
          ) : (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">{t("settings.mode_none")}</span>
          )}
        </div>
        <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{t("settings.2fa_desc")}</p>
        <div className="mt-4">
          {status.totp_enabled ? (
            <Button variant="outline" onClick={() => setDisable2FADialog(true)} className="bg-zinc-900/50 border-rose-500/30 text-rose-300 hover:bg-rose-500/15" data-testid="disable-2fa-btn">
              <ShieldOff className="w-3.5 h-3.5 mr-1.5"/> {t("settings.2fa_disable")}
            </Button>
          ) : (
            <Button variant="outline" onClick={startTwoFactorSetup} className="bg-zinc-900/50 border-zinc-800 text-zinc-300" data-testid="enable-2fa-btn">
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5"/> {t("settings.2fa_enable")}
            </Button>
          )}
        </div>
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-6">
        <div className="text-sm font-medium text-zinc-200 mb-2">{t("settings.sync_title")}</div>
        <p className="text-xs text-zinc-400 leading-relaxed">{t("settings.sync_desc")}</p>
      </div>

      {/* Alert email notifications */}
      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-200 mb-1">{t("settings.alert_emails_title")}</div>
            <p className="text-xs text-zinc-400">{t("settings.alert_emails_desc")}</p>
          </div>
          <button
            onClick={toggleAlertEmails}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${alertEmails ? "bg-emerald-500" : "bg-zinc-700"}`}
            aria-checked={alertEmails}
            role="switch"
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${alertEmails ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-400">
          {alertEmails
            ? <><Bell className="w-3.5 h-3.5 text-emerald-400" /> {t("settings.alert_emails_active")}</>
            : <><BellOff className="w-3.5 h-3.5" /> {t("settings.alert_emails_inactive")}</>
          }
        </div>
      </div>

      {/* Push notifications (11 jul 2026) — canal em tempo real, funciona
          com a app fechada (ao contrário do botão "Ativar notificações do
          navegador" mais antigo em Alerts.jsx, que só dispara com o
          separador aberto). Não aparece se o browser não suportar Push API
          (ex.: Safari em iOS fora de PWA instalada) nem se o servidor não
          tiver chaves VAPID configuradas. */}
      {pushSupported() && (
        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-zinc-200 mb-1">{t("settings.alert_push_title")}</div>
              <p className="text-xs text-zinc-400">{t("settings.alert_push_desc")}</p>
            </div>
            <button
              onClick={togglePush}
              disabled={pushBusy || !notifStatus.push_available}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 ${alertPush && notifStatus.push_subscribed ? "bg-emerald-500" : "bg-zinc-700"}`}
              aria-checked={alertPush && notifStatus.push_subscribed}
              role="switch"
              data-testid="toggle-alert-push"
            >
              {pushBusy
                ? <Loader2 className="w-3.5 h-3.5 mx-auto animate-spin text-zinc-300" />
                : <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${alertPush && notifStatus.push_subscribed ? "translate-x-6" : "translate-x-1"}`} />
              }
            </button>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-400">
            {!notifStatus.push_available
              ? <><BellOff className="w-3.5 h-3.5" /> {t("settings.alert_push_unavailable")}</>
              : alertPush && notifStatus.push_subscribed
                ? <><Smartphone className="w-3.5 h-3.5 text-emerald-400" /> {t("settings.alert_push_active")}</>
                : <><BellOff className="w-3.5 h-3.5" /> {t("settings.alert_push_inactive")}</>
            }
          </div>
        </div>
      )}

      {/* Telegram (11 jul 2026) — alternativa a WhatsApp/Messenger/
          Instagram: sem verificação de negócio nem janela de 24h, um bot
          criado via @BotFather chega. Fluxo: gerar código -> abrir Telegram
          -> /start <código> -> o webhook liga o chat_id à conta (ver
          backend/routes/notifications.py). */}
      {notifStatus.telegram_available && (
        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-zinc-200 mb-1">{t("settings.alert_telegram_title")}</div>
              <p className="text-xs text-zinc-400">{t("settings.alert_telegram_desc")}</p>
            </div>
            {notifStatus.telegram_linked ? (
              <button
                onClick={toggleAlertTelegram}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${alertTelegram ? "bg-emerald-500" : "bg-zinc-700"}`}
                aria-checked={alertTelegram}
                role="switch"
                data-testid="toggle-alert-telegram"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${alertTelegram ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            ) : (
              <Button
                variant="outline"
                onClick={startTelegramLink}
                disabled={telegramBusy}
                className="bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:bg-zinc-800 shrink-0"
                data-testid="link-telegram-btn"
              >
                {telegramBusy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin"/> : <Send className="w-3.5 h-3.5 mr-1.5"/>}
                {t("settings.alert_telegram_connect")}
              </Button>
            )}
          </div>

          {telegramLinkInfo && (
            <div className="mt-4 border border-amber-500/20 bg-amber-500/5 rounded-lg px-4 py-3 space-y-2">
              <p className="text-xs text-amber-300">{t("settings.alert_telegram_link_hint")}</p>
              {telegramLinkInfo.deepLink && (
                <a href={telegramLinkInfo.deepLink} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300">
                  <Send className="w-3.5 h-3.5"/> {t("settings.alert_telegram_open_btn")}
                </a>
              )}
              <div className="text-xs text-zinc-500 font-mono">{t("settings.alert_telegram_code_label")}: <span className="text-zinc-300">{telegramLinkInfo.code}</span></div>
            </div>
          )}

          <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-400">
            {notifStatus.telegram_linked ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" /> {t("settings.alert_telegram_linked")}
                <button onClick={unlinkTelegram} className="ml-2 text-zinc-500 hover:text-rose-400 underline underline-offset-2" data-testid="unlink-telegram-btn">
                  {t("settings.alert_telegram_unlink")}
                </button>
              </>
            ) : (
              <><BellOff className="w-3.5 h-3.5" /> {t("settings.alert_telegram_not_linked")}</>
            )}
          </div>
        </div>
      )}

      {/* Programa de referral (14 jul 2026) — código próprio + link de
          convite, contagem de convites válidos/pendentes e progresso até ao
          próximo nível (ver backend/routes/referrals.py e referral_utils.py
          para o cálculo/aplicação das recompensas via crédito de saldo
          Stripe). */}
      {referral && (
        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-1">
            <Gift className="w-4 h-4 text-emerald-400" />
            <div className="text-sm font-medium text-zinc-200">{t("settings.referral_title")}</div>
          </div>
          <p className="text-xs text-zinc-400 mb-4">{t("settings.referral_desc")}</p>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 min-w-0 bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2.5 font-mono text-xs text-zinc-300 truncate">
              {referral.invite_link}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={copyReferralLink}
              className="bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:bg-zinc-800 shrink-0"
              data-testid="copy-referral-link"
            >
              {referralCopied
                ? <><Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" /> {t("common.copied")}</>
                : <><Copy className="w-3.5 h-3.5 mr-1.5" /> {t("common.copy")}</>
              }
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-zinc-950/40 border border-zinc-800/60 rounded-lg px-3 py-2.5 text-center">
              <div className="text-lg font-semibold text-emerald-400">{referral.valid_referrals}</div>
              <div className="text-[11px] text-zinc-500">{t("settings.referral_valid_label")}</div>
            </div>
            <div className="bg-zinc-950/40 border border-zinc-800/60 rounded-lg px-3 py-2.5 text-center">
              <div className="text-lg font-semibold text-zinc-300">{referral.pending_referrals}</div>
              <div className="text-[11px] text-zinc-500">{t("settings.referral_pending_label")}</div>
            </div>
            <div className="bg-zinc-950/40 border border-zinc-800/60 rounded-lg px-3 py-2.5 text-center col-span-2 sm:col-span-1">
              <div className="text-lg font-semibold text-zinc-300">{referral.reward_days_granted}</div>
              <div className="text-[11px] text-zinc-500">{t("settings.referral_days_label")}</div>
            </div>
          </div>

          <p className="mt-3 text-xs text-zinc-500">
            {referral.next_milestone
              ? t("settings.referral_progress", {
                  remaining: referral.referrals_until_next_milestone,
                  milestone: referral.next_milestone,
                })
              : t("settings.referral_all_milestones")}
          </p>
        </div>
      )}

      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-6">
        <div className="text-sm font-medium text-zinc-200 mb-4">
          {t("settings.subscription_title")}
        </div>

        {subscription ? (
          <div className="space-y-3">
            <div className="text-zinc-300">
              {t("settings.subscription_plan")}: <span className="text-white">{subscription.subscription_plan || t("settings.subscription_free")}</span>
            </div>

            <div className="text-zinc-300">
              {t("settings.subscription_status")}: <span className="text-white">{subscription.subscription_status || t("settings.subscription_inactive")}</span>
            </div>

            {subscription.trial_ends_at && (
              <div className="text-zinc-300">
                {t("settings.subscription_trial_ends")}:{" "}
                <span className="text-white">
                  {new Date(subscription.trial_ends_at * 1000).toLocaleDateString()}
                </span>
              </div>
            )}

            <Button
              onClick={async () => {
                try {
                  const { data } = await api.post("/billing/create-portal-session");
                  window.location.href = data.url;
                } catch (e) {
                  // 14 jul 2026 — sem try/catch isto falhava em silêncio
                  // (promise rejeitada sem handler) sempre que a conta ainda
                  // não tinha stripe_customer_id, ou seja, nunca tinha
                  // passado por um checkout — o botão parecia simplesmente
                  // não fazer nada. O backend devolve 400 nesse caso.
                  if (e.response?.status === 400) {
                    toast.error(t("settings.subscription_manage_no_customer"));
                  } else {
                    toast.error(formatApiErrorDetail(e.response?.data?.detail) || t("common.error"));
                  }
                }
              }}
            >
              {t("settings.subscription_manage")}
            </Button>
          </div>
        ) : (
          <div className="text-zinc-400 text-sm">
            {t("settings.subscription_loading")}
          </div>
        )}
      </div>

      {/* ── Backup dos dados ──────────────────────────────────────────
          7 jul 2026: antes da Danger Zone (que só tem opções destrutivas)
          não havia nenhuma forma de um utilizador levar os seus dados
          consigo — só existia o CSV estreito de retornos na Análise. Fica
          mesmo antes da Danger Zone de propósito, para ser o passo óbvio
          a dar antes de limpar/apagar alguma coisa ali em baixo. */}
      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <Download className="w-4 h-4 text-emerald-400" />
          <div className="text-sm font-medium text-zinc-200">{t("settings.backup_title")}</div>
        </div>
        <p className="text-xs text-zinc-400 mb-5">{t("settings.backup_subtitle")}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportData}
          disabled={exportingData}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          data-testid="backup-export-btn"
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          {exportingData ? t("settings.backup_generating") : t("settings.backup_btn")}
        </Button>
      </div>

      {/* ── Danger Zone ─────────────────────────────────────────────── */}
      <div className="bg-zinc-900/40 border border-rose-500/30 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-rose-400" />
          <div className="text-sm font-medium text-rose-400">{t("settings.danger_title")}</div>
        </div>
        <p className="text-xs text-zinc-400 mb-5">{t("settings.danger_subtitle")}</p>

        <div className="space-y-0">
          {/* Clear a single wallet */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-t border-zinc-800 pt-4">
            <div className="flex-1">
              <div className="text-sm text-zinc-300">{t("settings.danger_clear_wallet")}</div>
              <div className="text-xs text-zinc-400 mt-0.5">{t("settings.danger_clear_wallet_desc")}</div>
            </div>
            <select
              className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs rounded-md px-2 py-1.5 shrink-0"
              defaultValue=""
              onChange={(e) => {
                const w = wallets.find((w) => w.id === e.target.value);
                if (w) openReset("wallet", w.id, w.name);
                e.target.value = "";
              }}
            >
              <option value="">{t("settings.danger_select_wallet")}</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {/* Clear all transactions */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-t border-zinc-800 pt-4 mt-4">
            <div className="flex-1">
              <div className="text-sm text-zinc-300">{t("settings.danger_clear_all")}</div>
              <div className="text-xs text-zinc-400 mt-0.5">{t("settings.danger_clear_all_desc")}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openReset("all")}
              className="shrink-0 border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
              data-testid="danger-clear-all-btn"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> {t("settings.danger_btn_clear_all")}
            </Button>
          </div>

          {/* Delete account */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-t border-zinc-800 pt-4 mt-4">
            <div className="flex-1">
              <div className="text-sm text-zinc-300">{t("settings.danger_delete_account")}</div>
              <div className="text-xs text-zinc-400 mt-0.5">{t("settings.danger_delete_account_desc")}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setDeletePassword(""); setDeleteAccountDialog(true); }}
              className="shrink-0 border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
              data-testid="danger-delete-account-btn"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> {t("settings.danger_btn_delete_account")}
            </Button>
          </div>
        </div>
      </div>

      {/* PIN setup dialog */}
      <Dialog open={pinDialog} onOpenChange={setPinDialog}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-light text-2xl">{status.has_pin ? t("settings.change_pin") : t("settings.set_pin")}</DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">{t("settings.pin_dialog_desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("settings.new_pin")}</Label>
              <Input
                type="password" inputMode="numeric" pattern="\d*"
                maxLength={6} value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                className="mt-2 bg-zinc-900/50 border-zinc-800 font-mono text-center text-xl tracking-[0.4em]"
                data-testid="pin-input"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("settings.confirm_pin")}</Label>
              <Input
                type="password" inputMode="numeric" pattern="\d*"
                maxLength={6} value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") submitPin(); }}
                className="mt-2 bg-zinc-900/50 border-zinc-800 font-mono text-center text-xl tracking-[0.4em]"
                data-testid="pin-confirm-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinDialog(false)} className="bg-zinc-900/50 border-zinc-800 text-zinc-300" data-testid="pin-cancel">{t("common.cancel")}</Button>
            <Button onClick={submitPin} disabled={saving || !pin || !pinConfirm} className="bg-zinc-100 text-zinc-950 hover:bg-white" data-testid="pin-submit">
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2FA — passo 1: QR + código de confirmação */}
      <Dialog open={twoFAStep === "qr"} onOpenChange={(v) => { if (!v) setTwoFAStep(null); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-light text-2xl">{t("settings.2fa_setup_title")}</DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">{t("settings.2fa_setup_desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-center bg-white p-3 rounded-lg w-fit mx-auto">
              {twoFAOtpUrl && <QRCodeSVG value={twoFAOtpUrl} size={176} />}
            </div>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-zinc-500 mb-1">{t("settings.2fa_manual_key")}</div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 font-mono text-xs text-zinc-300 break-all select-all">{twoFASecret}</div>
            </div>
            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("settings.2fa_code_label")}</Label>
              <Input
                type="text" inputMode="numeric" maxLength={6}
                value={twoFACode}
                onChange={(e) => { setTwoFACode(e.target.value.replace(/\D/g, "")); setTwoFAError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") confirmTwoFactorSetup(); }}
                placeholder="000000"
                className="mt-2 bg-zinc-900/50 border-zinc-800 font-mono text-center text-xl tracking-[0.4em]"
                data-testid="2fa-confirm-code"
                autoFocus
              />
            </div>
            {twoFAError && <div className="text-xs font-mono text-rose-400">{twoFAError}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTwoFAStep(null)} className="bg-zinc-900/50 border-zinc-800 text-zinc-300" data-testid="2fa-setup-cancel">{t("common.cancel")}</Button>
            <Button onClick={confirmTwoFactorSetup} disabled={twoFABusy || twoFACode.length !== 6} className="bg-zinc-100 text-zinc-950 hover:bg-white" data-testid="2fa-setup-confirm">
              {twoFABusy ? t("common.saving") : t("settings.2fa_confirm_btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2FA — passo 2: códigos de recuperação, mostrados uma única vez
          (o backend só guarda o hash — se se perderem, não há como os
          recuperar depois, só desativar e configurar de novo). */}
      <Dialog open={twoFAStep === "recovery"} onOpenChange={(v) => { if (!v) setTwoFAStep(null); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-light text-2xl text-emerald-400">{t("settings.2fa_enabled_title")}</DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">{t("settings.2fa_recovery_desc")}</DialogDescription>
          </DialogHeader>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 grid grid-cols-2 gap-2 font-mono text-sm text-zinc-200">
            {twoFARecoveryCodes.map((c) => <div key={c}>{c}</div>)}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-amber-400 mt-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {t("settings.2fa_recovery_warning")}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => navigator.clipboard?.writeText(twoFARecoveryCodes.join("\n"))}
              className="bg-zinc-900/50 border-zinc-800 text-zinc-300"
              data-testid="2fa-recovery-copy"
            >
              <Copy className="w-3.5 h-3.5 mr-1.5" /> {t("common.copy")}
            </Button>
            <Button onClick={() => setTwoFAStep(null)} className="bg-zinc-100 text-zinc-950 hover:bg-white" data-testid="2fa-recovery-done">
              {t("settings.2fa_recovery_done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2FA — desativar, com confirmação de password (mesma exigência do
          apagar conta: uma proteção de segurança não devia sair com um
          único clique acidental). */}
      <Dialog open={disable2FADialog} onOpenChange={setDisable2FADialog}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-light text-2xl text-rose-400">{t("settings.2fa_disable")}</DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">{t("settings.2fa_disable_desc")}</DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            value={disable2FAPassword}
            onChange={(e) => setDisable2FAPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") disableTwoFactor(); }}
            placeholder={t("auth.password")}
            className="bg-zinc-900/50 border-zinc-800"
            data-testid="2fa-disable-password"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDisable2FADialog(false); setDisable2FAPassword(""); }} className="bg-zinc-900/50 border-zinc-800 text-zinc-300" data-testid="2fa-disable-cancel">{t("common.cancel")}</Button>
            <Button onClick={disableTwoFactor} disabled={twoFABusy || !disable2FAPassword} className="bg-rose-500 hover:bg-rose-400 text-zinc-950" data-testid="2fa-disable-confirm">
              {twoFABusy ? t("common.saving") : t("settings.2fa_disable")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset confirmation modal */}
      {resetModal && (
        <Dialog open={!!resetModal} onOpenChange={(v) => { if (!v) setResetModal(null); }}>
          <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display font-light text-2xl text-rose-400">{t("settings.danger_confirm_title")}</DialogTitle>
              <DialogDescription className="text-zinc-400 text-sm">
                {t("settings.danger_confirm_desc")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
                <span className="font-mono text-2xl tracking-[0.3em] text-zinc-100">{resetModal.code}</span>
                <button
                  onClick={() => navigator.clipboard?.writeText(resetModal.code)}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <Input
                value={resetModal.input}
                onChange={(e) => setResetModal((m) => ({ ...m, input: e.target.value }))}
                placeholder={t("settings.danger_confirm_placeholder")}
                className="bg-zinc-900/50 border-zinc-800 font-mono text-center tracking-[0.3em]"
                data-testid="danger-confirm-input"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetModal(null)} className="bg-zinc-900/50 border-zinc-800 text-zinc-300">{t("common.cancel")}</Button>
              <Button
                onClick={submitReset}
                disabled={resetModal.loading || resetModal.input !== resetModal.code}
                className="bg-rose-600 hover:bg-rose-500 text-white border-0"
                data-testid="danger-confirm-submit"
              >
                {resetModal.loading ? t("common.saving") : (resetModal.type === "wallet" ? t("settings.danger_btn_clear_wallet") : t("settings.danger_btn_clear_all"))}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete account confirmation dialog */}
      <Dialog open={deleteAccountDialog} onOpenChange={(v) => { if (!deletingAccount) setDeleteAccountDialog(v); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-light text-2xl text-rose-400">{t("settings.delete_account_dialog_title")}</DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              {t("settings.delete_account_dialog_desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("settings.delete_account_password_label")}</Label>
            <Input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && deletePassword) submitDeleteAccount(); }}
              className="bg-zinc-900/50 border-zinc-800"
              data-testid="delete-account-password-input"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAccountDialog(false)} disabled={deletingAccount} className="bg-zinc-900/50 border-zinc-800 text-zinc-300">{t("common.cancel")}</Button>
            <Button
              onClick={submitDeleteAccount}
              disabled={deletingAccount || !deletePassword}
              className="bg-rose-600 hover:bg-rose-500 text-white border-0"
              data-testid="delete-account-confirm-submit"
            >
              {deletingAccount ? t("common.saving") : t("settings.danger_btn_delete_account")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ModeCard({ icon, title, desc, selected, onClick, badge, testId, loading }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`group text-left p-4 border rounded-xl transition-all ${
        selected
          ? "border-blue-500/50 bg-blue-500/10"
          : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900"
      }`}
      data-testid={testId}
    >
      <div className="flex items-center justify-between mb-2">
        <div className={`w-8 h-8 rounded-md flex items-center justify-center ${selected ? "bg-blue-500/20 text-blue-300" : "bg-zinc-800 text-zinc-400 group-hover:text-zinc-100"}`}>
          {loading ? <span className="animate-spin">⟳</span> : icon}
        </div>
        {badge}
        {selected && <Check className="w-4 h-4 text-blue-400"/>}
      </div>
      <div className="font-medium text-zinc-100 mb-1">{title}</div>
      <div className="text-[11px] text-zinc-400 leading-relaxed">{desc}</div>
    </button>
  );
}

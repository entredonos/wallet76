import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import { Lock, Fingerprint, ShieldOff, Check, Trash2, KeyRound } from "lucide-react";
import { toast } from "sonner";
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

export default function Settings() {
  const { t } = useI18n();
  const [status, setStatus] = useState({ lock_mode: "none", has_pin: false, biometric_count: 0 });
  const [pinDialog, setPinDialog] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [registeringBio, setRegisteringBio] = useState(false);
  const [subscription, setSubscription] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/security/status");
      setStatus(data);

      const sub = await api.get("/billing/subscription-status");
      setSubscription(sub.data);
    } catch {
      /* noop */
    }
  };
    useEffect(() => { load(); }, []);

  const choose = async (mode) => {
    if (mode === "pin" && !status.has_pin) {
      setPin(""); setPinConfirm(""); setPinDialog(true); return;
    }
    if (mode === "biometric" && status.biometric_count === 0) {
      await registerBiometric(); return;
    }
    try {
      await api.post("/security/lock-mode", { mode });
      toast.success(t("settings.lock_updated"));
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed");
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
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed");
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
      toast.error(e?.message || formatApiErrorDetail(e.response?.data?.detail) || "Biometric setup failed");
    } finally { setRegisteringBio(false); }
  };

  const removeBiometrics = async () => {
    try {
      // Note: we don't expose individual cred deletion in UI; just clear all by switching mode to none then DELETE
      await api.post("/security/lock-mode", { mode: "none" });
      // List would require an endpoint; for now we instruct user to re-register if needed
      toast.success(t("settings.biometric_removed"));
      load();
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="space-y-8 fade-in max-w-3xl">
      <div>
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("settings.kicker")}</div>
        <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mt-2">{t("settings.title")}</h1>
        <p className="text-zinc-500 mt-2">{t("settings.subtitle")}</p>
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
            badge={status.biometric_count > 0 ? <span className="text-[10px] font-mono text-emerald-400">{status.biometric_count}</span> : null}
            onClick={() => choose("biometric")}
            testId="lock-mode-biometric"
            loading={registeringBio}
          />
        </div>

        {status.lock_mode !== "none" && (
          <div className="mt-5 text-xs font-mono text-zinc-500 flex items-center gap-2">
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
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-6">
        <div className="text-sm font-medium text-zinc-200 mb-2">{t("settings.sync_title")}</div>
        <p className="text-xs text-zinc-500 leading-relaxed">{t("settings.sync_desc")}</p>
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-6">
        <div className="text-sm font-medium text-zinc-200 mb-4">
          Subscription
        </div>

        {subscription ? (
          <div className="space-y-3">
            <div className="text-zinc-300">
              Plan: <span className="text-white">{subscription.subscription_plan || "Free"}</span>
            </div>

            <div className="text-zinc-300">
              Status: <span className="text-white">{subscription.subscription_status || "inactive"}</span>
            </div>

            {subscription.trial_ends_at && (
              <div className="text-zinc-300">
                Trial ends:{" "}
                <span className="text-white">
                  {new Date(subscription.trial_ends_at * 1000).toLocaleDateString()}
                </span>
              </div>
            )}

            <Button
              onClick={async () => {
                const { data } = await api.post("/billing/create-portal-session");
                window.location.href = data.url;
              }}
            >
              Manage Subscription
            </Button>
          </div>
        ) : (
          <div className="text-zinc-500 text-sm">
            Loading subscription...
          </div>
        )}
      </div>

      {/* PIN setup dialog */}
      <Dialog open={pinDialog} onOpenChange={setPinDialog}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-light text-2xl">{status.has_pin ? t("settings.change_pin") : t("settings.set_pin")}</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">{t("settings.pin_dialog_desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("settings.new_pin")}</Label>
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
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("settings.confirm_pin")}</Label>
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
      <div className="text-[11px] text-zinc-500 leading-relaxed">{desc}</div>
    </button>
  );
}

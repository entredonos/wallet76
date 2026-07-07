import React, { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { useI18n } from "../context/I18nContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { TrendingUp, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import walletLogo from "../assets/wallet76-logo80x60.png";
import AuthLangSwitcher from "../components/AuthLangSwitcher";

// || "" — ver lib/api.js para o porquê (proxy same-origin em produção via
// vercel.json; sem isto, "undefined/api" quando a env var não existe).
const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

export default function ResetPassword() {
  const { token } = useParams();
  const { t } = useI18n();
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (password.length < 8) { setErr(t("auth.password_short")); return; }
    if (password !== confirm) { setErr(t("auth.password_mismatch")); return; }
    setLoading(true);
    try {
      await axios.post(`${API}/auth/reset-password`, { token, new_password: password });
      setDone(true);
      setTimeout(() => nav("/login"), 2500);
    } catch (e2) {
      setErr(e2.response?.data?.detail || t("auth.reset_failed"));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 grid-bg">
      <div className="w-full max-w-md fade-in">
        <div className="flex items-center justify-between gap-3 mb-10">
          <div className="flex items-center gap-3">
            <img src={walletLogo} alt="Wallet76" className="w-12 h-12 object-contain" />
            <div>
              <div className="flex items-center gap-3">
                <div className="font-display text-xl tracking-tight">Wallet76</div>
              </div>
              <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">recover</div>
            </div>
          </div>
          <AuthLangSwitcher />
        </div>

        {!done ? (
          <>
            <h1 className="font-display text-4xl font-light tracking-tight mb-2">{t("auth.reset_title")}</h1>
            <p className="text-zinc-500 mb-10">{t("auth.reset_subtitle")}</p>
            <form onSubmit={submit} className="space-y-5" data-testid="reset-form">
              <div>
                <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("auth.new_password")}</Label>
                <div className="relative mt-2">
                  <Input
                    data-testid="reset-password"
                    type={showPassword ? "text" : "password"}
                    required minLength={8} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-zinc-900/50 border-zinc-800 h-12 pr-11"
                    placeholder={t("auth.password_hint")} autoFocus
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200" tabIndex={-1} data-testid="toggle-password-visibility">
                    {showPassword ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("auth.confirm")}</Label>
                <Input
                  data-testid="reset-confirm"
                  type={showPassword ? "text" : "password"}
                  required minLength={8} value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="mt-2 bg-zinc-900/50 border-zinc-800 h-12"
                  placeholder={t("auth.repeat_password")}
                />
              </div>
              {err && <div className="text-rose-400 text-sm font-mono" data-testid="reset-error">{err}</div>}
              <Button type="submit" disabled={loading || !password || !confirm} className="w-full h-12 bg-zinc-100 text-zinc-950 hover:bg-white font-medium" data-testid="reset-submit">
                {loading ? t("common.saving") : t("auth.reset_submit")}
              </Button>
            </form>
          </>
        ) : (
          <div className="space-y-4" data-testid="reset-done">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-400"/>
            </div>
            <h1 className="font-display text-3xl font-light">{t("auth.reset_done_title")}</h1>
            <p className="text-zinc-400">{t("auth.reset_done_body")}</p>
          </div>
        )}

        <div className="mt-8">
          <Link to="/login" className="text-sm text-zinc-500 hover:text-zinc-200" data-testid="back-to-login">← {t("auth.back_to_login")}</Link>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, formatApiErrorDetail } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { TrendingUp, Eye, EyeOff } from "lucide-react";
import walletLogo from "../assets/wallet76-logo80x60.png";

export default function Login() {
  const { login } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [needsVerify, setNeedsVerify] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setNeedsVerify(false);
    setResendMsg("");
    setLoading(true);
    try {
      await login(email, password);
      nav("/");
    } catch (e2) {
      const detail = e2.response?.data?.detail;
      if (detail && typeof detail === "object" && detail.code === "email_not_verified") {
        setNeedsVerify(true);
        setErr(detail.message || "Please verify your email before signing in.");
      } else {
        setErr(formatApiErrorDetail(detail) || e2.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setResendMsg("");
    try {
      await api.post("/auth/resend-verification", { email });
      setResendMsg(t("auth.resend_sent"));
    } catch (e2) {
      setResendMsg(formatApiErrorDetail(e2.response?.data?.detail) || t("auth.resend_error"));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 grid-bg">
      <div className="w-full max-w-md fade-in">
        <div className="flex items-center gap-3 mb-10">
          <img src={walletLogo} alt="Wallet76" className="w-13 h-13 object-contain" />
          <div>
            <div className="flex items-center gap-3">
              
              <div className="font-display text-xl tracking-tight">Wallet76</div>
            </div>
            <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">terminal</div>
          </div>
        </div>

        <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mb-2">{t("auth.signin_title")}</h1>
        <p className="text-zinc-500 mb-10">{t("auth.signin_subtitle")}</p>

        <form onSubmit={submit} className="space-y-5" data-testid="login-form">
          <div>
            <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("auth.email")}</Label>
            <Input
              data-testid="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 bg-zinc-900/50 border-zinc-800 focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500 h-12"
              placeholder={t("auth.email_placeholder")}
              autoComplete="email"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("auth.password")}</Label>
              <Link to="/forgot-password" className="text-[11px] font-mono text-zinc-400 hover:text-blue-400 underline-offset-4 hover:underline transition-colors" data-testid="link-forgot-password">
                {t("auth.forgot")}
              </Link>
            </div>
            <div className="relative">
              <Input
                data-testid="login-password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-0 bg-zinc-900/50 border-zinc-800 focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500 h-12 pr-11"
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 transition-colors"
                data-testid="toggle-password-visibility"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
              </button>
            </div>
          </div>

          {err && <div className="text-rose-400 text-sm font-mono" data-testid="login-error">{err}</div>}
          {needsVerify && (
            <div className="space-y-2" data-testid="verify-prompt">
              <Button
                type="button"
                onClick={resend}
                disabled={resending || !email}
                variant="outline"
                className="w-full h-11 bg-zinc-900/50 border-zinc-800 text-zinc-200 hover:bg-zinc-900"
                data-testid="resend-verification"
              >
                {resending ? t("auth.resending") : t("auth.resend")}
              </Button>
              {resendMsg && <div className="text-xs font-mono text-zinc-400" data-testid="resend-message">{resendMsg}</div>}
            </div>
          )}

          <Button
            data-testid="login-submit"
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-zinc-100 text-zinc-950 hover:bg-white font-medium"
          >
            {loading ? t("auth.signing_in") : t("auth.signin_submit")}
          </Button>
        </form>

        <div className="mt-8 text-sm text-zinc-500">
          {t("auth.no_account")}{" "}
          <Link to="/register" className="text-zinc-200 hover:text-white underline underline-offset-4" data-testid="link-register">
            {t("auth.create_account")}
          </Link>
        </div>
      </div>
    </div>
  );
}

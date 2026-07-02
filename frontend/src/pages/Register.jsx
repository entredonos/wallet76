import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, formatApiErrorDetail } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { api, isNetworkError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { TrendingUp, Eye, EyeOff, MailCheck } from "lucide-react";
import walletLogo from "../assets/wallet76-logo80x60.png";
import AuthLangSwitcher from "../components/AuthLangSwitcher";

export default function Register() {
  const { register } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await register(email, password, name);
      setDone(true);
    } catch (e2) {
      setErr(isNetworkError(e2) ? t("errors.network") : (formatApiErrorDetail(e2.response?.data?.detail) || e2.message));
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

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 grid-bg">
        <div className="w-full max-w-md fade-in" data-testid="register-success">
          <div className="flex items-center justify-between gap-3 mb-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md border border-zinc-800 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-zinc-200" />
              </div>
              <div>
                  <div className="flex items-center gap-3">
                    <img src={walletLogo} alt="Wallet76" className="w-10 h-10 object-contain" />
                    <div className="font-display text-xl tracking-tight">Wallet76</div>
                  </div>
                <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">terminal</div>
              </div>
            </div>
            <AuthLangSwitcher />
          </div>

          <div className="w-12 h-12 rounded-md border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center mb-6">
            <MailCheck className="w-6 h-6 text-emerald-400" />
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-light tracking-tight mb-3">{t("auth.check_inbox")}</h1>
          <p className="text-zinc-400 leading-relaxed mb-8" data-testid="check-inbox-body">
            {t("auth.check_inbox_body", { email }).split(email).map((part, i, arr) => (
              <React.Fragment key={i}>
                {part}
                {i < arr.length - 1 && <span className="text-zinc-100 font-mono">{email}</span>}
              </React.Fragment>
            ))}
          </p>

          <div className="flex flex-col gap-3">
            <Button
              data-testid="goto-login"
              onClick={() => nav("/login")}
              className="w-full h-12 bg-zinc-100 text-zinc-950 hover:bg-white font-medium"
            >
              {t("auth.goto_signin")}
            </Button>
            <Button
              data-testid="resend-verification"
              onClick={resend}
              disabled={resending}
              variant="outline"
              className="w-full h-12 bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:bg-zinc-900"
            >
              {resending ? t("auth.resending") : t("auth.resend")}
            </Button>
          </div>
          {resendMsg && (
            <div className="mt-4 text-sm text-zinc-400 font-mono" data-testid="resend-message">{resendMsg}</div>
          )}
          <div className="mt-8 text-xs text-zinc-500 font-mono leading-relaxed">
            {t("auth.spam_hint")}
          </div>
        </div>
      </div>
    );
  }

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
              <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">terminal</div>
            </div>
          </div>
          <AuthLangSwitcher />
        </div>

        <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mb-2">{t("auth.create_title")}</h1>
        <p className="text-zinc-500 mb-10">{t("auth.create_subtitle")}</p>

        <form onSubmit={submit} className="space-y-5" data-testid="register-form">
          <div>
            <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("auth.name")}</Label>
            <Input
              data-testid="register-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2 bg-zinc-900/50 border-zinc-800 focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500 h-12"
              placeholder={t("auth.name_placeholder")}
            />
          </div>
          <div>
            <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("auth.email")}</Label>
            <Input
              data-testid="register-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 bg-zinc-900/50 border-zinc-800 focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500 h-12"
              placeholder={t("auth.email_placeholder")}
            />
          </div>
          <div>
            <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("auth.password")}</Label>
            <div className="relative mt-2">
              <Input
                data-testid="register-password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-zinc-900/50 border-zinc-800 focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500 h-12 pr-11"
                placeholder={t("auth.password_hint")}
                autoComplete="new-password"
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

          {err && <div className="text-rose-400 text-sm font-mono" data-testid="register-error">{err}</div>}

          <Button
            data-testid="register-submit"
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-zinc-100 text-zinc-950 hover:bg-white font-medium"
          >
            {loading ? t("auth.creating") : t("auth.create_submit")}
          </Button>
        </form>

        <div className="mt-8 text-sm text-zinc-500">
          {t("auth.have_account")}{" "}
          <Link to="/login" className="text-zinc-200 hover:text-white underline underline-offset-4" data-testid="link-login">
            {t("auth.signin_link")}
          </Link>
        </div>
      </div>
    </div>
  );
}

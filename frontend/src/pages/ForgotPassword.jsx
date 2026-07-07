import React, { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useI18n } from "../context/I18nContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { TrendingUp, ArrowLeft, CheckCircle2 } from "lucide-react";
import walletLogo from "../assets/wallet76-logo80x60.png";
import AuthLangSwitcher from "../components/AuthLangSwitcher";

// || "" — ver lib/api.js para o porquê (proxy same-origin em produção via
// vercel.json; sem isto, "undefined/api" quando a env var não existe).
const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

export default function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${API}/auth/forgot-password`, { email });
      setSent(true);
    } catch { setSent(true); }
    setLoading(false);
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

        {!sent ? (
          <>
            <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mb-2">{t("auth.forgot_title")}</h1>
            <p className="text-zinc-500 mb-10">{t("auth.forgot_subtitle")}</p>
            <form onSubmit={submit} className="space-y-5" data-testid="forgot-form">
              <div>
                <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("auth.email")}</Label>
                <Input
                  data-testid="forgot-email"
                  type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 bg-zinc-900/50 border-zinc-800 h-12"
                  placeholder={t("auth.email_placeholder")}
                  autoFocus
                />
              </div>
              <Button
                data-testid="forgot-submit"
                type="submit" disabled={loading}
                className="w-full h-12 bg-zinc-100 text-zinc-950 hover:bg-white font-medium"
              >
                {loading ? t("auth.sending") : t("auth.send_reset")}
              </Button>
            </form>
          </>
        ) : (
          <div className="space-y-5" data-testid="forgot-sent">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-emerald-400"/>
            </div>
            <h1 className="font-display text-3xl font-light tracking-tight">{t("auth.forgot_sent_title")}</h1>
            <p className="text-zinc-400">
              {t("auth.forgot_sent_body", { email }).split(email).map((part, i, arr) => (
                <React.Fragment key={i}>
                  {part}
                  {i < arr.length - 1 && <span className="font-mono text-zinc-200">{email}</span>}
                </React.Fragment>
              ))}
            </p>
            <p className="text-xs text-zinc-600">
              {t("auth.spam_hint_2")}{" "}
              <button onClick={() => setSent(false)} className="text-zinc-300 underline" data-testid="forgot-try-again">{t("auth.try_again")}</button>.
            </p>
          </div>
        )}

        <div className="mt-8">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-200 transition-colors" data-testid="back-to-login">
            <ArrowLeft className="w-3.5 h-3.5"/> {t("auth.back_to_login")}
          </Link>
        </div>
      </div>
    </div>
  );
}

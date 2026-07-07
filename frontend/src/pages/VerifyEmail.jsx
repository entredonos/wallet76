import React, { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { useI18n } from "../context/I18nContext";
import { TrendingUp, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import walletLogo from "../assets/wallet76-logo80x60.png";
import AuthLangSwitcher from "../components/AuthLangSwitcher";

// || "" — ver lib/api.js para o porquê (proxy same-origin em produção via
// vercel.json; sem isto, "undefined/api" quando a env var não existe).
const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

export default function VerifyEmail() {
  const { token } = useParams();
  const { t } = useI18n();
  const nav = useNavigate();
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token) { setStatus("error"); setErr(t("auth.verify_default_error")); return; }
    (async () => {
      try {
        await axios.post(`${API}/auth/verify-email`, { token });
        setStatus("ok");
        setTimeout(() => nav("/login"), 2500);
      } catch (e) {
        setStatus("error");
        // Backend detail may be plain English ("Invalid or expired token"); show a localized message instead.
        setErr(t("auth.verify_default_error"));
        void e;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, nav]);

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
              <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">confirm email</div>
            </div>
          </div>
          <AuthLangSwitcher />
        </div>

        {status === "loading" && (
          <div className="space-y-3" data-testid="verify-loading">
            <Loader2 className="w-7 h-7 text-zinc-400 animate-spin"/>
            <h1 className="font-display text-3xl font-light">{t("auth.verify_loading_title")}</h1>
            <p className="text-zinc-500">{t("auth.verify_loading_body")}</p>
          </div>
        )}
        {status === "ok" && (
          <div className="space-y-3" data-testid="verify-ok">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-400"/>
            </div>
            <h1 className="font-display text-3xl font-light">{t("auth.verify_ok_title")}</h1>
            <p className="text-zinc-500">{t("auth.verify_ok_body")}</p>
          </div>
        )}
        {status === "error" && (
          <div className="space-y-3" data-testid="verify-error">
            <div className="w-12 h-12 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
              <XCircle className="w-6 h-6 text-rose-400"/>
            </div>
            <h1 className="font-display text-3xl font-light">{t("auth.verify_error_title")}</h1>
            <p className="text-zinc-500">{err}</p>
            <Link to="/login" className="inline-block mt-4 text-sm text-zinc-300 hover:text-white underline" data-testid="back-to-login">{t("auth.back_to_login")}</Link>
          </div>
        )}
      </div>
    </div>
  );
}

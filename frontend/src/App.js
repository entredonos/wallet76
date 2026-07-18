import React, { useState } from "react";
import { useI18n } from "./context/I18nContext";
import routeFallbackLogo from "./assets/wallet76-logo.png";

const IS_DEV = process.env.NODE_ENV === "development";

// Deteta se a página está a correr "instalada" (PWA em modo standalone, ou
// o `navigator.standalone` que o Safari/iOS usa há anos para o mesmo fim) —
// ver nota junto à rota "/" mais abaixo sobre porque isto é preciso além do
// Capacitor.isNativePlatform().
function isStandaloneDisplay() {
  try {
    return (
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator?.standalone === true
    );
  } catch {
    return false;
  }
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, dismissed: false };
  }
  componentDidCatch(error, info) {
    this.setState({ error, info });
    console.error("[Wallet76] React crash:", error, info);
  }
  render() {
    const { error, info, dismissed } = this.state;
    if (error && !dismissed) {
      return (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: "100vh", background: "#09090b", fontFamily: "system-ui, sans-serif",
          padding: 24,
        }}>
          <div style={{
            maxWidth: 480, width: "100%",
            background: "#18181b", border: "1px solid #3f3f46",
            borderRadius: 16, padding: "32px 28px", textAlign: "center",
          }}>
            {/* Icon */}
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              background: "#fef2f2", margin: "0 auto 20px",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24,
            }}>⚠️</div>

            <h2 style={{ color: "#f4f4f5", fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>
              Algo correu mal
            </h2>
            <p style={{ color: "#a1a1aa", fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>
              A página encontrou um erro inesperado.
              Recarrega para continuar — os teus dados estão seguros.
            </p>

            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: "#f4f4f5", color: "#09090b",
                  border: "none", borderRadius: 8,
                  padding: "10px 20px", fontSize: 14, fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Recarregar página
              </button>
              <button
                onClick={() => this.setState({ dismissed: true })}
                style={{
                  background: "transparent", color: "#71717a",
                  border: "1px solid #3f3f46", borderRadius: 8,
                  padding: "10px 20px", fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Ignorar
              </button>
            </div>

            {/* Dev-only: show stack trace */}
            {IS_DEV && (
              <details style={{ marginTop: 24, textAlign: "left" }}>
                <summary style={{ color: "#71717a", fontSize: 12, cursor: "pointer", marginBottom: 8 }}>
                  Detalhes do erro (dev)
                </summary>
                <pre style={{
                  color: "#fca5a5", fontSize: 11, whiteSpace: "pre-wrap",
                  background: "#09090b", borderRadius: 8, padding: 12,
                  maxHeight: 240, overflow: "auto",
                }}>
                  {error?.toString()}
                  {"\n\n"}
                  {info?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import "./App.css";
import { Suspense, lazy } from "react";
import { Capacitor } from "@capacitor/core";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { I18nProvider } from "./context/I18nContext";
import { PrivacyProvider } from "./context/PrivacyContext";
import Layout from "./components/Layout";
import LockScreen from "./components/LockScreen";
import WhatsNewModal from "./components/WhatsNewModal";
import OnboardingWizard from "./components/OnboardingWizard";
import ApkUpdateBanner from "./components/ApkUpdateBanner";
import PreferencesSync from "./components/PreferencesSync";
import { Toaster } from "./components/ui/sonner";
import CookieBanner from "./components/CookieBanner";
import BackendStatusBanner from "./components/BackendStatusBanner";
import UpdateAvailableToast from "./components/UpdateAvailableToast";

// Every page is its own chunk instead of one big bundle — the previous
// static imports below meant visiting /login pulled in the JS for
// Dashboard, Analytics, AdminFeedback, every other page, etc. all at once,
// even though only one route renders at a time. React.lazy + the single
// <Suspense> in AppRoutes below means each route's code only downloads the
// first time that route is actually visited.
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Wallets = lazy(() => import("./pages/Wallets"));
const Transactions = lazy(() => import("./pages/Transactions"));
const Alerts = lazy(() => import("./pages/Alerts"));
const Watchlist = lazy(() => import("./pages/Watchlist"));
const News = lazy(() => import("./pages/News"));
const Market = lazy(() => import("./pages/Market"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));
const More = lazy(() => import("./pages/More"));
const AssetChart = lazy(() => import("./pages/AssetChart"));
const Pricing = lazy(() => import("./pages/Pricing"));
const BillingSuccess = lazy(() => import("./pages/BillingSuccess"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const PublicPortfolio = lazy(() => import("./pages/PublicPortfolio"));
const ConnectedAccounts = lazy(() => import("./pages/ConnectedAccounts"));
const AssetDetail = lazy(() => import("./pages/AssetDetail"));
const Analytics = lazy(() => import("./pages/Analytics"));
const AdminFeedback = lazy(() => import("./pages/AdminFeedback"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));

// Theme-matching fallback — visible while a route's chunk downloads
// (typically instant on repeat visits, since the browser caches it after
// the first load) or during initial app boot. Logo + a thin indeterminate
// bar (loading-bar-sweep, App.css) instead of a plain spinner (5 jul 2026:
// "cada vez que a app faz loading... uma barrita de loading com o logo").
function RouteFallback() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-zinc-950">
      <img src={routeFallbackLogo} alt="Wallet76" className="w-14 h-14 object-contain opacity-90" />
      <div className="w-36 h-1 rounded-full bg-zinc-800 overflow-hidden">
        <div className="h-full w-1/3 bg-blue-500 rounded-full loading-bar-sweep" />
      </div>
    </div>
  );
}

function Protected({ children, currency, setCurrency, unlocked, setUnlocked }) {
  const { user } = useAuth();
  // Só mostra o "O que há de novo" depois de resolvido se é preciso mostrar
  // o assistente de configuração inicial primeiro — evita os dois popups a
  // competir no primeiro login de um utilizador novo (ver OnboardingWizard.jsx).
  const [onboardingResolved, setOnboardingResolved] = useState(false);

  // user: null = ainda a confirmar /auth/me, false = confirmado não
  // autenticado, objeto = autenticado (ver AuthContext.jsx).
  //
  // 6 jul 2026: isto costumava bloquear em `loading` (equivalente a
  // `user === null`) e só desenhar a página a seguir a /auth/me terminar
  // — o que também adiava o download do PRÓPRIO chunk JS da página (o
  // lazy() só é invocado quando isto renderiza <Dashboard/>), somando um
  // round-trip inteiro à abertura da app antes de sequer começar a pedir
  // /portfolio, /history, etc. Só bloqueamos agora quando `user` já está
  // confirmado a false — enquanto ainda está a confirmar (null),
  // desenhamos já a página; o seu próprio pedido de dados dispara em
  // paralelo com o /auth/me em vez de esperar por ele. Se afinal não
  // estiver autenticado, esse pedido vem 401 e o interceptor global (ver
  // lib/api.js) já passa `user` a false, redirecionando na render
  // seguinte — mesmo mecanismo que já tratava sessão expirada a meio do
  // uso. O único custo é um flash muito breve da moldura da app (sidebar/
  // header) para quem não está autenticado; nunca chega a mostrar dados
  // reais, esses só vêm com um cookie válido.
  if (user === false) {
    return <Navigate to="/login" replace />;
  }

  // LockScreen (8 jul 2026) — PIN e biometria (WebAuthn) já estavam
  // completamente construídos no backend (routes/security.py) e em
  // Settings.jsx (configurar PIN/biometria), e o próprio componente
  // LockScreen.jsx já existia pronto a pedir o desbloqueio — só nunca
  // tinha sido montado em lado nenhum, então nunca aparecia (utilizador:
  // "ainda faltam a segurança, 2 fatores, biométrica"). LockScreen já
  // trata sozinho o caso "sem bloqueio configurado" (chama onUnlock
  // automaticamente e não desenha nada), por isso é seguro montá-lo
  // sempre para qualquer utilizador autenticado — só aparece de facto para
  // quem ativou PIN ou biometria em Definições. Fica por cima do <Layout>
  // (não substitui), com o fundo desfocado atrás — o próprio design do
  // componente (backdrop-blur-xl) já pressupunha isto.
  return (
    <>
      {user && !unlocked && <LockScreen onUnlock={() => setUnlocked?.(true)} />}
      {user && unlocked && <OnboardingWizard onDone={() => setOnboardingResolved(true)} />}
      {user && unlocked && onboardingResolved && <WhatsNewModal />}
      <Layout currency={currency} setCurrency={setCurrency}>
        {children}
      </Layout>
    </>
  );
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  const [currency, setCurrency] = useState("USD");
  const [unlocked, setUnlocked] = useState(false);
  const wrap = (node) => (
    <Protected currency={currency} setCurrency={setCurrency} unlocked={unlocked} setUnlocked={setUnlocked}>{node}</Protected>
  );

  // Prefetch the Dashboard chunk as soon as the app boots, in parallel with
  // the /auth/me check (AuthContext) instead of after it — most sessions
  // land on /dashboard right after login or opening the installed PWA, and
  // its JS previously didn't even start downloading until Protected first
  // rendered it post-auth. A redundant import() here just resolves against
  // the same webpack chunk cache the browser already uses for the lazy()
  // below, so this can't create a second copy of the component.
  React.useEffect(() => {
    import("./pages/Dashboard");
  }, []);

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
        <Route path="/verify-email/:token" element={<VerifyEmail />} />
        {/* Na app nativa (Capacitor) não faz sentido mostrar a landing page
            de marketing — quem já instalou a app não precisa de ser
            "vendido" outra vez, só quer entrar. "/" salta logo para
            /login, que por sua vez (PublicOnly) já manda para /dashboard
            se a sessão ainda for válida. (8 jul 2026: "a app quando abre
            abre a landpage e deveria abrir logo o login")
            9 jul 2026: o mesmo pedido voltou a acontecer mesmo depois deste
            fix — a causa mais provável é o utilizador estar a abrir o
            ícone que o browser criou ao "Adicionar ao ecrã principal"
            (instalação da PWA a partir do site, não o .apk do GitHub
            Actions). Esse atalho corre no mesmo domínio mas
            Capacitor.isNativePlatform() é false aí (não há bridge nativa),
            por isso a landing continuava a aparecer. isStandalone cobre
            esse caso: fica true sempre que a página corre "instalada" (PWA
            em modo standalone OU o navigator.standalone do Safari/iOS),
            independentemente de ser o wrapper Capacitor ou a instalação
            via browser. */}
        <Route path="/" element={
          (Capacitor.isNativePlatform() || isStandaloneDisplay())
            ? <Navigate to="/login" replace />
            : <LandingPage />
        } />
        <Route path="/dashboard" element={wrap(<Dashboard currency={currency} />)} />
        <Route path="/transactions" element={wrap(<Transactions currency={currency} />)} />
        <Route path="/alerts" element={wrap(<Alerts currency={currency} />)} />
        <Route path="/wallets" element={wrap(<Wallets />)} />
        <Route path="/watchlist"    element={wrap(<Watchlist currency={currency} />)} />
        <Route path="/news" element={wrap(<News />)} />
        <Route path="/market"       element={wrap(<Market currency={currency} />)} />
        <Route path="/settings" element={wrap(<Settings />)} />
        <Route path="/profile" element={wrap(<Profile currency={currency} setCurrency={setCurrency} />)} />
        <Route path="/more" element={wrap(<More />)} />
        <Route path="/connected-accounts" element={wrap(<ConnectedAccounts />)} />
        <Route path="/analytics" element={wrap(<Analytics currency={currency} />)} />
        <Route path="/admin/feedback" element={wrap(<AdminFeedback />)} />
        <Route path="/asset/:assetType/:symbol" element={wrap(<AssetChart currency={currency} />)} />
        <Route path="/asset/:symbol" element={wrap(<AssetDetail currency={currency} />)} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/billing-success" element={<BillingSuccess />} />
        <Route path="/p/:slug" element={<PublicPortfolio />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
      </Routes>
    </Suspense>
  );
}

function CookieBannerWrapper() {
  const { lang } = useI18n();
  return <CookieBanner lang={lang} />;
}

function App() {
  return (
    <ErrorBoundary>
    <div className="App">
      <ThemeProvider>
        <I18nProvider>
          <PrivacyProvider>
            <AuthProvider>
              <PreferencesSync />
              <BrowserRouter>
                <BackendStatusBanner />
                <UpdateAvailableToast />
                <ApkUpdateBanner />
                <Toaster position="top-right" richColors />
                <AppRoutes />
                <CookieBannerWrapper />
              </BrowserRouter>
            </AuthProvider>
          </PrivacyProvider>
        </I18nProvider>
      </ThemeProvider>
    </div>
    </ErrorBoundary>
  );
}

export default App;

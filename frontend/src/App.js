import React, { useState } from "react";
import { useI18n } from "./context/I18nContext";

const IS_DEV = process.env.NODE_ENV === "development";

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
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { I18nProvider } from "./context/I18nContext";
import { PrivacyProvider } from "./context/PrivacyContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import Dashboard from "./pages/Dashboard";
import Wallets from "./pages/Wallets";
import Transactions from "./pages/Transactions";
import Alerts from "./pages/Alerts";
import Watchlist from "./pages/Watchlist";
import News from "./pages/News";
import Market from "./pages/Market";
import Settings from "./pages/Settings";
import AssetChart from "./pages/AssetChart";
import Layout from "./components/Layout";
import LockScreen from "./components/LockScreen";
import PreferencesSync from "./components/PreferencesSync";
import { Toaster } from "./components/ui/sonner";
import Pricing from "./pages/Pricing";
import BillingSuccess from "./pages/BillingSuccess";
import LandingPage from "./pages/LandingPage";
import PublicPortfolio from "./pages/PublicPortfolio";
import ConnectedAccounts from "./pages/ConnectedAccounts";
import AssetDetail from "./pages/AssetDetail";
import Analytics from "./pages/Analytics";
import AdminFeedback from "./pages/AdminFeedback";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import CookieBanner from "./components/CookieBanner";
import BackendStatusBanner from "./components/BackendStatusBanner";

function Protected({ children, currency, setCurrency }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout currency={currency} setCurrency={setCurrency}>
      {children}
    </Layout>
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

  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />
      <Route path="/verify-email/:token" element={<VerifyEmail />} />
      <Route path="/" element={<LandingPage />} />
      <Route path="/dashboard" element={wrap(<Dashboard currency={currency} />)} />
      <Route path="/transactions" element={wrap(<Transactions />)} />
      <Route path="/alerts" element={wrap(<Alerts />)} />
      <Route path="/wallets" element={wrap(<Wallets />)} />
      <Route path="/watchlist" element={wrap(<Watchlist />)} />
      <Route path="/news" element={wrap(<News />)} />
      <Route path="/market" element={wrap(<Market />)} />
      <Route path="/settings" element={wrap(<Settings />)} />
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

import React, { useState } from "react";
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

function Protected({ children, currency, setCurrency, unlocked, setUnlocked }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500 font-mono text-sm">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return (
    <>
      {!unlocked && <LockScreen onUnlock={() => setUnlocked(true)} />}
      <Layout currency={currency} setCurrency={setCurrency}>{children}</Layout>
    </>
  );
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
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
      <Route path="/" element={wrap(<Dashboard currency={currency} />)} />
      <Route path="/transactions" element={wrap(<Transactions />)} />
      <Route path="/alerts" element={wrap(<Alerts />)} />
      <Route path="/wallets" element={wrap(<Wallets />)} />
      <Route path="/watchlist" element={wrap(<Watchlist />)} />
      <Route path="/news" element={wrap(<News />)} />
      <Route path="/market" element={wrap(<Market />)} />
      <Route path="/settings" element={wrap(<Settings />)} />
      <Route path="/asset/:assetType/:symbol" element={wrap(<AssetChart currency={currency} />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/billing-success" element={<BillingSuccess />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <ThemeProvider>
        <I18nProvider>
          <PrivacyProvider>
            <AuthProvider>
              <PreferencesSync />
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
              <Toaster theme="dark" position="top-right" />
            </AuthProvider>
          </PrivacyProvider>
        </I18nProvider>
      </ThemeProvider>
    </div>
  );
}

export default App;


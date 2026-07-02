/**
 * OnboardingFlow — 3-step guided setup for new users.
 *
 * Step 1: Create first wallet (name)
 * Step 2: Add first asset (search → quantity + price)
 * Step 3: Success / go to dashboard
 *
 * Shows automatically when the user has 0 wallets AND
 * localStorage key "w76_onboarding_done" is not set.
 * Calling onComplete() sets that flag so it never shows again.
 */
import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../context/I18nContext";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Wallet as WalletIcon,
  TrendingUp,
  CheckCircle,
  Search,
  ArrowRight,
  ChevronRight,
  Sparkles,
} from "lucide-react";

// ── Step indicator ────────────────────────────────────────────────────────────
function Steps({ current, total }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <React.Fragment key={i}>
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
              i < current
                ? "bg-emerald-500 text-white"
                : i === current
                ? "bg-blue-500 text-white ring-4 ring-blue-500/20"
                : "bg-zinc-800 text-zinc-500"
            }`}
          >
            {i < current ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div
              className={`h-px flex-1 transition-all duration-500 ${
                i < current ? "bg-emerald-500" : "bg-zinc-800"
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Step 1: Create wallet ─────────────────────────────────────────────────────
function Step1({ onNext }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const PRESETS = ["My Portfolio", "Stocks", "Crypto", "Long-term"];

  const submit = async (walletName) => {
    const n = walletName || name.trim();
    if (!n) return;
    setLoading(true);
    try {
      const { data } = await api.post("/wallets", { name: n, type: "broker", currency: "USD" });
      onNext({ wallet: data });
    } catch {
      toast.error("Could not create wallet. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
          <WalletIcon className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <div className="text-lg font-semibold text-zinc-100">{t("onboarding.s1_title")}</div>
          <div className="text-xs text-zinc-500">{t("onboarding.s1_sub")}</div>
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-xs font-mono uppercase tracking-widest text-zinc-500">
          {t("onboarding.wallet_name")}
        </Label>
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={t("onboarding.wallet_placeholder")}
          className="bg-zinc-900/60 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 text-base h-11"
        />
        <div className="flex flex-wrap gap-2 pt-1">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => submit(p)}
              className="px-3 py-1.5 rounded-lg border border-zinc-800 text-xs text-zinc-400 hover:border-blue-500/50 hover:text-blue-300 hover:bg-blue-500/5 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <Button
        onClick={() => submit()}
        disabled={!name.trim() || loading}
        className="w-full h-11 bg-blue-500 hover:bg-blue-400 text-white font-medium"
      >
        {loading ? t("onboarding.creating") : t("onboarding.s1_cta")}
        <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  );
}

// ── Step 2: Add first asset ───────────────────────────────────────────────────
function Step2({ wallet, onNext, onSkip }) {
  const { t } = useI18n();
  const [assetType, setAssetType] = useState("crypto");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(null);
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [loading, setLoading] = useState(false);

  // Debounced search
  useEffect(() => {
    if (!search || search.length < 1) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const path = assetType === "crypto" ? "/search/crypto" : "/search/stock";
        const { data } = await api.get(path, { params: { q: search } });
        setResults(data || []);
      } catch { setResults([]); }
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [search, assetType]);

  const pick = (r) => {
    setPicked(r);
    setSearch(`${r.symbol} — ${r.name || ""}`);
    setResults([]);
  };

  const submit = async () => {
    if (!picked || !qty || !price) return;
    setLoading(true);
    try {
      await api.post("/transactions", {
        wallet_id: wallet.id,
        asset_type: assetType,
        symbol: picked.symbol,
        coingecko_id: assetType === "crypto" ? picked.id : undefined,
        name: picked.name,
        type: "BUY",
        date: new Date().toISOString().slice(0, 10),
        quantity: parseFloat(qty),
        price: parseFloat(price),
        fee: 0,
        notes: "First asset — added during onboarding",
      });
      onNext({ asset: picked });
    } catch {
      toast.error("Could not add asset. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = picked && qty && price && parseFloat(qty) > 0 && parseFloat(price) > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <div className="text-lg font-semibold text-zinc-100">{t("onboarding.s2_title")}</div>
          <div className="text-xs text-zinc-500">
            {t("onboarding.s2_sub")} <span className="text-blue-400">{wallet.name}</span>
          </div>
        </div>
      </div>

      {/* Type toggle */}
      <div className="flex gap-1 p-1 bg-zinc-900 rounded-lg border border-zinc-800 w-fit">
        {["crypto", "stock"].map((type) => (
          <button
            key={type}
            onClick={() => { setAssetType(type); setPicked(null); setSearch(""); setResults([]); }}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              assetType === type
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {type === "crypto" ? "Crypto" : "Stock / ETF"}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPicked(null); }}
          placeholder={assetType === "crypto" ? "Bitcoin, ETH, SOL…" : "AAPL, MSFT, SPY…"}
          className="pl-9 bg-zinc-900/60 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-11"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-blue-500/60 border-t-transparent rounded-full animate-spin" />
        )}
        {results.length > 0 && (
          <div className="absolute z-10 top-full mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
            {results.slice(0, 6).map((r) => (
              <button
                key={r.id || r.symbol}
                onClick={() => pick(r)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800/60 transition-colors text-left"
              >
                <span className="font-mono text-sm text-zinc-100 w-16 shrink-0">{r.symbol}</span>
                <span className="text-xs text-zinc-400 truncate">{r.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {picked && (
        <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-lg border border-emerald-500/20">
          <CheckCircle className="w-3.5 h-3.5 shrink-0" />
          {picked.symbol} · {picked.name}
        </div>
      )}

      {/* Qty + Price */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-mono uppercase tracking-widest text-zinc-500">{t("onboarding.quantity")}</Label>
          <Input
            type="number"
            step="any"
            min="0"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0.00"
            className="mt-1.5 bg-zinc-900/60 border-zinc-700 text-zinc-100 h-11 font-mono"
          />
        </div>
        <div>
          <Label className="text-xs font-mono uppercase tracking-widest text-zinc-500">{t("onboarding.price_paid")} (USD)</Label>
          <Input
            type="number"
            step="any"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            className="mt-1.5 bg-zinc-900/60 border-zinc-700 text-zinc-100 h-11 font-mono"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={submit}
          disabled={!canSubmit || loading}
          className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
        >
          {loading ? t("onboarding.adding") : t("onboarding.s2_cta")}
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
        <Button
          variant="outline"
          onClick={onSkip}
          className="border-zinc-800 text-zinc-500 hover:text-zinc-300 px-4"
        >
          {t("onboarding.skip")}
        </Button>
      </div>
    </div>
  );
}

// ── Step 3: Success ───────────────────────────────────────────────────────────
function Step3({ wallet, asset, onComplete }) {
  const { t } = useI18n();

  return (
    <div className="text-center space-y-6 py-2">
      {/* Animated icon */}
      <div className="flex justify-center">
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
          <div className="relative w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <Sparkles className="w-9 h-9 text-emerald-400" />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-zinc-100">{t("onboarding.s3_title")}</h2>
        <p className="text-sm text-zinc-400 leading-relaxed max-w-xs mx-auto">
          {t("onboarding.s3_sub")}
        </p>
      </div>

      {/* Summary */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-left space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-500">{t("onboarding.wallet_created")}</span>
          <span className="text-zinc-200 font-medium">{wallet?.name || "—"}</span>
        </div>
        {asset && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">{t("onboarding.asset_added")}</span>
            <span className="text-emerald-400 font-mono font-medium">{asset.symbol}</span>
          </div>
        )}
      </div>

      <Button
        onClick={onComplete}
        className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-base"
      >
        {t("onboarding.s3_cta")}
        <ArrowRight className="w-5 h-5 ml-2" />
      </Button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
const STEP_LABELS = ["onboarding.step_wallet", "onboarding.step_asset", "onboarding.step_done"];

export default function OnboardingFlow({ onComplete }) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [wallet, setWallet] = useState(null);
  const [asset, setAsset]   = useState(null);

  // Trap scroll behind the overlay
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const done = () => {
    try { localStorage.setItem("w76_onboarding_done", "1"); } catch {}
    onComplete?.();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-zinc-900 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-widest text-zinc-500">
              {t("onboarding.header")}
            </span>
            <span className="text-xs text-zinc-600">
              {step + 1} / {STEP_LABELS.length}
            </span>
          </div>
          <Steps current={step} total={STEP_LABELS.length} />
          <div className="flex gap-4 text-xs text-zinc-600">
            {STEP_LABELS.map((k, i) => (
              <span key={k} className={i === step ? "text-zinc-300 font-medium" : ""}>{t(k)}</span>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {step === 0 && (
            <Step1
              onNext={({ wallet: w }) => { setWallet(w); setStep(1); }}
            />
          )}
          {step === 1 && (
            <Step2
              wallet={wallet}
              onNext={({ asset: a }) => { setAsset(a); setStep(2); }}
              onSkip={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <Step3
              wallet={wallet}
              asset={asset}
              onComplete={done}
            />
          )}
        </div>
      </div>
    </div>
  );
}

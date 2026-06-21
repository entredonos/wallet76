import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Plus, Trash2, Wallet as WalletIcon, Briefcase, Coins, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "../context/I18nContext";
import { useNavigate } from "react-router-dom";

const TYPE_PRESETS = [
  { value: "broker", label: "Broker", Icon: Briefcase },
  { value: "exchange", label: "Exchange", Icon: Coins },
  { value: "wallet", label: "Wallet", Icon: WalletIcon },
];

const CURRENCIES = ["USD", "EUR", "CHF"];
const CUR_SYMBOL = { USD: "$", EUR: "€", CHF: "CHF" };

export default function Wallets() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [wallets, setWallets] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("broker");
  const [currency, setCurrency] = useState("USD");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [w, h] = await Promise.all([api.get("/wallets"), api.get("/holdings")]);
      setWallets(w.data || []);
      setHoldings(h.data || []);
    } catch (e) {
      toast.error("Failed to load wallets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      await api.post("/wallets", { name: name.trim(), type, currency });
      toast.success("Wallet created");
      setOpen(false); setName(""); setType("broker"); setCurrency("USD");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  const [deleteTarget, setDeleteTarget] = useState(null);
  const remove = (w) => setDeleteTarget(w);
  const confirmRemove = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/wallets/${deleteTarget.id}`);
      toast.success("Wallet deleted");
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error("Failed to delete");
    }
  };

  return (
    <div className="space-y-8 fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("wallets.kicker")}</div>
          <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mt-2">{t("wallets.title")}</h1>
          <p className="text-zinc-500 mt-2">{t("wallets.subtitle")}</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-zinc-100 text-zinc-950 hover:bg-white" data-testid="add-wallet-btn">
              <Plus className="w-4 h-4 mr-1" /> {t("wallets.new")}
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display font-light text-2xl">{t("wallets.new")}</DialogTitle>
              <DialogDescription className="text-zinc-500 text-sm">
                {t("wallets.dialog_desc")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("common.name")}</Label>
                <Input
                  value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={t("wallets.name_placeholder")}
                  className="mt-2 bg-zinc-900/50 border-zinc-800"
                  data-testid="wallet-name-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("wallets.type")}</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="wallet-type-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      {TYPE_PRESETS.map((tp) => (
                        <SelectItem key={tp.value} value={tp.value}>{tp.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("wallets.currency")}</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="wallet-currency-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{CUR_SYMBOL[c]} · {c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={create} disabled={saving} className="w-full bg-zinc-100 text-zinc-950 hover:bg-white" data-testid="wallet-submit">
                {saving ? t("wallets.creating") : t("wallets.create")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-zinc-500 font-mono text-sm">{t("common.loading")}</div>
      ) : wallets.length === 0 ? (
        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-lg p-12 text-center" data-testid="no-wallets">
          <WalletIcon className="w-10 h-10 text-zinc-700 mx-auto mb-4" />
          <div className="text-zinc-300 font-display text-xl">{t("wallets.no_wallets")}</div>
          <div className="text-zinc-500 mt-2 mb-6 text-sm">
            {t("wallets.no_wallets_hint")}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {wallets.map((w) => {
            const wAssets = holdings.filter((a) => a.wallet_id === w.id && a.quantity > 0);
            const Preset = TYPE_PRESETS.find((t) => t.value === w.type) || TYPE_PRESETS[0];
            const Icon = Preset.Icon;
            const cur = w.currency || "USD";
            return (
              <div key={w.id} className="bg-zinc-900/40 border border-zinc-800/50 hover:border-zinc-700/60 transition-colors rounded-lg p-6" data-testid={`wallet-card-${w.id}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-md border border-zinc-800 bg-zinc-900 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-zinc-300" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => navigate(`/?wallet=${w.id}`)}
                      className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.15em] px-2.5 py-1 border border-blue-500/30 text-blue-300 hover:text-blue-200 hover:bg-blue-500/15 rounded-md transition-colors"
                      data-testid={`enter-wallet-${w.id}`}
                      title="Open this wallet"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span>{t("wallets.enter")}</span>
                    </button>
                    <button
                      onClick={() => remove(w)}
                      className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.15em] px-2.5 py-1 border border-rose-500/30 text-rose-300 hover:text-rose-200 hover:bg-rose-500/15 rounded-md transition-colors"
                      data-testid={`delete-wallet-${w.id}`}
                      title="Delete wallet and all its transactions"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t("common.delete")}</span>
                    </button>
                  </div>
                </div>
                <div className="font-display text-xl text-zinc-100">{w.name}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{Preset.label}</span>
                  <span className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400 border border-zinc-800 rounded px-1.5 py-0.5">{CUR_SYMBOL[cur] || cur} {cur}</span>
                </div>
                <div className="mt-6 pt-4 border-t border-zinc-800/50 flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-500">{t("wallets.assets_count")}</span>
                  <span className="font-mono text-zinc-200">{wAssets.length}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete wallet confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-light text-2xl">{t("wallets.delete_title")}</DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              {deleteTarget && t("wallets.delete_desc", { name: deleteTarget.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="bg-zinc-900/50 border-zinc-800 text-zinc-300" data-testid="delete-wallet-cancel">{t("common.cancel")}</Button>
            <Button onClick={confirmRemove} className="bg-rose-500 hover:bg-rose-400 text-zinc-950" data-testid="delete-wallet-confirm">
              <Trash2 className="w-4 h-4 mr-1.5"/> {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

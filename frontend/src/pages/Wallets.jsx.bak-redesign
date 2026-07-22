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
import { Plus, Trash2, Wallet as WalletIcon, Briefcase, Coins, ArrowRight, Pencil, Lock } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "../context/I18nContext";
import { useNavigate } from "react-router-dom";
import { SkeletonCardGrid } from "../components/SkeletonRow";
import UpgradeDialog from "../components/UpgradeDialog";
import { usePlan } from "../hooks/usePlan";
import { WALLET_COLOR_KEYS, WALLET_BORDER_CLASS, WALLET_TEXT_CLASS } from "../lib/walletColors";
import { ALLOCATION_CLASSES, ALLOCATION_CLASS_LABEL_KEY, ALLOCATION_CLASS_COLOR, aggregateByClass } from "../lib/allocation";
import { requestSidebarRefresh } from "../lib/sidebarRefresh";

const TYPE_PRESETS = [
  { value: "broker", label: "Broker", Icon: Briefcase },
  { value: "exchange", label: "Exchange", Icon: Coins },
  { value: "wallet", label: "Wallet", Icon: WalletIcon },
];

const CURRENCIES = ["USD", "EUR", "CHF", "BRL"];
const CUR_SYMBOL = { USD: "$", EUR: "€", CHF: "CHF", BRL: "R$" };

export default function Wallets() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { isPro } = usePlan();
  const [wallets, setWallets] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [allocOverrides, setAllocOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("broker");
  const [currency, setCurrency] = useState("USD");
  const [saving, setSaving] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // "UPGRADE v1.0" — /allocation also fetched here so each card's
      // mini-donut (task #76) respects the same manual per-symbol class
      // overrides as the Dashboard's target-allocation widget. This call is
      // best-effort: a failure shouldn't block wallets/holdings from
      // loading, the donut just falls back to raw asset_type.
      // 6 jul 2026: trocado de /holdings para /portfolio — /holdings devolve
      // só custo/quantidade (sem preço ao vivo), o que deixava o mini-donut
      // sempre vazio (aggregateByClass precisa de value_usd) e impossibilitava
      // mostrar o P&L% por carteira pedido pelo utilizador. /portfolio já
      // enriquece cada holding com value_usd/cost_usd/pnl_pct (mesma fonte
      // usada no Dashboard e no AssetCard).
      const [w, p, alloc] = await Promise.allSettled([
        api.get("/wallets"), api.get("/portfolio"), api.get("/allocation"),
      ]);
      if (w.status === "fulfilled") setWallets(w.value.data || []);
      if (p.status === "fulfilled") setHoldings(p.value.data?.assets || []);
      if (alloc.status === "fulfilled") setAllocOverrides(alloc.value.data?.overrides || {});
      if (w.status === "rejected" || p.status === "rejected") {
        toast.error(t("wallets.toast_load_failed"));
      }
    } catch (e) {
      toast.error(t("wallets.toast_load_failed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) { toast.error(t("wallets.toast_name_required")); return; }
    setSaving(true);
    try {
      await api.post("/wallets", { name: name.trim(), type, currency });
      toast.success(t("wallets.toast_created"));
      setOpen(false); setName(""); setType("broker"); setCurrency("USD");
      load();
      requestSidebarRefresh();
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 402 && detail?.reason === "wallet_limit") {
        setOpen(false);
        setShowUpgrade(true);
      } else {
        toast.error(formatApiErrorDetail(detail) || t("wallets.toast_create_failed"));
      }
    } finally {
      setSaving(false);
    }
  };

  const [deleteTarget, setDeleteTarget] = useState(null);
  const remove = (w) => setDeleteTarget(w);

  // Edit / rename
  const [editTarget, setEditTarget] = useState(null); // wallet being edited
  const [editName, setEditName] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const startEdit = (w) => { setEditTarget(w); setEditName(w.name); };
  const confirmEdit = async () => {
    if (!editTarget || !editName.trim()) return;
    setEditSaving(true);
    try {
      await api.patch(`/wallets/${editTarget.id}`, { name: editName.trim() });
      toast.success(t("wallets.toast_renamed"));
      setEditTarget(null);
      load();
      requestSidebarRefresh();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || t("wallets.toast_rename_failed"));
    } finally {
      setEditSaving(false);
    }
  };
  const confirmRemove = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/wallets/${deleteTarget.id}`);
      toast.success(t("wallets.toast_deleted"));
      setDeleteTarget(null);
      load();
      requestSidebarRefresh();
    } catch (e) {
      toast.error(t("wallets.toast_delete_failed"));
    }
  };

  return (
    <div className="space-y-8 fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("wallets.kicker")}</div>
          <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mt-2">{t("wallets.title")}</h1>
          <p className="text-zinc-400 mt-2">{t("wallets.subtitle")}</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              className="bg-zinc-100 text-zinc-950 hover:bg-white"
              data-testid="add-wallet-btn"
              onClick={!isPro && wallets.length >= 1 ? (e) => { e.preventDefault(); setShowUpgrade(true); } : undefined}
            >
              {!isPro && wallets.length >= 1 ? <Lock className="w-4 h-4 mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              {t("wallets.new")}
              {!isPro && <span className="ml-1.5 text-xs font-mono text-zinc-400">(1/1)</span>}
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display font-light text-2xl">{t("wallets.new")}</DialogTitle>
              <DialogDescription className="text-zinc-400 text-sm">
                {t("wallets.dialog_desc")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("common.name")}</Label>
                <Input
                  value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={t("wallets.name_placeholder")}
                  className="mt-2 bg-zinc-900/50 border-zinc-800"
                  data-testid="wallet-name-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("wallets.type")}</Label>
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
                  <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("wallets.currency")}</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="wallet-currency-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{CUR_SYMBOL[c]} . {c}</SelectItem>
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
        <SkeletonCardGrid count={3} />
      ) : wallets.length === 0 ? (
        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-lg p-12 text-center" data-testid="no-wallets">
          <WalletIcon className="w-10 h-10 text-zinc-700 mx-auto mb-4" />
          <div className="text-zinc-300 font-display text-xl">{t("wallets.no_wallets")}</div>
          <div className="text-zinc-400 mt-2 mb-6 text-sm">
            {t("wallets.no_wallets_hint")}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {wallets.map((w, wi) => {
            const wAssets = holdings.filter((a) => a.wallet_id === w.id && a.quantity > 0);
            const Preset = TYPE_PRESETS.find((t) => t.value === w.type) || TYPE_PRESETS[0];
            const Icon = Preset.Icon;
            const cur = w.currency || "USD";
            const walletColor = WALLET_COLOR_KEYS[wi % WALLET_COLOR_KEYS.length];
            // P&L% desta carteira — mesma lógica do walletBreakdown em
            // Dashboard.jsx (soma de value_usd/cost_usd dos holdings).
            const wValue = wAssets.reduce((s, a) => s + Number(a.value_usd || 0), 0);
            const wCost = wAssets.reduce((s, a) => s + Number(a.cost_usd || 0), 0);
            const wPnlPct = wCost > 0 ? ((wValue - wCost) / wCost) * 100 : 0;
            const wHasPnl = wAssets.length > 0 && wCost > 0;
            return (
              <div key={w.id} className="bg-zinc-900/40 border border-zinc-800/50 hover:border-zinc-700/60 transition-colors rounded-lg p-6" data-testid={`wallet-card-${w.id}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-10 h-10 rounded-md border-2 ${WALLET_BORDER_CLASS[walletColor]} bg-zinc-900 flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${WALLET_TEXT_CLASS[walletColor]}`} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => navigate(`/dashboard?wallet=${w.id}`)}
                      className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.15em] px-2.5 py-1 border border-blue-500/30 text-blue-300 hover:text-blue-200 hover:bg-blue-500/15 rounded-md transition-colors"
                      data-testid={`enter-wallet-${w.id}`}
                      title={t("wallets.tooltip_open")}
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span>{t("wallets.enter")}</span>
                    </button>
                    <button
                      onClick={() => startEdit(w)}
                      className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.15em] px-2.5 py-1 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
                      title={t("wallets.tooltip_rename")}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => remove(w)}
                      className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.15em] px-2.5 py-1 border border-rose-500/30 text-rose-300 hover:text-rose-200 hover:bg-rose-500/15 rounded-md transition-colors"
                      data-testid={`delete-wallet-${w.id}`}
                      title={t("wallets.tooltip_delete")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="font-display text-xl text-zinc-100">{w.name}</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{Preset.label}</span>
                  <span className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400 border border-zinc-800 rounded px-1.5 py-0.5">{CUR_SYMBOL[cur] || cur} {cur}</span>
                  {wHasPnl && (
                    <span
                      className={`text-xs font-mono px-1.5 py-0.5 rounded border ${wPnlPct >= 0 ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-rose-400 border-rose-500/30 bg-rose-500/10"}`}
                      data-testid={`wallet-pnl-${w.id}`}
                    >
                      {wPnlPct >= 0 ? "+" : ""}{wPnlPct.toFixed(2)}%
                    </span>
                  )}
                </div>
                <div className="mt-6 pt-4 border-t border-zinc-800/50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* "UPGRADE v1.0" (task #76) — informational only, no
                        target comparison here (target is always global, see
                        Dashboard's Asset Allocation widget). */}
                    <MiniAllocationDonut holdings={wAssets} overrides={allocOverrides} t={t} />
                    <span className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-400 truncate">{t("wallets.assets_count")}</span>
                  </div>
                  <span className="font-mono text-zinc-200 shrink-0">{wAssets.length}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rename wallet dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display font-light text-2xl">{t("wallets.rename_title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmEdit()}
              placeholder={t("wallets.name_placeholder")}
              className="bg-zinc-900/50 border-zinc-800"
              autoFocus
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditTarget(null)} className="flex-1 bg-zinc-900/50 border-zinc-800 text-zinc-300">
                {t("common.cancel")}
              </Button>
              <Button onClick={confirmEdit} disabled={editSaving || !editName.trim()} className="flex-1 bg-zinc-100 text-zinc-950 hover:bg-white">
                {editSaving ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

      <UpgradeDialog open={showUpgrade} onOpenChange={setShowUpgrade} reason="wallet_limit" />
    </div>
  );
}

// "UPGRADE v1.0" (task #76) — small per-wallet class-distribution donut.
// Deliberately informational only: no target comparison lives here (the
// allocation target is always global — see Dashboard's Asset Allocation
// widget), this is just "what does THIS wallet currently hold". Built with
// a plain CSS conic-gradient instead of a Recharts <PieChart> since this
// renders once per wallet card (could be many) and a conic-gradient is far
// cheaper than N mounted chart instances.
function MiniAllocationDonut({ holdings, overrides, t, size = 40 }) {
  const totals = aggregateByClass(holdings, overrides);
  const totalValue = Object.values(totals).reduce((s, v) => s + v, 0);
  if (!totalValue) return null;

  // Fixed class order (not by value) so the same class always occupies the
  // same relative slice position across every wallet's donut.
  const order = [...ALLOCATION_CLASSES, ...Object.keys(totals).filter((c) => !ALLOCATION_CLASSES.includes(c))];

  let cum = 0;
  const stops = [];
  const legend = [];
  order.forEach((cls) => {
    const v = totals[cls];
    if (!v) return;
    const pct = (v / totalValue) * 100;
    const color = ALLOCATION_CLASS_COLOR[cls] || ALLOCATION_CLASS_COLOR.other;
    stops.push(`${color} ${cum}% ${cum + pct}%`);
    legend.push(`${t(ALLOCATION_CLASS_LABEL_KEY[cls] || "common.other")} ${pct.toFixed(0)}%`);
    cum += pct;
  });

  return (
    <div
      className="relative shrink-0 rounded-full"
      style={{ width: size, height: size, background: `conic-gradient(${stops.join(", ")})` }}
      title={`${t("alloc.wallet_distribution")}: ${legend.join(" · ")}`}
      data-testid="wallet-mini-donut"
    >
      <div className="absolute rounded-full bg-zinc-900" style={{ inset: Math.round(size * 0.3) }} />
    </div>
  );
}

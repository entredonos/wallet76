import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Plus, Trash2, ArrowDownLeft, ArrowUpRight, Upload, Pencil } from "lucide-react";
import { toast } from "sonner";
import AssetIcon from "../components/AssetIcon";
import { useI18n } from "../context/I18nContext";
import { SkeletonTableRow } from "../components/SkeletonRow";
import ImportCsvDialog from "../components/ImportCsvDialog";
import { useNavigate, useSearchParams } from "react-router-dom";

const CURRENCY_SYMBOLS = { USD: "$", EUR: "€", CHF: "CHF ", BRL: "R$" };

export default function Transactions() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const prefillSymbol = searchParams.get("prefill");
  const prefillType   = searchParams.get("type");
  const prefillPrice  = searchParams.get("price");
  // ?wallet=ID (8 jul 2026) — chegar aqui a partir de um atalho contextual
  // "Transações desta carteira" (Dashboard.jsx, carteira selecionada) já
  // abre com o filtro certo aplicado, em vez de aterrar sempre em "Todas as
  // carteiras" e obrigar a escolher outra vez algo que o utilizador já
  // tinha escolhido no ecrã anterior. Mesmo nome de parâmetro que a
  // sidebar já usa para "/dashboard?wallet=ID" (ver Layout.jsx).
  const walletParam = searchParams.get("wallet");

  const [txns, setTxns] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(!!prefillSymbol);
  const [filterWallet, setFilterWallet] = useState(walletParam || "all");
  const [filterType, setFilterType] = useState("all");
  const [editTxn, setEditTxn] = useState(null);

  // Auto-open when navigated with ?prefill=
  useEffect(() => {
    if (prefillSymbol) setOpen(true);
  }, [prefillSymbol]);

  const load = async () => {
    setLoading(true);
    try {
      const [tRes, wRes] = await Promise.all([
        api.get("/transactions"),
        api.get("/wallets"),
      ]);
      setTxns(tRes.data || []);
      setWallets(wRes.data || []);
    } catch (e) {
      toast.error(t("tx.toast_load_failed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return txns.filter((t) => {
      if (filterWallet !== "all" && t.wallet_id !== filterWallet) return false;
      if (filterType !== "all" && t.type !== filterType) return false;
      return true;
    });
  }, [txns, filterType, filterWallet]);

  const walletName = (id) => wallets.find((w) => w.id === id)?.name || "—";

  const removeTxn = async (id) => {
    try {
      await api.delete(`/transactions/${id}`);
      toast.success(t("tx.toast_deleted"));
      load();
    } catch {
      toast.error(t("tx.toast_delete_failed"));
    }
  };

  return (
    <div className="space-y-8 fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("tx.kicker")}</div>
          <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mt-2">{t("tx.title")}</h1>
          <p className="text-zinc-400 mt-2">{t("tx.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportCsvDialog
            wallets={wallets}
            onSaved={load}
            trigger={
              <Button variant="outline" className="bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100" data-testid="import-csv-btn">
                <Upload className="w-4 h-4 mr-2" /> {t("tx.import")}
              </Button>
            }
          />
          <NewTransactionDialog
            open={open}
            setOpen={(v) => { setOpen(v); if (!v && prefillSymbol) setSearchParams({}); }}
            wallets={wallets}
            onSaved={load}
            defaultSymbol={prefillSymbol}
            defaultAssetType={prefillType}
            defaultPrice={prefillPrice}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filterType} onValueChange={setFilterType}>
          <TabsList className="bg-zinc-900/50 border border-zinc-800">
            <TabsTrigger value="all" className="data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950" data-testid="tx-filter-all">{t("tx.all")}</TabsTrigger>
            <TabsTrigger value="BUY" className="data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950" data-testid="tx-filter-buy">{t("tx.buys")}</TabsTrigger>
            <TabsTrigger value="SELL" className="data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950" data-testid="tx-filter-sell">{t("tx.sells")}</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={filterWallet} onValueChange={setFilterWallet}>
          <SelectTrigger className="w-[200px] bg-zinc-900/50 border-zinc-800" data-testid="tx-filter-wallet">
            <SelectValue placeholder={t("tx.all_wallets")} />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800">
            <SelectItem value="all">{t("tx.all_wallets")}</SelectItem>
            {wallets.map((w) => (
              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-lg overflow-hidden">
        {/* Mobile — stacked cards. The desktop table's 9 columns only ever
            produced permanent horizontal scroll on a phone. */}
        <div className="md:hidden divide-y divide-zinc-800/30">
          {loading && [0, 1, 2].map((i) => (
            <div key={i} className="p-4 space-y-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 rounded-full bg-zinc-800 shrink-0" />
                <div className="h-3 bg-zinc-800 rounded w-24" />
              </div>
              <div className="h-3 bg-zinc-800 rounded w-2/3" />
            </div>
          ))}
          {!loading && filtered.length === 0 && (
            <div className="px-6 py-12 text-center text-zinc-600 font-mono text-sm" data-testid="no-transactions-mobile">
              {t("tx.no_tx")}. {t("tx.no_tx_hint")}
            </div>
          )}
          {filtered.map((txn) => (
            <TxCard
              key={txn.id}
              txn={txn}
              walletName={walletName(txn.wallet_id)}
              onEdit={() => setEditTxn(txn)}
              onDelete={() => removeTxn(txn.id)}
            />
          ))}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full" data-testid="transactions-table">
            <thead>
              <tr className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-400 border-b border-zinc-800/30">
                <th className="text-left px-6 py-3 font-normal">{t("tx.date")}</th>
                <th className="text-left px-4 py-3 font-normal">{t("tx.type")}</th>
                <th className="text-left px-4 py-3 font-normal">{t("dash.assets")}</th>
                <th className="text-left px-4 py-3 font-normal">{t("common.wallet")}</th>
                <th className="text-right px-4 py-3 font-normal">{t("tx.quantity")}</th>
                <th className="text-right px-4 py-3 font-normal">{t("common.price")}</th>
                <th className="text-right px-4 py-3 font-normal">{t("tx.fee")}</th>
                <th className="text-right px-4 py-3 font-normal">{t("tx.total")}</th>
                <th className="text-right px-6 py-3 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {loading && [0,1,2,3,4,5].map(i => <SkeletonTableRow key={i} cols={9} />)}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-6 py-12 text-center text-zinc-600 font-mono text-sm" data-testid="no-transactions">
                  {t("tx.no_tx")}. {t("tx.no_tx_hint")}
                </td></tr>
              )}
              {filtered.map((txn) => {
                const sym = CURRENCY_SYMBOLS[txn.currency] || "";
                const total = txn.quantity * txn.price + (txn.type === "BUY" ? (txn.fee || 0) : -(txn.fee || 0));
                const isBuy = txn.type === "BUY";
                return (
                  <tr key={txn.id} className="border-b border-zinc-800/30 hover:bg-zinc-900/40 transition-colors" data-testid={`tx-row-${txn.id}`}>
                    <td className="px-6 py-4 font-mono text-zinc-300 text-sm">{txn.date}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider px-2 py-1 rounded border ${
                        isBuy ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-rose-400 border-rose-500/30 bg-rose-500/10"
                      }`}>
                        {isBuy ? <ArrowDownLeft className="w-3 h-3"/> : <ArrowUpRight className="w-3 h-3"/>}
                        {isBuy ? t("tx.buy") : t("tx.sell")}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <AssetIcon asset={txn} size={24}/>
                        <div>
                          <div className="font-mono text-zinc-100">{txn.symbol}</div>
                          <div className="text-xs text-zinc-400">{txn.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-400">{walletName(txn.wallet_id)}</td>
                    <td className="px-4 py-4 text-right font-mono text-zinc-200">{Number(txn.quantity).toLocaleString("en-US", { maximumFractionDigits: 8 })}</td>
                    <td className="px-4 py-4 text-right font-mono text-zinc-200">{sym}{Number(txn.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</td>
                    <td className="px-4 py-4 text-right font-mono text-zinc-400">{sym}{Number(txn.fee || 0).toFixed(2)}</td>
                    <td className="px-4 py-4 text-right font-mono text-zinc-100">{sym}{total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-3">
                        <button onClick={() => setEditTxn(txn)} className="text-zinc-600 hover:text-blue-400 transition-colors" data-testid={`tx-edit-${txn.id}`} aria-label={t("common.edit")}>
                          <Pencil className="w-4 h-4"/>
                        </button>
                        <button onClick={() => removeTxn(txn.id)} className="text-zinc-600 hover:text-rose-400 transition-colors" data-testid={`tx-delete-${txn.id}`} aria-label={t("common.delete")}>
                          <Trash2 className="w-4 h-4"/>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <EditTransactionDialog txn={editTxn} wallets={wallets} onClose={() => setEditTxn(null)} onSaved={load} />
    </div>
  );
}

// One transaction, stacked as a card — the mobile (< md) counterpart to a
// row in the desktop <table>. Same fields, just laid out vertically instead
// of 9 columns that only ever produced horizontal scroll on a phone.
function TxCard({ txn, walletName, onEdit, onDelete }) {
  const { t } = useI18n();
  const sym = CURRENCY_SYMBOLS[txn.currency] || "";
  const total = txn.quantity * txn.price + (txn.type === "BUY" ? (txn.fee || 0) : -(txn.fee || 0));
  const isBuy = txn.type === "BUY";
  return (
    <div className="p-4 space-y-3" data-testid={`tx-card-${txn.id}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <AssetIcon asset={txn} size={24}/>
          <div className="min-w-0">
            <div className="font-mono text-zinc-100 truncate">{txn.symbol}</div>
            <div className="text-xs text-zinc-400 truncate">{txn.date} · {walletName}</div>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider px-2 py-1 rounded border shrink-0 ${
          isBuy ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-rose-400 border-rose-500/30 bg-rose-500/10"
        }`}>
          {isBuy ? <ArrowDownLeft className="w-3 h-3"/> : <ArrowUpRight className="w-3 h-3"/>}
          {isBuy ? t("tx.buy") : t("tx.sell")}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 font-mono text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-400">{t("tx.quantity")}</div>
          <div className="text-zinc-200">{Number(txn.quantity).toLocaleString("en-US", { maximumFractionDigits: 8 })}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-400">{t("common.price")}</div>
          <div className="text-zinc-200">{sym}{Number(txn.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-400">{t("tx.total")}</div>
          <div className="text-zinc-100">{sym}{total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button onClick={onEdit} className="text-zinc-600 hover:text-blue-400 transition-colors" data-testid={`tx-edit-card-${txn.id}`} aria-label={t("common.edit")}>
          <Pencil className="w-4 h-4"/>
        </button>
        <button onClick={onDelete} className="text-zinc-600 hover:text-rose-400 transition-colors" data-testid={`tx-delete-card-${txn.id}`} aria-label={t("common.delete")}>
          <Trash2 className="w-4 h-4"/>
        </button>
      </div>
    </div>
  );
}

function EditTransactionDialog({ txn, wallets, onClose, onSaved }) {
  const { t } = useI18n();
  const [date, setDate] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (txn) {
      setDate(txn.date || "");
      setQuantity(String(txn.quantity ?? ""));
      setPrice(String(txn.price ?? ""));
      setFee(String(txn.fee ?? "0"));
      setNotes(txn.notes || "");
    }
  }, [txn]);

  if (!txn) return null;
  const walletName = wallets.find((w) => w.id === txn.wallet_id)?.name || "—";
  const sym = CURRENCY_SYMBOLS[txn.currency] || "";

  const save = async () => {
    setSaving(true);
    try {
      const body = {};
      if (date) body.date = date;
      if (quantity !== "" && !Number.isNaN(parseFloat(quantity))) body.quantity = parseFloat(quantity);
      if (price !== "" && !Number.isNaN(parseFloat(price))) body.price = parseFloat(price);
      if (fee !== "" && !Number.isNaN(parseFloat(fee))) body.fee = parseFloat(fee);
      body.notes = notes;
      await api.patch(`/transactions/${txn.id}`, body);
      toast.success(t("tx.updated"));
      onSaved();
      onClose();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!txn} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md" data-testid="edit-tx-dialog">
        <DialogHeader>
          <DialogTitle className="font-display font-light text-2xl">{t("tx.edit")}</DialogTitle>
          <DialogDescription className="text-zinc-400 text-sm">{t("tx.edit_desc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between border border-zinc-800 rounded-md px-3 py-2 bg-zinc-900/40">
            <div className="flex items-center gap-3">
              <AssetIcon asset={txn} size={28}/>
              <div>
                <div className="font-mono text-zinc-100">{txn.symbol}</div>
                <div className="text-xs text-zinc-400">{txn.name || "—"} · {walletName}</div>
              </div>
            </div>
            <span className={`text-xs font-mono uppercase tracking-wider px-2 py-1 rounded border ${
              txn.type === "BUY" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-rose-400 border-rose-500/30 bg-rose-500/10"
            }`}>{txn.type === "BUY" ? t("tx.buy") : t("tx.sell")}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("tx.date")}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="edit-tx-date"/>
            </div>
            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("tx.quantity")}</Label>
              <Input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="edit-tx-quantity"/>
            </div>
            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("common.price")} ({sym.trim() || txn.currency})</Label>
              <Input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="edit-tx-price"/>
            </div>
            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("tx.fee")}</Label>
              <Input type="number" step="any" value={fee} onChange={(e) => setFee(e.target.value)} className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="edit-tx-fee"/>
            </div>
          </div>
          <div>
            <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("tx.notes")}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="edit-tx-notes"/>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1 bg-zinc-900 border-zinc-800 text-zinc-300" data-testid="edit-tx-cancel">
              {t("common.cancel")}
            </Button>
            <Button onClick={save} disabled={saving} className="flex-1 bg-zinc-100 text-zinc-950 hover:bg-white font-medium" data-testid="edit-tx-save">
              {saving ? t("common.saving") : t("common.update")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewTransactionDialog({ open, setOpen, wallets, onSaved, defaultSymbol, defaultAssetType, defaultPrice }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [type, setType] = useState("BUY");
  const [assetType, setAssetType] = useState("crypto"); // "crypto" | "stock" | "cash"
  const [cashCurrency, setCashCurrency] = useState("EUR");
  const [walletId, setWalletId] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(null); // { symbol, name, id?, resolvedType? }
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const CASH_CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY", "BRL", "CAD", "AUD"];

  useEffect(() => {
    if (!open) {
      // reset all fields when dialog closes
      setPicked(null); setResults([]); setSearch(""); setQty(""); setPrice(""); setFee("0"); setNotes("");
      setDate(new Date().toISOString().slice(0, 10)); setType("BUY"); setAssetType("crypto");
    } else if (defaultSymbol) {
      // pre-fill from asset page
      const at = defaultAssetType === "crypto" ? "crypto" : "stock";
      setAssetType(at);
      setPicked({ symbol: defaultSymbol.toUpperCase(), name: defaultSymbol.toUpperCase(), resolvedType: defaultAssetType || "stock" });
      setSearch(defaultSymbol.toUpperCase());
      if (defaultPrice) setPrice(String(parseFloat(defaultPrice).toFixed(4)));
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: assetType tab change already resets picked/search inline (onValueChange handler)

  useEffect(() => {
    if (assetType === "cash") { setResults([]); return; }
    if (!search || search.length < 1) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const path = assetType === "crypto" ? "/search/crypto" : "/search/stock";
        const { data } = await api.get(path, { params: { q: search } });
        setResults(data || []);
      } catch (e) { void e; }
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [search, assetType]);

  const wallet = wallets.find((w) => w.id === walletId);
  const walletCurrency = wallet?.currency || "USD";
  const sym = CURRENCY_SYMBOLS[walletCurrency] || "";

  const save = async () => {
    if (!walletId) { toast.error(t("tx.toast_pick_wallet")); return; }
    if (assetType === "cash") {
      if (!qty || parseFloat(qty) <= 0) { toast.error(t("tx.toast_enter_amount")); return; }
    } else {
      if (!picked) { toast.error(t("tx.toast_pick_asset")); return; }
      if (!qty || !price) { toast.error(t("tx.toast_qty_price_required")); return; }
    }
    setSaving(true);
    try {
      const isCash = assetType === "cash";
      // For stocks: use Yahoo Finance-detected type (etf/fund/stock)
      const resolvedAssetType = isCash ? "cash"
        : assetType === "crypto" ? "crypto"
        : (picked?.resolvedType || "stock");

      await api.post("/transactions", {
        wallet_id: walletId,
        asset_type: resolvedAssetType,
        symbol: isCash ? cashCurrency : picked.symbol,
        coingecko_id: assetType === "crypto" ? picked.id : undefined,
        name: isCash ? `Cash (${cashCurrency})` : picked.name,
        type,
        date,
        quantity: parseFloat(qty),
        price: isCash ? 1 : parseFloat(price),
        fee: parseFloat(fee || "0"),
        currency: isCash ? cashCurrency : undefined,
        notes,
      });
      const toastKey = isCash
        ? (type === "BUY" ? "tx.toast_deposit_recorded" : "tx.toast_withdrawal_recorded")
        : (type === "BUY" ? "tx.toast_buy_recorded" : "tx.toast_sell_recorded");
      toast.success(t(toastKey, isCash ? { currency: cashCurrency } : { symbol: picked.symbol }));
      setOpen(false);
      onSaved?.();
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 402 && detail?.reason === "asset_limit") {
        toast.error(t("tx.asset_limit_msg"), {
          action: { label: t("common.upgrade"), onClick: () => navigate("/pricing") },
        });
      } else {
        toast.error(formatApiErrorDetail(detail) || t("tx.toast_failed_save"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-zinc-100 text-zinc-950 hover:bg-white font-medium" data-testid="new-tx-btn">
          <Plus className="w-4 h-4 mr-1"/> {t("tx.new")}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display font-light text-2xl">{t("tx.new")}</DialogTitle>
          <DialogDescription className="text-zinc-400 text-sm">
            {t("tx.new_desc")}
          </DialogDescription>
        </DialogHeader>

        {wallets.length === 0 ? (
          <div className="text-sm text-zinc-400 py-4">
            {t("tx.create_wallet_first")}
          </div>
        ) : (
          <div className="space-y-4">
            <Tabs value={type} onValueChange={setType}>
              <TabsList className="w-full bg-zinc-900/50 border border-zinc-800">
                <TabsTrigger value="BUY" className="flex-1 data-[state=active]:bg-emerald-500/90 data-[state=active]:text-zinc-950" data-testid="tx-type-buy">{t("tx.buy")}</TabsTrigger>
                <TabsTrigger value="SELL" className="flex-1 data-[state=active]:bg-rose-500/90 data-[state=active]:text-zinc-950" data-testid="tx-type-sell">{t("tx.sell")}</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("common.wallet")}</Label>
                <Select value={walletId} onValueChange={setWalletId}>
                  <SelectTrigger className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="tx-wallet-select">
                    <SelectValue placeholder={t("tx.select_wallet")}/>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {wallets.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name} <span className="text-zinc-400 ml-1">({w.currency || "USD"})</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("tx.asset_type")}</Label>
                <Tabs value={assetType} onValueChange={(v) => { setAssetType(v); setPicked(null); setSearch(""); setResults([]); }}>
                  <TabsList className="mt-2 w-full bg-zinc-900/50 border border-zinc-800">
                    <TabsTrigger value="crypto" className="flex-1 text-xs data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950" data-testid="tx-asset-crypto">{t("common.crypto")}</TabsTrigger>
                    <TabsTrigger value="stock" className="flex-1 text-xs data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950" data-testid="tx-asset-stock">{t("tx.stock_etf")}</TabsTrigger>
                    <TabsTrigger value="cash" className="flex-1 text-xs data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950" data-testid="tx-asset-cash">{t("common.cash")}</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            {/* Cash UI */}
            {assetType === "cash" && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("wallets.currency")}</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {CASH_CURRENCIES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCashCurrency(c)}
                        className={`px-3 py-1.5 rounded-md border text-xs font-mono transition-colors ${cashCurrency === c ? "bg-zinc-100 text-zinc-950 border-zinc-100" : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"}`}
                      >{c}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">
                    {type === "BUY" ? t("tx.deposit_amount") : t("tx.withdrawal_amount")} ({cashCurrency})
                  </Label>
                  <Input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="5000" className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="tx-cash-amount"/>
                </div>
              </div>
            )}

            {/* Search (crypto / stock / ETF / fund) */}
            {assetType !== "cash" && (
            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">
                {assetType === "crypto" ? t("tx.search_crypto") : t("tx.search_stock")}
              </Label>
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPicked(null); }}
                placeholder={assetType === "crypto" ? t("tx.search_crypto_placeholder") : t("tx.search_stock_placeholder")}
                className="mt-2 bg-zinc-900/50 border-zinc-800"
                data-testid="tx-search-input"
              />
              {searching && <div className="text-xs text-zinc-400 mt-1 font-mono">{t("tx.searching")}</div>}
              {results.length > 0 && (
                <div className="mt-2 max-h-44 overflow-y-auto border border-zinc-800 rounded-md bg-zinc-900/50">
                  {results.map((r) => {
                    const typeLabel = { ETF: "ETF", MUTUALFUND: t("tx.fund") }[r.type];
                    const resolvedType = { ETF: "etf", MUTUALFUND: "fund" }[r.type] || "stock";
                    return (
                      <button
                        key={r.id || r.symbol}
                        onClick={() => { setPicked({ ...r, resolvedType }); setResults([]); setSearch(`${r.symbol} — ${r.name || ""}`); if (r.price) setPrice(String(r.price)); }}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-800/60 text-sm flex items-center justify-between gap-3"
                        data-testid={`tx-search-result-${(r.id || r.symbol).toLowerCase()}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-zinc-100">{r.symbol}</span>
                            {typeLabel && <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400 border border-blue-500/30 bg-blue-500/10 rounded px-1.5 py-0.5">{typeLabel}</span>}
                            {r.exchange && <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 border border-zinc-800 rounded px-1.5 py-0.5">{r.exchange}</span>}
                          </div>
                          <div className="text-zinc-400 text-xs truncate">{r.name}</div>
                        </div>
                        {r.price && <span className="font-mono text-zinc-400 text-xs whitespace-nowrap">${Number(r.price).toFixed(2)}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            {/* Qty / Price / Date / Fee */}
            {(picked || assetType === "cash") && (
              <>
                {assetType !== "cash" && picked && (
                  <div className="bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-zinc-300">
                    <span className="text-zinc-400">{t("tx.selected")} </span>{picked.symbol} — {picked.name}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {assetType !== "cash" && (
                    <div>
                      <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("tx.quantity")}</Label>
                      <Input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="1.5" className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="tx-qty"/>
                    </div>
                  )}
                  {assetType !== "cash" && (
                    <div>
                      <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("common.price")} (USD)</Label>
                      <Input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="tx-price"/>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("tx.date")}</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="tx-date"/>
                  </div>
                  <div>
                    <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("tx.fee")} (USD)</Label>
                    <Input type="number" step="any" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0.00" className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="tx-fee"/>
                  </div>
                </div>
                <Button onClick={save} disabled={saving} className="w-full bg-zinc-100 text-zinc-950 hover:bg-white font-medium" data-testid="tx-submit">
                  {saving ? t("common.saving") : (type === "BUY" ? t("tx.record_buy") : t("tx.record_sell"))}
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

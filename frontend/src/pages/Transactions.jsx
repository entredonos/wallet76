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
import { Plus, Trash2, ArrowDownLeft, ArrowUpRight, Upload, FileText, Pencil } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import AssetIcon from "../components/AssetIcon";
import { useI18n } from "../context/I18nContext";

const CURRENCY_SYMBOLS = { USD: "$", EUR: "€", CHF: "CHF " };

export default function Transactions() {
  const { t } = useI18n();
  const [txns, setTxns] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [filterWallet, setFilterWallet] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [editTxn, setEditTxn] = useState(null);

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
      toast.error("Failed to load transactions");
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
      toast.success("Transaction deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div className="space-y-8 fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("tx.kicker")}</div>
          <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mt-2">{t("tx.title")}</h1>
          <p className="text-zinc-500 mt-2">{t("tx.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportCsvDialog wallets={wallets} onSaved={load}/>
          <NewTransactionDialog open={open} setOpen={setOpen} wallets={wallets} onSaved={load} />
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
        <div className="overflow-x-auto">
          <table className="w-full" data-testid="transactions-table">
            <thead>
              <tr className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-500 border-b border-zinc-800/30">
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
              {loading && (
                <tr><td colSpan={9} className="px-6 py-8 text-center text-zinc-500 font-mono text-sm">Loading…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-6 py-12 text-center text-zinc-600 font-mono text-sm" data-testid="no-transactions">
                  No transactions yet. Click <span className="text-zinc-300">+ New Transaction</span> to add one.
                </td></tr>
              )}
              {filtered.map((t) => {
                const sym = CURRENCY_SYMBOLS[t.currency] || "";
                const total = t.quantity * t.price + (t.type === "BUY" ? (t.fee || 0) : -(t.fee || 0));
                const isBuy = t.type === "BUY";
                return (
                  <tr key={t.id} className="border-b border-zinc-800/30 hover:bg-zinc-900/40 transition-colors" data-testid={`tx-row-${t.id}`}>
                    <td className="px-6 py-4 font-mono text-zinc-300 text-sm">{t.date}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider px-2 py-1 rounded border ${
                        isBuy ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-rose-400 border-rose-500/30 bg-rose-500/10"
                      }`}>
                        {isBuy ? <ArrowDownLeft className="w-3 h-3"/> : <ArrowUpRight className="w-3 h-3"/>}
                        {t.type}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <AssetIcon asset={t} size={24}/>
                        <div>
                          <div className="font-mono text-zinc-100">{t.symbol}</div>
                          <div className="text-xs text-zinc-500">{t.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-400">{walletName(t.wallet_id)}</td>
                    <td className="px-4 py-4 text-right font-mono text-zinc-200">{Number(t.quantity).toLocaleString("en-US", { maximumFractionDigits: 8 })}</td>
                    <td className="px-4 py-4 text-right font-mono text-zinc-200">{sym}{Number(t.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</td>
                    <td className="px-4 py-4 text-right font-mono text-zinc-500">{sym}{Number(t.fee || 0).toFixed(2)}</td>
                    <td className="px-4 py-4 text-right font-mono text-zinc-100">{sym}{total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-3">
                        <button onClick={() => setEditTxn(t)} className="text-zinc-600 hover:text-blue-400 transition-colors" data-testid={`tx-edit-${t.id}`} aria-label="Edit">
                          <Pencil className="w-4 h-4"/>
                        </button>
                        <button onClick={() => removeTxn(t.id)} className="text-zinc-600 hover:text-rose-400 transition-colors" data-testid={`tx-delete-${t.id}`} aria-label="Delete">
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
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!txn} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md" data-testid="edit-tx-dialog">
        <DialogHeader>
          <DialogTitle className="font-display font-light text-2xl">{t("tx.edit")}</DialogTitle>
          <DialogDescription className="text-zinc-500 text-sm">{t("tx.edit_desc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between border border-zinc-800 rounded-md px-3 py-2 bg-zinc-900/40">
            <div className="flex items-center gap-3">
              <AssetIcon asset={txn} size={28}/>
              <div>
                <div className="font-mono text-zinc-100">{txn.symbol}</div>
                <div className="text-xs text-zinc-500">{txn.name || "—"} · {walletName}</div>
              </div>
            </div>
            <span className={`text-xs font-mono uppercase tracking-wider px-2 py-1 rounded border ${
              txn.type === "BUY" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-rose-400 border-rose-500/30 bg-rose-500/10"
            }`}>{txn.type}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("tx.date")}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="edit-tx-date"/>
            </div>
            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("tx.quantity")}</Label>
              <Input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="edit-tx-quantity"/>
            </div>
            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("common.price")} ({sym.trim() || txn.currency})</Label>
              <Input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="edit-tx-price"/>
            </div>
            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("tx.fee")}</Label>
              <Input type="number" step="any" value={fee} onChange={(e) => setFee(e.target.value)} className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="edit-tx-fee"/>
            </div>
          </div>
          <div>
            <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("tx.notes")}</Label>
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

function NewTransactionDialog({ open, setOpen, wallets, onSaved }) {
  const { t } = useI18n();
  const [type, setType] = useState("BUY");
  const [assetType, setAssetType] = useState("crypto");
  const [walletId, setWalletId] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setPicked(null); setResults([]); setSearch(""); setQty(""); setPrice(""); setFee("0"); setNotes("");
      setDate(new Date().toISOString().slice(0, 10)); setType("BUY"); setAssetType("crypto");
    }
  }, [open]);

  useEffect(() => { setPicked(null); setResults([]); setSearch(""); }, [assetType]);

  useEffect(() => {
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
    if (!walletId) { toast.error("Pick a wallet"); return; }
    if (!picked) { toast.error("Pick an asset"); return; }
    if (!qty || !price) { toast.error("Quantity and price required"); return; }
    setSaving(true);
    try {
      await api.post("/transactions", {
        wallet_id: walletId,
        asset_type: assetType,
        symbol: picked.symbol,
        coingecko_id: assetType === "crypto" ? picked.id : undefined,
        name: picked.name,
        type,
        date,
        quantity: parseFloat(qty),
        price: parseFloat(price),
        fee: parseFloat(fee || "0"),
        notes,
      });
      toast.success(`${type} ${picked.symbol} recorded`);
      setOpen(false);
      onSaved?.();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to save");
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
          <DialogDescription className="text-zinc-500 text-sm">
            Record a Buy or Sell. Holdings & average cost are recomputed automatically.
          </DialogDescription>
        </DialogHeader>

        {wallets.length === 0 ? (
          <div className="text-sm text-zinc-400 py-4">
            Create a wallet first in the <span className="text-zinc-200">Wallets</span> tab.
          </div>
        ) : (
          <div className="space-y-4">
            <Tabs value={type} onValueChange={setType}>
              <TabsList className="w-full bg-zinc-900/50 border border-zinc-800">
                <TabsTrigger value="BUY" className="flex-1 data-[state=active]:bg-emerald-500/90 data-[state=active]:text-zinc-950" data-testid="tx-type-buy">Buy</TabsTrigger>
                <TabsTrigger value="SELL" className="flex-1 data-[state=active]:bg-rose-500/90 data-[state=active]:text-zinc-950" data-testid="tx-type-sell">Sell</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">Wallet</Label>
                <Select value={walletId} onValueChange={setWalletId}>
                  <SelectTrigger className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="tx-wallet-select">
                    <SelectValue placeholder="Select wallet"/>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {wallets.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name} <span className="text-zinc-500 ml-1">({w.currency || "USD"})</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">Asset Type</Label>
                <Tabs value={assetType} onValueChange={setAssetType}>
                  <TabsList className="mt-2 w-full bg-zinc-900/50 border border-zinc-800">
                    <TabsTrigger value="crypto" className="flex-1 data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950" data-testid="tx-asset-crypto">Crypto</TabsTrigger>
                    <TabsTrigger value="stock" className="flex-1 data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950" data-testid="tx-asset-stock">Stock</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">
                Search {assetType === "crypto" ? "crypto" : "stock"}
              </Label>
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPicked(null); }}
                placeholder={assetType === "crypto" ? "bitcoin, eth..." : "Apple, Tesla, AAPL..."}
                className="mt-2 bg-zinc-900/50 border-zinc-800"
                data-testid="tx-search-input"
              />
              {searching && <div className="text-xs text-zinc-500 mt-1 font-mono">Searching…</div>}
              {results.length > 0 && (
                <div className="mt-2 max-h-44 overflow-y-auto border border-zinc-800 rounded-md bg-zinc-900/50">
                  {results.map((r) => (
                    <button
                      key={r.id || r.symbol}
                      onClick={() => { setPicked(r); setResults([]); setSearch(`${r.symbol} — ${r.name || ""}`); }}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-800/60 text-sm flex items-center justify-between gap-3"
                      data-testid={`tx-search-result-${(r.id || r.symbol).toLowerCase()}`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-zinc-100">{r.symbol}</span>
                          {r.exchange && <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 border border-zinc-800 rounded px-1.5 py-0.5">{r.exchange}</span>}
                        </div>
                        <div className="text-zinc-500 text-xs truncate">{r.name}</div>
                      </div>
                      {r.price && <span className="font-mono text-zinc-400 text-xs whitespace-nowrap">${Number(r.price).toFixed(2)}</span>}
                    </button>
                  ))}
                </div>
              )}
              {!searching && search.length >= 1 && results.length === 0 && !picked && (
                <div className="mt-2 border border-zinc-800 rounded-md bg-zinc-900/50 p-3 space-y-2">
                  <div className="text-xs text-zinc-500 font-mono">No matches. Use manually:</div>
                  <button
                    type="button"
                    onClick={() => { const s = search.trim().toUpperCase(); setPicked({ symbol: s, name: s, exchange: "manual" }); }}
                    className="w-full text-left px-3 py-2 hover:bg-zinc-800/60 text-sm border border-zinc-800 rounded transition-colors"
                    data-testid="tx-add-manual-ticker"
                  >
                    <span className="text-zinc-300">Use </span>
                    <span className="font-mono text-zinc-100">{search.trim().toUpperCase()}</span>
                    <span className="text-zinc-300"> as ticker →</span>
                  </button>
                </div>
              )}
              {picked && (
                <div className="mt-2 text-xs font-mono text-emerald-400">Selected: {picked.symbol} {picked.name && `· ${picked.name}`}</div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="tx-date-input"/>
              </div>
              <div>
                <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">Quantity</Label>
                <Input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="tx-qty-input"/>
              </div>
              <div>
                <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">Price ({sym.trim() || walletCurrency})</Label>
                <Input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="tx-price-input"/>
              </div>
            </div>

            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">Fee ({sym.trim() || walletCurrency})</Label>
              <Input type="number" step="any" value={fee} onChange={(e) => setFee(e.target.value)} className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="tx-fee-input"/>
            </div>

            <Button onClick={save} disabled={saving} className={`w-full font-medium ${type === "BUY" ? "bg-emerald-500 hover:bg-emerald-400 text-zinc-950" : "bg-rose-500 hover:bg-rose-400 text-zinc-950"}`} data-testid="tx-submit">
              {saving ? "Saving…" : `${type === "BUY" ? "Record Buy" : "Record Sell"}`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


// Parse HTML by extracting all <table> rows
function parseHTML(text) {
  try {
    const doc = new DOMParser().parseFromString(text, "text/html");
    const rows = [];
    // Find the table with the most data rows
    let bestTable = null;
    let bestCount = 0;
    doc.querySelectorAll("table").forEach((tbl) => {
      const trs = tbl.querySelectorAll("tr");
      if (trs.length > bestCount) { bestCount = trs.length; bestTable = tbl; }
    });
    if (!bestTable) return [];
    bestTable.querySelectorAll("tr").forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll("th, td")).map((c) => (c.textContent || "").trim());
      if (cells.length) rows.push(cells);
    });
    return rows;
  } catch {
    return [];
  }
}

// Simple CSV parser (handles quoted fields with commas)
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || (row.length === 1 && row[0])) rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Detect column indices in a header row by name match (case-insensitive, partial)
function detectColumns(header) {
  const h = header.map((x) => (x || "").toString().toLowerCase().trim());
  const find = (...names) => h.findIndex((c) => names.some((n) => c === n.toLowerCase() || c.includes(n.toLowerCase())));
  return {
    date: find("open time", "date", "data", "datetime", "tradedate", "utc_time"),
    type: find("type", "side", "operation", "tipo", "buy/sell"),
    symbol: find("symbol", "ticker", "asset", "coin", "ativo"),
    quantity: find("volume", "quantity", "qty", "amount", "size", "quantidade", "change"),
    price: find("open price", "price", "preço", "preco", "rate", "avg"),
    fee: find("commission", "fee", "taxa", "fees"),
    currency: find("currency", "moeda", "fee currency", "ccy"),
    asset_type: find("asset_type", "category", "instrument", "class"),
  };
}

// Detect XTB section/header rows when iterating raw sheet rows.
// XTB exports contain multiple tables (Closed positions, Open positions, Cash operations).
// We extract from any block that has the canonical XTB header.
function extractXTBSections(allRows) {
  const sections = [];
  const headerNeedles = ["symbol", "type", "volume", "open time", "open price"];
  for (let i = 0; i < allRows.length; i++) {
    const r = (allRows[i] || []).map((c) => (c == null ? "" : c.toString().toLowerCase()));
    const hits = headerNeedles.filter((n) => r.some((cell) => cell.includes(n))).length;
    if (hits >= 4) {
      // Collect rows until empty line / next header
      const block = [allRows[i]];
      for (let j = i + 1; j < allRows.length; j++) {
        const rj = allRows[j] || [];
        const nonEmpty = rj.filter((c) => c != null && c !== "").length;
        if (nonEmpty < 2) break;
        const lower = rj.map((c) => (c == null ? "" : c.toString().toLowerCase()));
        const isAnotherHeader = headerNeedles.filter((n) => lower.some((cell) => cell.includes(n))).length >= 4;
        if (isAnotherHeader) break;
        block.push(rj);
      }
      sections.push(block);
      i += block.length;
    }
  }
  return sections;
}

function ImportCsvDialog({ wallets, onSaved }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [walletId, setWalletId] = useState("");
  const [defaultAssetType, setDefaultAssetType] = useState("crypto");
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const name = file.name || "";
      const isXLSX = /\.xlsx?$/i.test(name);
      if (isXLSX) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        // Aggregate all sheets to support XTB which has multiple tables on one sheet too
        const allRows = [];
        wb.SheetNames.forEach((sn) => {
          const ws = wb.Sheets[sn];
          const sheetRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
          allRows.push(...sheetRows);
        });
        setRawText(`[Parsed XLSX: ${wb.SheetNames.length} sheet(s), ${allRows.length} rows]`);
        // Detect XTB sections
        const sections = extractXTBSections(allRows);
        if (sections.length > 0) {
          // Merge all section rows under a single canonical header
          const header = sections[0][0];
          const merged = [header];
          sections.forEach((block) => {
            for (let i = 1; i < block.length; i++) merged.push(block[i]);
          });
          processRows(merged);
        } else if (allRows.length >= 2) {
          processRows(allRows);
        } else {
          setError("No tabular data found in spreadsheet.");
        }
        return;
      }
      const text = await file.text();
      setRawText(text);
      const isHTML = /\.html?$/i.test(name) || /<table/i.test(text);
      if (isHTML) {
        const rows = parseHTML(text);
        if (rows.length < 2) { setError("No table found in HTML"); return; }
        // Try XTB sections too (XTB HTML reports have multiple tables)
        const xtb = extractXTBSections(rows);
        if (xtb.length > 0) {
          const header = xtb[0][0];
          const merged = [header];
          xtb.forEach((block) => { for (let i = 1; i < block.length; i++) merged.push(block[i]); });
          processRows(merged);
        } else {
          processRows(rows);
        }
      } else {
        tryParse(text);
      }
    } catch { setError("Failed to read file"); }
  };

  const processRows = (rows) => {
    setError("");
    if (rows.length < 2) { setError("CSV/HTML is empty or invalid"); setParsed(null); return; }
    const header = rows[0];
    const cols = detectColumns(header);
    if (cols.symbol < 0 || cols.quantity < 0) {
      setError("Could not detect 'symbol/ticker' and 'quantity' columns. Expected headers like: date, type, symbol, quantity, price, fee, currency");
      setParsed(null);
      return;
    }
    const items = [];
    const skipped = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 2) continue;
      const rawType = (cols.type >= 0 ? r[cols.type] : "BUY").toString().toUpperCase();
      let type = "BUY";
      if (rawType.includes("SELL") || rawType.includes("VEND") || rawType === "S") type = "SELL";
      else if (rawType.includes("BUY") || rawType.includes("COMPR") || rawType === "B") type = "BUY";
      let qty = parseFloat((r[cols.quantity] || "").toString().replace(/[^\d.\-+e]/g, ""));
      if (rawType.includes("SELL") && qty > 0) qty = Math.abs(qty);
      if (Number.isNaN(qty) || qty === 0) { skipped.push({ row: i + 1, reason: "invalid quantity" }); continue; }
      if (qty < 0) { type = "SELL"; qty = Math.abs(qty); }
      const symbol = (r[cols.symbol] || "").toString().toUpperCase().trim()
        .replace(/\.US$/, "")
        .replace(/\.UK$/, ".L")
        .replace(/\.DE$/, ".DE")
        .replace(/\.PL$/, ".WA");
      if (!symbol) { skipped.push({ row: i + 1, reason: "missing symbol" }); continue; }
      const price = cols.price >= 0 ? parseFloat((r[cols.price] || "0").toString().replace(/[^\d.\-+e]/g, "")) : 0;
      const fee = cols.fee >= 0 ? Math.abs(parseFloat((r[cols.fee] || "0").toString().replace(/[^\d.\-+e]/g, "")) || 0) : 0;
      const currency = (cols.currency >= 0 ? (r[cols.currency] || "").toString().toUpperCase().trim() : "") || null;
      const dateRaw = cols.date >= 0 ? (r[cols.date] || "").toString().trim() : "";
      // Accept YYYY-MM-DD, DD/MM/YYYY, DD.MM.YYYY HH:mm:ss (XTB), MM/DD/YYYY
      let date = new Date().toISOString().slice(0, 10);
      const ymd = dateRaw.match(/\d{4}-\d{2}-\d{2}/)?.[0];
      const dmy = dateRaw.match(/(\d{2})[\/.](\d{2})[\/.](\d{4})/);
      if (ymd) date = ymd;
      else if (dmy) date = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
      // Detect crypto vs stock (XTB uses suffixes / symbol heuristics)
      const symbolLower = (r[cols.symbol] || "").toString().toLowerCase();
      const isCryptoSym = /(bitcoin|ethereum|btc|eth|sol|ada|doge|xrp|matic)/i.test(symbolLower)
        || /[a-z]{2,5}\/usd/i.test(symbolLower);
      let asset_type = defaultAssetType;
      if (cols.asset_type >= 0 && (r[cols.asset_type] || "").toString().toLowerCase().includes("stock")) asset_type = "stock";
      if (isCryptoSym) asset_type = "crypto";
      items.push({ date, type, asset_type, symbol, quantity: qty, price, fee, currency, name: symbol });
    }
    setParsed({ items, skipped, header, cols });
  };

  const tryParse = (text) => {
    const isHTML = /<table[\s\S]*?>/i.test(text);
    if (isHTML) { processRows(parseHTML(text)); return; }
    const rows = parseCSV(text);
    processRows(rows);
  };

  const submit = async () => {
    if (!walletId) { setError("Pick a wallet"); return; }
    if (!parsed?.items?.length) { setError("Nothing to import"); return; }
    setUploading(true); setError("");
    try {
      const { data } = await api.post("/transactions/import", {
        wallet_id: walletId,
        rows: parsed.items,
      });
      toast.success(`Imported ${data.imported} transactions${data.errors?.length ? ` (${data.errors.length} errors)` : ""}`);
      setOpen(false);
      setParsed(null); setRawText(""); setError("");
      onSaved?.();
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || "Import failed");
    } finally { setUploading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100" data-testid="import-csv-btn">
          <Upload className="w-4 h-4 mr-2"/> {t("tx.import")}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display font-light text-2xl">Import Transactions from CSV/HTML</DialogTitle>
          <DialogDescription className="text-zinc-500 text-sm">
            Drop a CSV, HTML, or XLSX export from XTB, Binance, Interactive Brokers, Ledger Live or any broker. Required columns: <span className="font-mono">symbol</span> + <span className="font-mono">quantity</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">Destination wallet</Label>
              <Select value={walletId} onValueChange={setWalletId}>
                <SelectTrigger className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="import-wallet-select">
                  <SelectValue placeholder="Pick wallet"/>
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {wallets.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name} <span className="text-zinc-500 ml-1">({w.currency || "USD"})</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">Default asset type</Label>
              <Tabs value={defaultAssetType} onValueChange={setDefaultAssetType}>
                <TabsList className="mt-2 w-full bg-zinc-900/50 border border-zinc-800">
                  <TabsTrigger value="crypto" className="flex-1 data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950" data-testid="import-default-crypto">Crypto</TabsTrigger>
                  <TabsTrigger value="stock" className="flex-1 data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950" data-testid="import-default-stock">Stock</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          <div className="border border-dashed border-zinc-800 rounded-md p-6 text-center">
            <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-2"/>
            <label className="cursor-pointer">
              <input type="file" accept=".csv,.html,.htm,.xlsx,.xls,text/csv,text/html,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={onFile} className="hidden" data-testid="import-file-input"/>
              <span className="text-zinc-300 underline">Choose a CSV, HTML or XLSX file</span>
              <span className="text-zinc-500"> or paste below</span>
            </label>
          </div>

          <textarea
            value={rawText}
            onChange={(e) => { setRawText(e.target.value); }}
            onBlur={() => rawText && tryParse(rawText)}
            placeholder="date,type,symbol,quantity,price,fee,currency&#10;2024-01-15,BUY,BTC,0.5,42000,12,USD&#10;2024-03-20,SELL,AAPL,5,180,1,USD"
            className="w-full h-32 bg-zinc-900/50 border border-zinc-800 rounded-md p-3 font-mono text-xs text-zinc-200 placeholder:text-zinc-600"
            data-testid="import-paste-area"
          />
          {rawText && (
            <Button variant="outline" size="sm" onClick={() => tryParse(rawText)} className="bg-zinc-900 border-zinc-800 text-zinc-300" data-testid="import-parse-btn">
              Parse
            </Button>
          )}

          {error && <div className="text-rose-400 text-sm font-mono" data-testid="import-error">{error}</div>}

          {parsed && (
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-md p-4 space-y-2" data-testid="import-preview">
              <div className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-400">
                Preview: {parsed.items.length} valid · {parsed.skipped.length} skipped
              </div>
              <div className="max-h-48 overflow-y-auto border border-zinc-800 rounded">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-zinc-500 font-mono">
                      <th className="text-left px-2 py-1">Date</th>
                      <th className="text-left px-2 py-1">Type</th>
                      <th className="text-left px-2 py-1">Symbol</th>
                      <th className="text-right px-2 py-1">Qty</th>
                      <th className="text-right px-2 py-1">Price</th>
                      <th className="text-right px-2 py-1">Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.items.slice(0, 25).map((r, i) => (
                      <tr key={i} className="border-t border-zinc-800/50 font-mono text-zinc-300">
                        <td className="px-2 py-1">{r.date}</td>
                        <td className={`px-2 py-1 ${r.type === "BUY" ? "text-emerald-400" : "text-rose-400"}`}>{r.type}</td>
                        <td className="px-2 py-1">{r.symbol}</td>
                        <td className="px-2 py-1 text-right">{r.quantity}</td>
                        <td className="px-2 py-1 text-right">{r.price}</td>
                        <td className="px-2 py-1 text-right">{r.fee}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.items.length > 25 && (
                  <div className="text-center text-xs text-zinc-500 py-2">+ {parsed.items.length - 25} more rows…</div>
                )}
              </div>
            </div>
          )}

          <Button onClick={submit} disabled={uploading || !parsed?.items?.length || !walletId} className="w-full bg-zinc-100 text-zinc-950 hover:bg-white" data-testid="import-submit">
            {uploading ? "Importing…" : `Import ${parsed?.items?.length || 0} transactions`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

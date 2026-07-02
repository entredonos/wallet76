/**
 * ImportCsvDialog — shared component for importing transactions from
 * CSV, HTML (broker export pages) or XLSX files.
 *
 * Used by:
 *   - pages/Transactions.jsx  (import button in the transaction list)
 *   - pages/ConnectedAccounts.jsx  (import section per manual account)
 *
 * Props:
 *   wallets         — array of wallet objects {id, name, currency}
 *   onSaved         — callback fired after successful import
 *   defaultWalletId — pre-select a wallet (optional)
 *   trigger         — optional custom trigger element (ReactNode); if omitted
 *                     a default "Import CSV" button is rendered
 */
import React, { useState } from "react";
import * as XLSX from "xlsx";
import { Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "./ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "./ui/select";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { api, formatApiErrorDetail } from "../lib/api";
import { useI18n } from "../context/I18nContext";

// ── Parsing helpers ───────────────────────────────────────────────────────────

export function parseHTML(text) {
  try {
    const doc = new DOMParser().parseFromString(text, "text/html");
    const rows = [];
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

export function parseCSV(text) {
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

export function detectColumns(header) {
  const h = header.map((x) => (x || "").toString().toLowerCase().trim());
  const find = (...names) => h.findIndex((c) => names.some((n) => c === n.toLowerCase() || c.includes(n.toLowerCase())));
  return {
    date:       find("open time", "date", "data", "datetime", "tradedate", "utc_time"),
    type:       find("type", "side", "operation", "tipo", "buy/sell"),
    symbol:     find("symbol", "ticker", "asset", "coin", "ativo"),
    quantity:   find("volume", "quantity", "qty", "amount", "size", "quantidade", "change"),
    price:      find("open price", "price", "preço", "preco", "rate", "avg"),
    fee:        find("commission", "fee", "taxa", "fees"),
    currency:   find("currency", "moeda", "fee currency", "ccy"),
    asset_type: find("asset_type", "category", "instrument", "class"),
  };
}

export function extractXTBSections(allRows) {
  const sections = [];
  const headerNeedles = ["symbol", "type", "volume", "open time", "open price"];
  for (let i = 0; i < allRows.length; i++) {
    const r = (allRows[i] || []).map((c) => (c == null ? "" : c.toString().toLowerCase()));
    const hits = headerNeedles.filter((n) => r.some((cell) => cell.includes(n))).length;
    if (hits >= 4) {
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

export function processRows(rows, defaultAssetType = "crypto") {
  if (!rows || rows.length < 2) return { items: [], skipped: [], error: "CSV/HTML is empty or invalid" };
  const header = rows[0];
  const cols = detectColumns(header);
  if (cols.symbol < 0 || cols.quantity < 0) {
    return {
      items: [], skipped: [],
      error: "Could not detect 'symbol/ticker' and 'quantity' columns. Expected headers like: date, type, symbol, quantity, price, fee, currency",
    };
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
      .replace(/\.US$/, "").replace(/\.UK$/, ".L").replace(/\.DE$/, ".DE").replace(/\.PL$/, ".WA");
    if (!symbol) { skipped.push({ row: i + 1, reason: "missing symbol" }); continue; }
    const price = cols.price >= 0 ? parseFloat((r[cols.price] || "0").toString().replace(/[^\d.\-+e]/g, "")) : 0;
    const fee   = cols.fee  >= 0 ? Math.abs(parseFloat((r[cols.fee]  || "0").toString().replace(/[^\d.\-+e]/g, "")) || 0) : 0;
    const currency = (cols.currency >= 0 ? (r[cols.currency] || "").toString().toUpperCase().trim() : "") || null;
    const dateRaw = cols.date >= 0 ? (r[cols.date] || "").toString().trim() : "";
    let date = new Date().toISOString().slice(0, 10);
    const ymd = dateRaw.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    const dmy = dateRaw.match(/(\d{2})[\/.](\d{2})[\/.](\d{4})/);
    if (ymd) date = ymd;
    else if (dmy) date = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    const symbolLower = (r[cols.symbol] || "").toString().toLowerCase();
    const isCryptoSym = /(bitcoin|ethereum|btc|eth|sol|ada|doge|xrp|matic)/i.test(symbolLower) || /[a-z]{2,5}\/usd/i.test(symbolLower);
    let asset_type = defaultAssetType;
    if (cols.asset_type >= 0 && (r[cols.asset_type] || "").toString().toLowerCase().includes("stock")) asset_type = "stock";
    if (isCryptoSym) asset_type = "crypto";
    items.push({ date, type, asset_type, symbol, quantity: qty, price, fee, currency, name: symbol });
  }
  return { items, skipped, header, cols };
}

// ── Dialog component ──────────────────────────────────────────────────────────

export default function ImportCsvDialog({ wallets = [], onSaved, defaultWalletId = "", trigger }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [walletId, setWalletId] = useState(defaultWalletId);
  const [defaultAssetType, setDefaultAssetType] = useState("crypto");
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  // Reset wallet selection if defaultWalletId changes (e.g. opened from a specific account card)
  const handleOpen = (v) => {
    if (v && defaultWalletId) setWalletId(defaultWalletId);
    setOpen(v);
  };

  const applyRows = (rows) => {
    const result = processRows(rows, defaultAssetType);
    if (result.error) { setError(result.error); setParsed(null); return; }
    setError("");
    setParsed(result);
  };

  const tryParse = (text) => {
    const isHTML = /<table[\s\S]*?>/i.test(text);
    if (isHTML) { applyRows(parseHTML(text)); return; }
    applyRows(parseCSV(text));
  };

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
        const allRows = [];
        wb.SheetNames.forEach((sn) => {
          const ws = wb.Sheets[sn];
          const sheetRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
          allRows.push(...sheetRows);
        });
        setRawText(`[Parsed XLSX: ${wb.SheetNames.length} sheet(s), ${allRows.length} rows]`);
        const sections = extractXTBSections(allRows);
        if (sections.length > 0) {
          const header = sections[0][0];
          const merged = [header];
          sections.forEach((block) => { for (let i = 1; i < block.length; i++) merged.push(block[i]); });
          applyRows(merged);
        } else if (allRows.length >= 2) {
          applyRows(allRows);
        } else {
          setError(t("csvimport.no_tabular_data"));
        }
        return;
      }
      const text = await file.text();
      setRawText(text);
      const isHTML = /\.html?$/i.test(name) || /<table/i.test(text);
      if (isHTML) {
        const rows = parseHTML(text);
        if (rows.length < 2) { setError(t("csvimport.no_table_html")); return; }
        const xtb = extractXTBSections(rows);
        if (xtb.length > 0) {
          const header = xtb[0][0];
          const merged = [header];
          xtb.forEach((block) => { for (let i = 1; i < block.length; i++) merged.push(block[i]); });
          applyRows(merged);
        } else {
          applyRows(rows);
        }
      } else {
        tryParse(text);
      }
    } catch { setError(t("csvimport.failed_read_file")); }
  };

  const submit = async () => {
    if (!walletId) { setError(t("tx.toast_pick_wallet")); return; }
    if (!parsed?.items?.length) { setError(t("csvimport.nothing_to_import")); return; }
    setUploading(true); setError("");
    try {
      const { data } = await api.post("/transactions/import", {
        wallet_id: walletId,
        rows: parsed.items,
      });
      const toastMsg = data.errors?.length
        ? t("csvimport.imported_toast_errors", { n: data.imported, errors: data.errors.length })
        : t("csvimport.imported_toast", { n: data.imported });
      toast.success(toastMsg);
      setOpen(false);
      setParsed(null); setRawText(""); setError("");
      onSaved?.();
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || t("csvimport.failed"));
    } finally { setUploading(false); }
  };

  const defaultTrigger = (
    <Button variant="outline" className="bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
      <Upload className="w-4 h-4 mr-2" /> {t("csvimport.default_trigger")}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      {/* Wrap trigger — can be overridden by caller */}
      <span onClick={() => handleOpen(true)} className="cursor-pointer">
        {trigger || defaultTrigger}
      </span>

      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display font-light text-2xl">{t("csvimport.title")}</DialogTitle>
          <DialogDescription className="text-zinc-500 text-sm">
            {t("csvimport.desc_prefix")}
            {" "}{t("csvimport.desc_columns")} <span className="font-mono">symbol</span> + <span className="font-mono">quantity</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("csvimport.dest_wallet")}</Label>
              <Select value={walletId} onValueChange={setWalletId}>
                <SelectTrigger className="mt-2 bg-zinc-900/50 border-zinc-800">
                  <SelectValue placeholder={t("csvimport.pick_wallet")} />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {wallets.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} <span className="text-zinc-500 ml-1">({w.currency || "USD"})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("csvimport.default_asset_type")}</Label>
              <Tabs value={defaultAssetType} onValueChange={setDefaultAssetType}>
                <TabsList className="mt-2 w-full bg-zinc-900/50 border border-zinc-800">
                  <TabsTrigger value="crypto" className="flex-1 data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950">{t("common.crypto")}</TabsTrigger>
                  <TabsTrigger value="stock"  className="flex-1 data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950">{t("tx.stock_etf")}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {/* File drop zone */}
          <div className="border border-dashed border-zinc-800 rounded-md p-6 text-center">
            <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".csv,.html,.htm,.xlsx,.xls,text/csv,text/html,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={onFile}
                className="hidden"
              />
              <span className="text-zinc-300 underline">{t("csvimport.choose_file")}</span>
              <span className="text-zinc-500"> {t("csvimport.or_paste")}</span>
            </label>
            <p className="text-xs text-zinc-600 mt-2">
              {t("csvimport.supported_prefix")} XTB · DEGIRO · Binance · eToro · Revolut · Interactive Brokers · Ledger Live
            </p>
          </div>

          {/* Paste area */}
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            onBlur={() => rawText && tryParse(rawText)}
            placeholder={"date,type,symbol,quantity,price,fee,currency\n2024-01-15,BUY,BTC,0.5,42000,12,USD\n2024-03-20,SELL,AAPL,5,180,1,USD"}
            className="w-full h-28 bg-zinc-900/50 border border-zinc-800 rounded-md p-3 font-mono text-xs text-zinc-200 placeholder:text-zinc-600"
          />
          {rawText && !rawText.startsWith("[Parsed") && (
            <Button variant="outline" size="sm" onClick={() => tryParse(rawText)} className="bg-zinc-900 border-zinc-800 text-zinc-300">
              {t("csvimport.parse")}
            </Button>
          )}

          {error && <div className="text-rose-400 text-sm font-mono">{error}</div>}

          {/* Preview table */}
          {parsed && (
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-md p-4 space-y-2">
              <div className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-400">
                {t("csvimport.preview", { valid: parsed.items.length, skipped: parsed.skipped.length })}
              </div>
              <div className="max-h-48 overflow-y-auto border border-zinc-800 rounded">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-zinc-500 font-mono">
                      <th className="text-left px-2 py-1">{t("tx.date")}</th>
                      <th className="text-left px-2 py-1">{t("tx.type")}</th>
                      <th className="text-left px-2 py-1">{t("csvimport.symbol")}</th>
                      <th className="text-right px-2 py-1">{t("csvimport.qty")}</th>
                      <th className="text-right px-2 py-1">{t("common.price")}</th>
                      <th className="text-right px-2 py-1">{t("tx.fee")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.items.slice(0, 25).map((r, i) => (
                      <tr key={i} className="border-t border-zinc-800/50 font-mono text-zinc-300">
                        <td className="px-2 py-1">{r.date}</td>
                        <td className={`px-2 py-1 ${r.type === "BUY" ? "text-emerald-400" : "text-rose-400"}`}>{r.type === "BUY" ? t("tx.buy") : t("tx.sell")}</td>
                        <td className="px-2 py-1">{r.symbol}</td>
                        <td className="px-2 py-1 text-right">{r.quantity}</td>
                        <td className="px-2 py-1 text-right">{r.price || "—"}</td>
                        <td className="px-2 py-1 text-right">{r.fee || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.items.length > 25 && (
                  <div className="text-center text-xs text-zinc-500 py-2">{t("csvimport.more_rows", { n: parsed.items.length - 25 })}</div>
                )}
              </div>
            </div>
          )}

          <Button
            onClick={submit}
            disabled={uploading || !parsed?.items?.length || !walletId}
            className="w-full bg-zinc-100 text-zinc-950 hover:bg-white"
          >
            {uploading ? t("csvimport.importing") : t("csvimport.import_n", { n: parsed?.items?.length || 0 })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

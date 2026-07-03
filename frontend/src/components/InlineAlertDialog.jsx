import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "./ui/dialog";
import { ArrowUp, ArrowDown, BellRing } from "lucide-react";
import { toast } from "sonner";
import { fmtCurrency } from "../lib/format";
import { useI18n } from "../context/I18nContext";
import { requestSidebarRefresh } from "../lib/sidebarRefresh";

/**
 * Reusable inline price-alert creator. Pops a focused dialog pre-filled with the asset.
 * @param {{ asset: {symbol, name, asset_type, coingecko_id?, price_usd?}, open: boolean, onOpenChange: (b:boolean)=>void, onCreated?: ()=>void }} props
 */
export default function InlineAlertDialog({ asset, open, onOpenChange, onCreated }) {
  const { t } = useI18n();
  const [condition, setCondition] = useState("above");
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && asset?.price_usd) {
      // Default target = +5% for above, -5% for below
      const def = (asset.price_usd * (condition === "above" ? 1.05 : 0.95)).toFixed(2);
      setTarget(def);
    }
    // eslint-disable-next-line
  }, [open, asset?.symbol]);

  if (!asset) return null;

  const submit = async () => {
    const tv = parseFloat(target);
    if (!tv || tv <= 0) { toast.error(t("alert.target_required")); return; }
    setSaving(true);
    try {
      await api.post("/alerts", {
        symbol: asset.symbol,
        asset_type: asset.asset_type,
        coingecko_id: asset.coingecko_id || null,
        condition,
        target_price_usd: tv,
        name: asset.name || asset.symbol,
      });
      toast.success(t("alert.created"));
      onOpenChange(false);
      onCreated?.();
      requestSidebarRefresh();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  const current = asset.price_usd || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md" data-testid="inline-alert-dialog">
        <DialogHeader>
          <DialogTitle className="font-display font-light text-2xl flex items-center gap-2">
            <BellRing className="w-5 h-5 text-blue-400"/>
            {t("alert.new")} · <span className="font-mono">{asset.symbol}</span>
          </DialogTitle>
          <DialogDescription className="text-zinc-500 text-sm">
            {t("alert.subtitle")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-md px-3 py-2 flex items-center justify-between">
            <div>
              <div className="text-xs font-mono text-zinc-500">{t("alert.current_price")}</div>
              <div className="font-mono text-zinc-100">{current ? fmtCurrency(current, "USD") : "—"}</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono text-zinc-500">{asset.name}</div>
              <div className="text-[10px] font-mono uppercase border border-zinc-800 rounded px-1 py-0.5 text-zinc-500">{asset.asset_type}</div>
            </div>
          </div>

          <div>
            <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("alert.condition")}</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                onClick={() => setCondition("above")}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm font-mono transition-colors ${
                  condition === "above"
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                    : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
                data-testid="alert-cond-above"
              >
                <ArrowUp className="w-4 h-4"/> {t("alert.above")}
              </button>
              <button
                onClick={() => setCondition("below")}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm font-mono transition-colors ${
                  condition === "below"
                    ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
                    : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
                data-testid="alert-cond-below"
              >
                <ArrowDown className="w-4 h-4"/> {t("alert.below")}
              </button>
            </div>
          </div>

          <div>
            <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("alert.target_price")} (USD)</Label>
            <Input
              type="number"
              step="any"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="0.00"
              className="mt-2 bg-zinc-900/50 border-zinc-800 font-mono"
              data-testid="alert-target-input"
              autoFocus
            />
            {current > 0 && target && (
              <div className="text-[10px] font-mono text-zinc-500 mt-1">
                {(((parseFloat(target) - current) / current) * 100).toFixed(2)}% {t("alert.from_current")}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-zinc-900/50 border-zinc-800 text-zinc-300" data-testid="alert-cancel">
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={saving || !target} className="bg-blue-500 hover:bg-blue-400 text-zinc-950" data-testid="alert-submit">
            <BellRing className="w-4 h-4 mr-1.5"/> {saving ? t("common.saving") : t("alert.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

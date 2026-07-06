import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, formatApiErrorDetail } from "../../lib/api";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "../ui/dialog";
import { useI18n } from "../../context/I18nContext";
import { ALLOCATION_CLASSES, ALLOCATION_CLASS_LABEL_KEY, ALLOCATION_CLASS_COLOR, aggregateByClass } from "../../lib/allocation";

// "UPGRADE v1.0" — target-allocation configuration dialog. One draggable
// slider per known class (stock/crypto/etf/fund/cash) instead of a plain
// number input — mirrors the look of the pie legend's horizontal bars
// underneath the widget's own chart, so the same "bar = percentage"
// language is used in both places. Each row also shows the class's current
// actual % next to the target % being edited, and a running total that
// must land on 100% (±0.5 tolerance, mirrors the backend's own check in
// routes/allocation.py) before Save is enabled.
export default function AllocationTargetDialog({ open, onOpenChange, initialTargets, holdings, overrides, onSaved }) {
  const { t } = useI18n();
  const [values, setValues] = useState(() => {
    const init = {};
    ALLOCATION_CLASSES.forEach((cls) => {
      init[cls] = initialTargets?.[cls] != null ? Number(initialTargets[cls]) : 0;
    });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const hasExistingTarget = Object.keys(initialTargets || {}).length > 0;

  // Current live allocation per class, shown next to the target slider so
  // the user can see where they stand while dragging towards the target.
  const actualPctByClass = useMemo(() => {
    const totals = aggregateByClass(holdings || [], overrides || {});
    const totalValue = Object.values(totals).reduce((s, v) => s + v, 0);
    const pct = {};
    ALLOCATION_CLASSES.forEach((cls) => {
      pct[cls] = totalValue > 0 ? ((totals[cls] || 0) / totalValue) * 100 : 0;
    });
    return pct;
  }, [holdings, overrides]);

  const total = ALLOCATION_CLASSES.reduce((s, cls) => s + (Number(values[cls]) || 0), 0);
  const sumOk = Math.abs(total - 100) <= 0.5;

  const setClassValue = (cls, raw) => {
    const n = Math.max(0, Math.min(100, Number(raw) || 0));
    setValues((v) => ({ ...v, [cls]: n }));
  };

  const save = async () => {
    if (!sumOk) {
      toast.error(t("alloc.toast_target_sum_error"));
      return;
    }
    const targets = {};
    ALLOCATION_CLASSES.forEach((cls) => { targets[cls] = Number(values[cls]) || 0; });
    setSaving(true);
    try {
      await api.put("/allocation/target", { targets });
      toast.success(t("alloc.toast_target_saved"));
      onSaved?.(targets);
      onOpenChange(false);
    } catch (e) {
      toast.error(formatApiErrorDetail(e?.response?.data?.detail) || t("alloc.toast_target_failed"));
    } finally {
      setSaving(false);
    }
  };

  // Clears the target back to "not configured" — the widget then falls
  // back to its original (no-target) look. The backend accepts an empty
  // targets object as an explicit "disable", skipping the sum-must-be-100
  // validation for that one case (see routes/allocation.py).
  const disable = async () => {
    setSaving(true);
    try {
      await api.put("/allocation/target", { targets: {} });
      toast.success(t("alloc.toast_target_disabled"));
      onSaved?.({});
      onOpenChange(false);
    } catch (e) {
      toast.error(formatApiErrorDetail(e?.response?.data?.detail) || t("alloc.toast_target_failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-sm">
        {/* Slider thumb is deliberately taller than the track (protrudes
            above/below it) so it reads as a draggable handle rather than
            just decoration on the bar — the fill color comes from
            ALLOCATION_CLASS_COLOR per row via an inline gradient. */}
        <style>{`
          .alloc-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; border-radius: 9999px; outline: none; cursor: pointer; }
          .alloc-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 6px; height: 18px; border-radius: 3px; background: #fafafa; border: 1px solid #09090b; cursor: grab; box-shadow: 0 0 0 1px rgba(0,0,0,0.5); }
          .alloc-slider::-webkit-slider-thumb:active { cursor: grabbing; }
          .alloc-slider::-moz-range-thumb { width: 6px; height: 18px; border-radius: 3px; background: #fafafa; border: 1px solid #09090b; cursor: grab; }
          .alloc-slider::-moz-range-track { height: 6px; border-radius: 9999px; background: transparent; }
        `}</style>

        <DialogHeader>
          <DialogTitle className="font-display font-light text-2xl">{t("alloc.dialog_title")}</DialogTitle>
          <DialogDescription className="text-zinc-400 text-sm">{t("alloc.dialog_desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {ALLOCATION_CLASSES.map((cls) => {
            const val = values[cls] ?? 0;
            const color = ALLOCATION_CLASS_COLOR[cls];
            const actual = actualPctByClass[cls] || 0;
            return (
              <div key={cls} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-400">
                    {t(ALLOCATION_CLASS_LABEL_KEY[cls])}
                  </Label>
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-zinc-400" title={t("alloc.actual_pct")}>{actual.toFixed(1)}%</span>
                    <span className="text-zinc-100 font-semibold w-11 text-right" data-testid={`alloc-target-value-${cls}`}>
                      {val.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={val}
                  onChange={(e) => setClassValue(cls, e.target.value)}
                  className="alloc-slider"
                  style={{ background: `linear-gradient(to right, ${color} 0%, ${color} ${val}%, #27272a ${val}%, #27272a 100%)` }}
                  data-testid={`alloc-target-slider-${cls}`}
                />
              </div>
            );
          })}

          <div className={`flex items-center justify-between pt-2 border-t border-zinc-800 font-mono text-sm ${sumOk ? "text-emerald-400" : "text-rose-400"}`}>
            <span className="text-zinc-400 text-xs font-mono uppercase tracking-[0.15em]">{t("alloc.sum_label")}</span>
            <span>{total.toFixed(1)}%</span>
          </div>
          {!sumOk && (
            <div className="text-[11px] font-mono text-rose-400">{t("alloc.sum_must_100")}</div>
          )}
        </div>

        <div className={`flex items-center gap-2 pt-2 ${hasExistingTarget ? "justify-between" : "justify-end"}`}>
          {hasExistingTarget && (
            <Button
              variant="outline"
              onClick={disable}
              disabled={saving}
              className="bg-transparent border-rose-500/30 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-50"
              data-testid="alloc-target-disable-btn"
            >
              {t("alloc.disable_target")}
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="bg-zinc-900/50 border-zinc-800 text-zinc-300"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={save}
              disabled={!sumOk || saving}
              className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 disabled:opacity-50"
              data-testid="alloc-target-save-btn"
            >
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

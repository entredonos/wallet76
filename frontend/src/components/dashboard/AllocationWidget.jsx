import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Settings2 } from "lucide-react";
import { useI18n } from "../../context/I18nContext";
import { fmtCurrency, convert } from "../../lib/format";
import AssetIcon from "../AssetIcon";
import { PIE_COLORS, renderPieSliceLabel } from "../../constants/dashboardConstants";
import { ALLOCATION_CLASS_LABEL_KEY, ALLOCATION_CLASS_COLOR, effectiveClass } from "../../lib/allocation";

// Asset Allocation widget — class/asset donut + either the editable
// target-vs-actual rows (when a target is configured) or the plain
// percentage legend. Sliders here mutate Dashboard's draft allocation
// state directly via handleClassSliderDrag/commitClassSliderDrag, same as
// before extraction — this stays a controlled/presentational component,
// Dashboard.jsx still owns and persists the actual target values.
export default function AllocationWidget({
  allocationMode, setAllocationMode, setShowTargetDialog,
  pieData, activeAllocation, setActiveAllocation, totalForAlloc, filtered,
  hideValues, currency, fxRates, hasAllocationTarget, classAllocationRows,
  allocOverrides,
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="text-sm font-medium text-zinc-300">
          {t("dash.allocation")}
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-zinc-800 bg-zinc-900/60 p-0.5">
            <button
              type="button"
              onClick={() => setAllocationMode("class")}
              className={`px-2.5 py-1 text-[10px] font-mono rounded transition ${
                allocationMode === "class"
                  ? "bg-zinc-100 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t("common.class")}
            </button>

            <button
              type="button"
              onClick={() => setAllocationMode("asset")}
              className={`px-2.5 py-1 text-[10px] font-mono rounded transition ${
                allocationMode === "asset"
                  ? "bg-zinc-100 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t("common.assets")}
            </button>
          </div>

          {/* "UPGRADE v1.0" — opens the target-allocation dialog */}
          <button
            type="button"
            onClick={() => setShowTargetDialog(true)}
            className="p-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
            title={t("alloc.configure_target")}
            data-testid="allocation-target-settings-btn"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="min-h-72" data-testid="allocation-chart">
        {pieData.length > 0 ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-full h-52 relative">
              {/* Idle state: how many assets are in view (respects the
                  page's own wallet/type filter pills — global by
                  default). Hover a slice: back to %+name, as before. */}
              {activeAllocation ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
                  <div className="text-lg font-bold text-zinc-100">
                    {activeAllocation.pct.toFixed(1)}%
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                    {activeAllocation.name}
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
                  <div className="text-lg font-bold text-zinc-100">{filtered.length}</div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">{t("dash.assets")}</div>
                </div>
              )}

              <ResponsiveContainer width="100%" height="100%" minWidth={150} minHeight={150}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={2}
                    stroke="#09090b"
                    label={renderPieSliceLabel}
                    labelLine={false}
                    onMouseEnter={(_, index) => setActiveAllocation(pieData[index])}
                    onMouseLeave={() => setActiveAllocation(null)}
                  >
                    {pieData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={allocationMode === "class" && entry.cls ? (ALLOCATION_CLASS_COLOR[entry.cls] || ALLOCATION_CLASS_COLOR.other) : PIE_COLORS[i % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>

                  {/* "UPGRADE v1.0" — compact custom tooltip: the
                      default Recharts box was oversized for this small
                      donut and covered too much of the chart. */}
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0]?.payload;
                      if (!item) return null;
                      const pct = (Number(item.value || 0) / totalForAlloc) * 100;
                      return (
                        <div className="bg-zinc-950/95 border border-zinc-800 rounded-md px-2.5 py-1.5 shadow-xl backdrop-blur-sm max-w-[170px]">
                          <div className="text-[10px] font-mono text-zinc-400 truncate">{item.name}</div>
                          <div className="text-xs font-mono font-semibold text-zinc-100 mt-0.5 whitespace-nowrap">
                            {hideValues ? "•••••" : fmtCurrency(convert(item.value, currency, fxRates), currency)}
                            <span className="text-zinc-400 font-normal ml-1.5">{pct.toFixed(1)}%</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {allocationMode === "class" && hasAllocationTarget ? (
              // "UPGRADE v1.0" — the pie's own class legend, now doubling
              // as the editable target editor: dragging a slider here
              // auto-rebalances the other 4 classes so the total always
              // stays at 100 (the separate dialog stays free-edit, per
              // the user's explicit choice).
              <div className="w-full space-y-3" data-testid="allocation-class-rows">
                <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-zinc-600">
                  <span>{t("dash.assets")}</span>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="w-9 text-right">{t("alloc.target_pct")}</span>
                    <span className="w-9 text-right">{t("alloc.actual_pct")}</span>
                    <span className="w-11 text-right">{t("alloc.deviation")}</span>
                    <span className="w-16 text-right">{t("alloc.adjustment")}</span>
                  </div>
                </div>

                {classAllocationRows.map((row) => {
                  const label = row.labelKey ? t(row.labelKey) : row.cls;
                  const outOfRange = Math.abs(row.deviation) > 5;
                  const color = ALLOCATION_CLASS_COLOR[row.cls] || ALLOCATION_CLASS_COLOR.other;
                  return (
                    <div key={row.cls} className="space-y-1.5" data-testid={`allocation-row-${row.cls}`}>
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                        <span className="text-zinc-300 truncate">{label}</span>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="w-9 text-right text-zinc-100 font-semibold" data-testid={`allocation-target-value-${row.cls}`}>
                            {row.targetPct.toFixed(0)}%
                          </span>
                          <span className={`w-9 text-right ${outOfRange ? (row.deviation > 0 ? "text-amber-400" : "text-sky-400") : "text-emerald-400"}`}>{row.actualPct.toFixed(1)}%</span>
                          <span className={`w-11 text-right ${outOfRange ? (row.deviation > 0 ? "text-amber-400" : "text-sky-400") : "text-emerald-400"}`}>
                            {row.deviation > 0 ? "+" : ""}{row.deviation.toFixed(1)}%
                          </span>
                          <span className={`w-16 text-right ${row.adjustmentUsd > 0 ? "text-emerald-400" : row.adjustmentUsd < 0 ? "text-rose-400" : "text-zinc-600"}`}>
                            {hideValues ? "•••••" : `${row.adjustmentUsd >= 0 ? "+" : ""}${fmtCurrency(convert(row.adjustmentUsd, currency, fxRates), currency)}`}
                          </span>
                        </div>
                      </div>

                      {row.editable ? (
                        // Estático e não-clicável de propósito — um
                        // <input type="range"> aqui era fácil demais de
                        // tocar sem querer (scroll/toque no telemóvel) e
                        // mudava o alvo na hora, sem confirmação. Agora é
                        // só leitura: fill colorido = % ATUAL, marca
                        // branca = % ALVO. Editar o alvo só é possível
                        // pelo botão de definições (Settings2) ao lado do
                        // toggle Classe/Ativos, que abre o
                        // AllocationTargetDialog.
                        <div
                          className="relative h-1.5 rounded-full bg-zinc-800 overflow-visible"
                          title={`${t("alloc.actual_pct")}: ${row.actualPct.toFixed(1)}% · ${t("alloc.target_pct")}: ${row.targetPct.toFixed(0)}%`}
                          data-testid={`allocation-bar-${row.cls}`}
                        >
                          <div
                            className="h-full rounded-full overflow-hidden"
                            style={{ width: `${Math.min(Math.max(row.actualPct, 0), 100)}%`, backgroundColor: color }}
                          />
                          <div
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-0.5 h-3 rounded-full bg-white"
                            style={{ left: `${Math.min(Math.max(row.targetPct, 0), 100)}%` }}
                            data-testid={`allocation-target-marker-${row.cls}`}
                          />
                        </div>
                      ) : (
                        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(Math.max(row.actualPct, 0), 100)}%`, backgroundColor: color }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="w-full space-y-2 max-h-44 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                {pieData.map((item, i) => {
                  const pct = ((Number(item.value || 0) / totalForAlloc) * 100).toFixed(1);
                  // "UPGRADE v1.0" — small class/group tag before the
                  // logo in Assets view only (leaves everything else in
                  // this row untouched), so you can see at a glance
                  // which allocation class each asset belongs to —
                  // respects manual per-symbol overrides, same as the
                  // Class view.
                  const itemCls = item.asset_type ? effectiveClass({ symbol: item.symbol, asset_type: item.asset_type }, allocOverrides) : null;
                  const itemClsColor = itemCls ? (ALLOCATION_CLASS_COLOR[itemCls] || ALLOCATION_CLASS_COLOR.other) : null;
                  const itemClsLabel = itemCls ? (ALLOCATION_CLASS_LABEL_KEY[itemCls] ? t(ALLOCATION_CLASS_LABEL_KEY[itemCls]) : t("common.other")) : null;

                  return (
                    <div key={item.name} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {item.asset_type && allocationMode !== "class" ? (
                            <AssetIcon
                              asset={{ symbol: item.symbol, asset_type: item.asset_type, coingecko_id: item.coingecko_id }}
                              size={16}
                              rounded="rounded-sm"
                            />
                          ) : (
                            <span
                              className="w-2 h-2 rounded-sm shrink-0"
                              style={{ backgroundColor: allocationMode === "class" && item.cls ? (ALLOCATION_CLASS_COLOR[item.cls] || ALLOCATION_CLASS_COLOR.other) : PIE_COLORS[i % PIE_COLORS.length] }}
                            />
                          )}
                          <span className="text-zinc-300 truncate">{item.name}</span>
                        </div>

                        {item.asset_type && allocationMode !== "class" && (
                          // Fixed width so every badge lines up the same
                          // regardless of label length (color unchanged).
                          <span
                            className="shrink-0 w-10 text-center text-[8px] font-mono font-bold uppercase tracking-wide px-1 py-0.5 rounded truncate"
                            style={{ color: itemClsColor, backgroundColor: `${itemClsColor}22`, border: `1px solid ${itemClsColor}55` }}
                            title={itemClsLabel}
                            data-testid={`allocation-asset-class-tag-${item.symbol}`}
                          >
                            {itemClsLabel}
                          </span>
                        )}

                        <div className="text-zinc-400 shrink-0">
                          {pct}%
                        </div>
                      </div>

                      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(Number(pct), 100)}%`,
                            backgroundColor: allocationMode === "class" && item.cls ? (ALLOCATION_CLASS_COLOR[item.cls] || ALLOCATION_CLASS_COLOR.other) : PIE_COLORS[i % PIE_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-zinc-600 text-sm font-mono text-center px-4">
            {t("dash.no_assets")}
          </div>
        )}
      </div>

      {allocationMode === "class" && pieData.length > 0 && !hasAllocationTarget && (
        <div className="mt-4 pt-4 border-t border-zinc-800/60 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[11px] font-mono text-zinc-400">{t("alloc.no_target_hint")}</div>
          <button
            type="button"
            onClick={() => setShowTargetDialog(true)}
            className="px-2.5 py-1 text-[10px] font-mono rounded-md border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:border-zinc-500 transition-colors"
            data-testid="allocation-define-target-btn"
          >
            {t("alloc.define_target_cta")}
          </button>
        </div>
      )}
    </>
  );
}

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Lock, Unlock, PieChart as PieIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useI18n } from "../context/I18nContext";
import { fmtCurrency, convert } from "../lib/format";
import {
  ALLOCATION_CLASSES, ALLOCATION_CLASS_LABEL_KEY, ALLOCATION_CLASS_COLOR, effectiveClass,
} from "../lib/allocation";
import { renderPieSliceLabel } from "../constants/dashboardConstants";

// Página "Alocação" (Portfólio → Alocação) — alocação-alvo a 2 níveis.
// Nível 1: % por grupo/classe (donut + editor, soma 100%).
// Nível 2: dentro de cada aba, a % de cada ativo divide-se automaticamente por
// igual; cada ativo pode ser FIXADO (cadeado) e os não-fixados reajustam-se.
const MARGIN = 0.5; // margem para "Comprar" vs "Aguardar"

export default function Alocacao({ currency = "USD" }) {
  const { t } = useI18n();
  const L = useCallback((key, fb) => { const v = t(key); return v && v !== key ? v : fb; }, [t]);
  const [assets, setAssets] = useState([]);
  const [summary, setSummary] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [assetTargets, setAssetTargets] = useState({});
  const [sectors, setSectors] = useState({});
  const [groupDraft, setGroupDraft] = useState({});
  const [savedTargets, setSavedTargets] = useState({});
  const [activeTab, setActiveTab] = useState(null);
  const [mode, setMode] = useState("basic");
  const [loading, setLoading] = useState(true);

  const fx = summary?.fx_rates || {};
  const money = useCallback((usd) => fmtCurrency(convert(Number(usd || 0), currency, fx), currency), [currency, fx]);
  const clsLabel = useCallback((c) => L(ALLOCATION_CLASS_LABEL_KEY[c], c), [L]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [p, a] = await Promise.all([api.get("/portfolio"), api.get("/allocation")]);
        if (cancel) return;
        setAssets((p.data.assets || []).filter((x) => Number(x.value_usd || 0) > 0));
        setSummary(p.data.summary || null);
        setOverrides(a.data.overrides || {});
        setAssetTargets(a.data.asset_targets || {});
        setSavedTargets(a.data.targets || {});
        setGroupDraft(a.data.targets || {});
      } catch (e) {
        toast.error(L("alloc2.load_error", "Falha ao carregar a alocação"));
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [L]);

  useEffect(() => {
    const syms = [...new Set(assets
      .filter((x) => !["crypto", "cash"].includes(x.asset_type))
      .map((x) => (x.symbol || "").toUpperCase()))].filter(Boolean);
    if (!syms.length) return;
    let cancel = false;
    api.post("/allocation/sectors", { symbols: syms })
      .then((r) => { if (!cancel) setSectors(r.data || {}); })
      .catch(() => {});
    return () => { cancel = true; };
  }, [assets]);

  const totalValue = useMemo(
    () => assets.reduce((s, a) => s + Number(a.value_usd || 0), 0),
    [assets]);

  const classesPresent = useMemo(() => {
    const set = new Set(assets.map((a) => effectiveClass(a, overrides) || "other"));
    return ALLOCATION_CLASSES.filter((c) => set.has(c))
      .concat([...set].filter((c) => !ALLOCATION_CLASSES.includes(c)));
  }, [assets, overrides]);

  useEffect(() => {
    if (!activeTab && classesPresent.length) setActiveTab(classesPresent[0]);
  }, [classesPresent, activeTab]);

  const groupPie = useMemo(() => classesPresent.map((c) => {
    const val = assets.filter((a) => (effectiveClass(a, overrides) || "other") === c)
      .reduce((s, a) => s + Number(a.value_usd || 0), 0);
    return { cls: c, name: clsLabel(c), value: val, pct: totalValue ? val / totalValue * 100 : 0 };
  }), [classesPresent, assets, overrides, totalValue, clsLabel]);

  const draftSum = useMemo(
    () => Object.values(groupDraft).reduce((s, v) => s + Number(v || 0), 0),
    [groupDraft]);

  const rows = useMemo(() => {
    if (!activeTab) return [];
    const inClass = assets.filter((a) => (effectiveClass(a, overrides) || "other") === activeTab);
    const groupTarget = Number(savedTargets[activeTab] || 0);
    const locked = inClass.filter((a) => assetTargets[(a.symbol || "").toUpperCase()]?.locked);
    const sumLocked = locked.reduce((s, a) => s + Number(assetTargets[(a.symbol || "").toUpperCase()].pct || 0), 0);
    const unlockedN = inClass.length - locked.length;
    const perUnlocked = unlockedN > 0 ? Math.max(0, groupTarget - sumLocked) / unlockedN : 0;
    return inClass.map((a) => {
      const sym = (a.symbol || "").toUpperCase();
      const lk = assetTargets[sym]?.locked;
      const sug = lk ? Number(assetTargets[sym].pct || 0) : perUnlocked;
      const atual = totalValue ? Number(a.value_usd || 0) / totalValue * 100 : 0;
      return {
        ...a, sym, locked: !!lk, sug, atual,
        sector: sectors[sym] || null,
        orient: atual < sug - MARGIN ? "buy" : "wait",
      };
    }).sort((x, y) => y.value_usd - x.value_usd);
  }, [activeTab, assets, overrides, savedTargets, assetTargets, totalValue, sectors]);

  const groupOver = useMemo(() => {
    if (!activeTab) return false;
    const locked = rows.filter((r) => r.locked);
    const sumLocked = locked.reduce((s, r) => s + r.sug, 0);
    return sumLocked > Number(savedTargets[activeTab] || 0) + 0.01;
  }, [rows, activeTab, savedTargets]);

  const saveGroups = async () => {
    if (Math.abs(draftSum - 100) > 0.5) {
      toast.error((L("alloc2.sum_must_100", "A soma tem de dar 100% (está em {v}%)")).replace("{v}", draftSum.toFixed(1)));
      return;
    }
    const clean = {};
    Object.entries(groupDraft).forEach(([k, v]) => { if (Number(v) > 0) clean[k] = Number(v); });
    try {
      await api.put("/allocation/target", { targets: clean });
      setSavedTargets(clean);
      toast.success(L("alloc2.saved", "Alvos guardados"));
    } catch { toast.error(L("alloc2.save_error", "Falha ao guardar")); }
  };

  const toggleLock = async (row) => {
    const sym = row.sym;
    if (row.locked) {
      setAssetTargets((p) => { const n = { ...p }; delete n[sym]; return n; });
      try { await api.put("/allocation/asset-target", { symbol: sym, locked: false }); }
      catch { toast.error(L("alloc2.save_error", "Falha ao guardar")); }
    } else {
      const pct = Number(row.sug.toFixed(2));
      setAssetTargets((p) => ({ ...p, [sym]: { pct, locked: true } }));
      try { await api.put("/allocation/asset-target", { symbol: sym, pct, locked: true }); }
      catch { toast.error(L("alloc2.save_error", "Falha ao guardar")); }
    }
  };

  const editLocked = (sym, pct) => {
    const v = Math.max(0, Math.min(100, Number(pct) || 0));
    setAssetTargets((p) => ({ ...p, [sym]: { pct: v, locked: true } }));
  };
  const commitLocked = async (sym) => {
    const v = Number(assetTargets[sym]?.pct || 0);
    try { await api.put("/allocation/asset-target", { symbol: sym, pct: v, locked: true }); }
    catch { toast.error(L("alloc2.save_error", "Falha ao guardar")); }
  };

  // Reclassificar um símbolo para outro grupo (ex.: BTC classificado como "stock"
  // -> "crypto"). Usa o override por símbolo (aplica-se a todas as carteiras).
  const reclassify = async (sym, cls) => {
    setOverrides((prev) => ({ ...prev, [sym]: cls }));
    try { await api.put("/allocation/override", { symbol: sym, class: cls }); }
    catch { toast.error(L("alloc2.save_error", "Falha ao guardar")); }
  };

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center font-mono text-sm">{L("common.loading", "A carregar…")}</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white px-4 sm:px-6 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <PieIcon className="w-5 h-5 text-blue-400" />
          <h1 className="font-display text-3xl sm:text-4xl font-light tracking-tight text-zinc-50">
            {L("nav.allocation", "Alocação")}
          </h1>
        </div>
        <p className="text-sm text-zinc-400 mb-8">
          {L("alloc2.subtitle", "Define a % por grupo e por ativo. Dentro do grupo divide-se automático — fixa os que quiseres.")}
        </p>

        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-5 mb-6">
          <div className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-400 mb-4">
            {L("alloc2.by_group", "Alocação por grupos")}
          </div>
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            <div className="w-full lg:w-56 h-56 relative shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={groupPie} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={58} outerRadius={92} paddingAngle={2} stroke="#09090b"
                    label={renderPieSliceLabel} labelLine={false}>
                    {groupPie.map((e, i) => (
                      <Cell key={i} fill={ALLOCATION_CLASS_COLOR[e.cls] || ALLOCATION_CLASS_COLOR.other} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-sm font-mono text-zinc-300">{money(totalValue)}</div>
                <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">{L("dash.balance", "Total")}</div>
              </div>
            </div>

            <div className="flex-1 w-full">
              {classesPresent.map((c) => (
                <div key={c} className="flex items-center gap-3 py-1.5 border-b border-zinc-800/50">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: ALLOCATION_CLASS_COLOR[c] || ALLOCATION_CLASS_COLOR.other }} />
                  <span className="text-sm text-zinc-200 flex-1">{clsLabel(c)}</span>
                  <span className="text-[11px] font-mono text-zinc-500">
                    {(groupPie.find((g) => g.cls === c)?.pct || 0).toFixed(1)}% {L("alloc2.now", "atual")}
                  </span>
                  <div className="flex items-center gap-1">
                    <input type="number" min="0" max="100" step="0.5"
                      value={groupDraft[c] ?? ""} placeholder="0"
                      onChange={(e) => setGroupDraft((p) => ({ ...p, [c]: e.target.value }))}
                      className="w-16 text-right font-mono text-sm bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-zinc-100 focus:border-blue-500 outline-none" />
                    <span className="text-xs text-zinc-500">%</span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between mt-3">
                <span className={`text-sm font-mono ${Math.abs(draftSum - 100) <= 0.5 ? "text-emerald-400" : "text-amber-400"}`}>
                  {L("alloc2.total", "Total")}: {draftSum.toFixed(1)}% {Math.abs(draftSum - 100) <= 0.5 ? "OK" : `(${(100 - draftSum).toFixed(1)}% ${L("alloc2.missing", "em falta")})`}
                </span>
                <button onClick={saveGroups}
                  className="text-sm px-4 py-1.5 rounded-md bg-blue-500 text-zinc-950 font-medium hover:bg-blue-400 transition-colors disabled:opacity-40"
                  disabled={Math.abs(draftSum - 100) > 0.5}>
                  {L("common.save", "Guardar")}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {classesPresent.map((c) => (
                <button key={c} onClick={() => setActiveTab(c)}
                  className={`text-xs font-mono px-3 py-1.5 rounded-md transition-colors ${activeTab === c ? "bg-blue-500/20 text-blue-300 border border-blue-500/40" : "text-zinc-400 hover:text-zinc-200 border border-transparent"}`}>
                  {clsLabel(c)}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-md border border-zinc-800 bg-zinc-900/60 p-0.5">
              {["basic", "full"].map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-2.5 py-1 text-[11px] font-mono rounded transition ${mode === m ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"}`}>
                  {m === "basic" ? (L("alloc2.basic", "Básico")) : (L("alloc2.full", "Completo"))}
                </button>
              ))}
            </div>
          </div>

          {groupOver && (
            <div className="text-[11px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2 mb-3">
              {L("alloc2.over_group", "Os ativos fixados somam mais do que o alvo deste grupo — sobe o grupo ou baixa um ativo.")}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono border-b border-zinc-800">
                  <th className="text-left py-2 px-2 w-8"></th>
                  <th className="text-left py-2 px-2">{L("alloc2.asset", "Ativo")}</th>
                  {mode === "full" && <th className="text-left py-2 px-2">{L("alloc2.sector", "Setor")}</th>}
                  {mode === "full" && <th className="text-right py-2 px-2">{L("alloc2.qty", "Qtd")}</th>}
                  <th className="text-right py-2 px-2">{L("alloc2.avg_price", "Preço Médio")}</th>
                  {mode === "full" && <th className="text-right py-2 px-2">{L("alloc2.price", "Cotação")}</th>}
                  {mode === "full" && <th className="text-right py-2 px-2">{L("alloc2.value", "Valor Real")}</th>}
                  {mode === "full" && <th className="text-right py-2 px-2">{L("alloc2.return", "Retorno")}</th>}
                  <th className="text-right py-2 px-2">{L("alloc2.pct_now", "% Atual")}</th>
                  <th className="text-right py-2 px-2">{L("alloc2.pct_sug", "% Sugerida")}</th>
                  <th className="text-left py-2 px-2">{L("alloc2.orient", "Orient.")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.sym + r.wallet_id} className="border-b border-zinc-800/40 hover:bg-zinc-900/40">
                    <td className="py-2.5 px-2">
                      <button onClick={() => toggleLock(r)} title={r.locked ? "Desbloquear" : "Fixar"}>
                        {r.locked ? <Lock className="w-4 h-4 text-amber-400" /> : <Unlock className="w-4 h-4 text-zinc-600 hover:text-zinc-400" />}
                      </button>
                    </td>
                    <td className="py-2.5 px-2 font-mono">
                      <span className="font-bold text-zinc-100">{r.symbol}</span>
                      {r.name && <span className="text-zinc-500 ml-2 text-xs">{r.name}</span>}
                      <select value={effectiveClass(r, overrides)} onChange={(e) => reclassify(r.sym, e.target.value)}
                        title={L("alloc2.reclassify", "Mudar de grupo")}
                        className="ml-2 text-[10px] bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-zinc-500 hover:text-zinc-300 outline-none cursor-pointer align-middle">
                        {ALLOCATION_CLASSES.map((c) => <option key={c} value={c}>{clsLabel(c)}</option>)}
                      </select>
                    </td>
                    {mode === "full" && <td className="py-2.5 px-2 text-zinc-400 text-xs">{r.sector || "—"}</td>}
                    {mode === "full" && <td className="py-2.5 px-2 text-right font-mono text-zinc-300">{Number(r.quantity || 0)}</td>}
                    <td className="py-2.5 px-2 text-right font-mono text-amber-400">{money(r.avg_price)}</td>
                    {mode === "full" && <td className="py-2.5 px-2 text-right font-mono text-zinc-300">{money(r.price_usd)}</td>}
                    {mode === "full" && <td className="py-2.5 px-2 text-right font-mono text-zinc-200">{money(r.value_usd)}</td>}
                    {mode === "full" && <td className={`py-2.5 px-2 text-right font-mono ${r.pnl_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{r.pnl_pct >= 0 ? "+" : ""}{Number(r.pnl_pct || 0).toFixed(1)}%</td>}
                    <td className="py-2.5 px-2 text-right font-mono text-zinc-300">{r.atual.toFixed(2)}%</td>
                    <td className="py-2.5 px-2 text-right font-mono">
                      {r.locked ? (
                        <span className="inline-flex items-center gap-1">
                          <input type="number" min="0" max="100" step="0.5"
                            value={assetTargets[r.sym]?.pct ?? ""}
                            onChange={(e) => editLocked(r.sym, e.target.value)}
                            onBlur={() => commitLocked(r.sym)}
                            className="w-16 text-right font-mono text-xs bg-amber-500/10 border border-amber-500/40 rounded px-2 py-0.5 text-amber-300 outline-none" />
                          <span className="text-xs text-zinc-500">%</span>
                        </span>
                      ) : (
                        <span className="text-zinc-400">{r.sug.toFixed(2)}% <span className="text-[9px] text-zinc-600">auto</span></span>
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.orient === "buy" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40" : "bg-rose-500/15 text-rose-400 border border-rose-500/40"}`}>
                        {r.orient === "buy" ? (L("alloc2.buy", "Comprar")) : (L("alloc2.wait", "Aguardar"))}
                      </span>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr><td colSpan={12} className="py-6 text-center text-zinc-500 font-mono text-sm">{L("alloc2.empty", "Sem ativos neste grupo.")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

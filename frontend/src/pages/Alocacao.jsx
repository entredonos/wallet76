import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Lock, Unlock, PieChart as PieIcon, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useI18n } from "../context/I18nContext";
import { fmtCurrency, fmtCompact, fmtQty, fmtPriceSmart, convert } from "../lib/format";
import {
  ALLOCATION_CLASSES, ALLOCATION_CLASS_LABEL_KEY, ALLOCATION_CLASS_COLOR, effectiveClass,
} from "../lib/allocation";
import { WALLET_DOT_CLASS, walletColorKey } from "../lib/walletColors";
import { renderPieSliceLabel } from "../constants/dashboardConstants";
import { usePlan } from "../hooks/usePlan";
import UpgradeOverlay from "../components/UpgradeOverlay";

// Página "Alocação" (Portfólio → Alocação) — alocação-alvo a 2 níveis.
// Nível 1: % por grupo/classe (donut + editor, soma 100%).
// Nível 2: dentro de cada aba, a % de cada ATIVO divide-se automaticamente por
// igual; cada ativo pode ser FIXADO (cadeado) e os não-fixados reajustam-se.
// O mesmo ativo em várias carteiras é AGREGADO numa linha só (1 ativo = 1 alvo);
// a repartição por carteira aparece ao expandir.
const MARGIN = 0.5; // margem para "Comprar" vs "Aguardar"

export default function Alocacao({ currency = "USD" }) {
  const { t } = useI18n();
  const { isPro } = usePlan();
  const L = useCallback((key, fb) => { const v = t(key); return v && v !== key ? v : fb; }, [t]);
  const [assets, setAssets] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [summary, setSummary] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [assetTargets, setAssetTargets] = useState({});
  const [sectors, setSectors] = useState({});
  const [groupDraft, setGroupDraft] = useState({});
  const [savedTargets, setSavedTargets] = useState({});
  const [activeTab, setActiveTab] = useState(null);
  const [mode, setMode] = useState("basic");
  const [loading, setLoading] = useState(true);
  const [mobileMode, setMobileMode] = useState("list"); // telemóvel: lista densa vs slide
  const [slideIdx, setSlideIdx] = useState(0);
  const [expanded, setExpanded] = useState({});
  const touchX = useRef(null);

  const fx = summary?.fx_rates || {};
  const money = useCallback((usd) => fmtCurrency(convert(Number(usd || 0), currency, fx), currency), [currency, fx]);
  const moneyK = useCallback((usd) => fmtCompact(convert(Number(usd || 0), currency, fx), currency), [currency, fx]);
  const price = useCallback((usd) => fmtPriceSmart(convert(Number(usd || 0), currency, fx), currency), [currency, fx]);
  const clsLabel = useCallback((c) => L(ALLOCATION_CLASS_LABEL_KEY[c], c), [L]);
  const walletName = useCallback((id) => wallets.find((w) => w.id === id)?.name || L("alloc2.wallet", "Carteira"), [wallets, L]);
  const walletDot = useCallback((id) => WALLET_DOT_CLASS[walletColorKey(wallets, id)] || "bg-zinc-500", [wallets]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [p, a] = await Promise.all([api.get("/portfolio"), api.get("/allocation")]);
        if (cancel) return;
        setAssets((p.data.assets || []).filter((x) => Number(x.value_usd || 0) > 0));
        setWallets(p.data.wallets || []);
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

  useEffect(() => { setSlideIdx(0); }, [activeTab]);

  const groupPie = useMemo(() => classesPresent.map((c) => {
    const val = assets.filter((a) => (effectiveClass(a, overrides) || "other") === c)
      .reduce((s, a) => s + Number(a.value_usd || 0), 0);
    return { cls: c, name: clsLabel(c), value: val, pct: totalValue ? val / totalValue * 100 : 0 };
  }), [classesPresent, assets, overrides, totalValue, clsLabel]);

  const draftSum = useMemo(
    () => Object.values(groupDraft).reduce((s, v) => s + Number(v || 0), 0),
    [groupDraft]);

  // Linhas do Nível 2: agregadas por símbolo (o mesmo ativo em várias carteiras
  // = 1 linha). Soma quantidade/valor/custo; PM = custo/quantidade (média
  // ponderada). Isto também corrige o alvo: cada ativo conta 1× (não 1× por
  // carteira). A repartição por carteira fica em `wallets`.
  const rows = useMemo(() => {
    if (!activeTab) return [];
    const inClass = assets.filter((a) => (effectiveClass(a, overrides) || "other") === activeTab);
    const bySym = new Map();
    inClass.forEach((a) => {
      const sym = (a.symbol || "").toUpperCase();
      if (!sym) return;
      let g = bySym.get(sym);
      if (!g) {
        g = { sym, symbol: a.symbol, name: a.name, asset_type: a.asset_type,
              quantity: 0, value_usd: 0, cost_usd: 0, price_usd: Number(a.price_usd || 0), wallets: [] };
        bySym.set(sym, g);
      }
      const q = Number(a.quantity || 0);
      const v = Number(a.value_usd || 0);
      const c = a.cost_usd != null ? Number(a.cost_usd) : Number(a.avg_price || 0) * q;
      g.quantity += q;
      g.value_usd += v;
      g.cost_usd += c;
      if (Number(a.price_usd)) g.price_usd = Number(a.price_usd);
      g.wallets.push({ id: a.wallet_id, quantity: q, value_usd: v });
    });
    const groups = [...bySym.values()].map((g) => ({
      ...g,
      avg_price: g.quantity ? g.cost_usd / g.quantity : 0,
      pnl_pct: g.cost_usd ? (g.value_usd - g.cost_usd) / g.cost_usd * 100 : 0,
    }));

    const groupTarget = Number(savedTargets[activeTab] || 0);
    const lockedGroups = groups.filter((g) => assetTargets[g.sym]?.locked);
    const sumLocked = lockedGroups.reduce((s, g) => s + Number(assetTargets[g.sym].pct || 0), 0);
    const unlockedN = groups.length - lockedGroups.length;
    const perUnlocked = unlockedN > 0 ? Math.max(0, groupTarget - sumLocked) / unlockedN : 0;

    return groups.map((g) => {
      const lk = assetTargets[g.sym]?.locked;
      const sug = lk ? Number(assetTargets[g.sym].pct || 0) : perUnlocked;
      const atual = totalValue ? g.value_usd / totalValue * 100 : 0;
      return { ...g, locked: !!lk, sug, atual, sector: sectors[g.sym] || null,
               orient: atual < sug - MARGIN ? "buy" : "wait" };
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

  const toggleExpand = (sym) => setExpanded((p) => ({ ...p, [sym]: !p[sym] }));

  // Modo slide (telemóvel): navegação por gesto de arrastar.
  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (dx < -40) setSlideIdx((i) => Math.min(i + 1, rows.length - 1));
    else if (dx > 40) setSlideIdx((i) => Math.max(i - 1, 0));
    touchX.current = null;
  };

  const orientChip = (r, big) => (
    <span className={`${big ? "text-[11px] px-3 py-1" : "text-[9px] px-2 py-0.5"} font-bold rounded-full shrink-0 ${r.orient === "buy" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40" : "bg-rose-500/15 text-rose-400 border border-rose-500/40"}`}>
      {r.orient === "buy" ? L("alloc2.buy", "Comprar") : L("alloc2.wait", "Aguardar")}
    </span>
  );

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center font-mono text-sm">{L("common.loading", "A carregar…")}</div>;
  }

  const colCount = mode === "full" ? 12 : 7;

  return (
    <div className="min-h-screen bg-zinc-950 text-white px-4 sm:px-6 py-8 relative">
      {!isPro && <UpgradeOverlay feature={L("nav.allocation", "Alocação")} />}
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
          {/* Telemóvel: Básico/Completo + Lista/Slide na mesma linha, por cima das abas. */}
          <div className="sm:hidden flex items-center gap-2 mb-3">
            <div className="inline-flex rounded-md border border-zinc-800 bg-zinc-900/60 p-0.5">
              {["basic", "full"].map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-2.5 py-1 text-[11px] font-mono rounded transition ${mode === m ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"}`}>
                  {m === "basic" ? L("alloc2.basic", "Básico") : L("alloc2.full", "Completo")}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-md border border-zinc-800 bg-zinc-900/60 p-0.5">
              {["list", "slide"].map((m) => (
                <button key={m} onClick={() => setMobileMode(m)}
                  className={`px-3 py-1 text-[11px] font-mono rounded transition ${mobileMode === m ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"}`}>
                  {m === "list" ? L("alloc2.list", "Lista") : L("alloc2.slide", "Slide")}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {classesPresent.map((c) => (
                <button key={c} onClick={() => setActiveTab(c)}
                  className={`text-xs font-mono px-3 py-1.5 rounded-md transition-colors ${activeTab === c ? "bg-blue-500/20 text-blue-300 border border-blue-500/40" : "text-zinc-400 hover:text-zinc-200 border border-transparent"}`}>
                  {clsLabel(c)}
                </button>
              ))}
            </div>
            <div className="hidden sm:inline-flex rounded-md border border-zinc-800 bg-zinc-900/60 p-0.5">
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

          {/* ===== PC: tabela ===== */}
          <div className="overflow-x-auto hidden sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono border-b border-zinc-800">
                  <th className="text-left py-2 px-2 w-8"></th>
                  <th className="text-left py-2 px-2">{L("alloc2.asset", "Ativo")}</th>
                  <th className="text-left py-2 px-2">{L("alloc2.group", "Grupo")}</th>
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
                {rows.map((r) => {
                  const multi = r.wallets.length > 1;
                  const open = !!expanded[r.sym];
                  return (
                    <React.Fragment key={r.sym}>
                      <tr className="border-b border-zinc-800/40 hover:bg-zinc-900/40">
                        <td className="py-2.5 px-2">
                          <button onClick={() => toggleLock(r)} title={r.locked ? "Desbloquear" : "Fixar"}>
                            {r.locked ? <Lock className="w-4 h-4 text-amber-400" /> : <Unlock className="w-4 h-4 text-zinc-600 hover:text-zinc-400" />}
                          </button>
                        </td>
                        <td className="py-2.5 px-2 font-mono">
                          <span className="font-bold text-zinc-100">{r.symbol}</span>
                          {r.name && <span className="text-zinc-500 ml-2 text-xs">{r.name}</span>}
                          {multi && (
                            <button onClick={() => toggleExpand(r.sym)}
                              className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-blue-400/80 hover:text-blue-300 align-middle">
                              <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
                              {r.wallets.length} {L("alloc2.wallets", "carteiras")}
                            </button>
                          )}
                        </td>
                        <td className="py-2.5 px-2">
                          <select value={effectiveClass(r, overrides)} onChange={(e) => reclassify(r.sym, e.target.value)}
                            title={L("alloc2.reclassify", "Mudar de grupo")}
                            className="text-[10px] font-mono bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-zinc-400 hover:text-zinc-200 outline-none cursor-pointer">
                            {ALLOCATION_CLASSES.map((c) => <option key={c} value={c}>{clsLabel(c)}</option>)}
                          </select>
                        </td>
                        {mode === "full" && <td className="py-2.5 px-2 text-zinc-400 text-xs">{r.sector || "—"}</td>}
                        {mode === "full" && <td className="py-2.5 px-2 text-right font-mono text-zinc-300">{fmtQty(r.quantity)}</td>}
                        <td className="py-2.5 px-2 text-right font-mono text-amber-400">{price(r.avg_price)}</td>
                        {mode === "full" && <td className="py-2.5 px-2 text-right font-mono text-zinc-300">{price(r.price_usd)}</td>}
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
                        <td className="py-2.5 px-2">{orientChip(r)}</td>
                      </tr>
                      {multi && open && (
                        <tr className="bg-zinc-950/40">
                          <td></td>
                          <td colSpan={colCount - 1} className="px-2 pb-2.5">
                            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-mono text-zinc-400">
                              {r.wallets.map((w, i) => (
                                <span key={i} className="inline-flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full ${walletDot(w.id)}`} />
                                  <span className="text-zinc-300">{walletName(w.id)}</span>
                                  <span className="text-zinc-500">{fmtQty(w.quantity)} · {money(w.value_usd)}</span>
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {!rows.length && (
                  <tr><td colSpan={colCount} className="py-6 text-center text-zinc-500 font-mono text-sm">{L("alloc2.empty", "Sem ativos neste grupo.")}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ===== Telemóvel (Opção E): lista densa + modo slide ===== */}
          <div className="sm:hidden">
            {mobileMode === "list" ? (
              <div className="overflow-x-auto -mx-1">
                <table className="min-w-max text-[11px] font-mono border-separate border-spacing-0">
                  <thead>
                    <tr className="text-[9px] uppercase tracking-wide text-zinc-500">
                      <th className="sticky left-0 z-20 bg-zinc-950 text-left py-2 pr-3 pl-1 border-b border-zinc-800">{L("alloc2.asset", "Ativo")}</th>
                      <th className="text-left px-2 py-2 border-b border-zinc-800">{L("alloc2.group", "Grupo")}</th>
                      {mode === "full" && <th className="text-left px-2 py-2 border-b border-zinc-800">{L("alloc2.sector", "Setor")}</th>}
                      {mode === "full" && <th className="text-right px-2 py-2 border-b border-zinc-800">{L("alloc2.qty", "Qtd")}</th>}
                      <th className="text-right px-2 py-2 border-b border-zinc-800">{L("alloc2.avg_price_short", "PM")}</th>
                      {mode === "full" && <th className="text-right px-2 py-2 border-b border-zinc-800">{L("alloc2.price", "Cotação")}</th>}
                      {mode === "full" && <th className="text-right px-2 py-2 border-b border-zinc-800">{L("alloc2.value_short", "Valor")}</th>}
                      {mode === "full" && <th className="text-right px-2 py-2 border-b border-zinc-800">{L("alloc2.return", "Retorno")}</th>}
                      <th className="text-right px-2 py-2 border-b border-zinc-800">{L("alloc2.pct_now_short", "% At")}</th>
                      <th className="text-right px-2 py-2 border-b border-zinc-800">{L("alloc2.pct_sug_short", "% Sug")}</th>
                      <th className="text-left px-2 py-2 border-b border-zinc-800">{L("alloc2.orient", "Orient.")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, ri) => {
                      const multi = r.wallets.length > 1;
                      const open = !!expanded[r.sym];
                      const bg = ri % 2 ? "bg-zinc-900" : "bg-zinc-950"; // xadrez (opaco p/ coluna fixa)
                      return (
                        <React.Fragment key={r.sym}>
                          <tr className={bg}>
                            <td className={`sticky left-0 z-10 ${bg} py-2 pr-3 pl-1 whitespace-nowrap`}>
                              <button onClick={() => toggleLock(r)} className="mr-1 align-middle">
                                {r.locked ? <Lock className="w-3.5 h-3.5 text-amber-400 inline" /> : <Unlock className="w-3.5 h-3.5 text-zinc-600 inline" />}
                              </button>
                              <span className="font-bold text-zinc-100">{r.symbol}</span>
                              {multi && (
                                <button onClick={() => toggleExpand(r.sym)} className="ml-1 inline-flex items-center align-middle text-[9px] text-blue-400/80">
                                  <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />{r.wallets.length}
                                </button>
                              )}
                            </td>
                            <td className="px-2 py-2">
                              <select value={effectiveClass(r, overrides)} onChange={(e) => reclassify(r.sym, e.target.value)}
                                className="text-[10px] font-mono bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-zinc-400 outline-none">
                                {ALLOCATION_CLASSES.map((c) => <option key={c} value={c}>{clsLabel(c)}</option>)}
                              </select>
                            </td>
                            {mode === "full" && <td className="px-2 py-2 text-zinc-400 whitespace-nowrap">{r.sector || "—"}</td>}
                            {mode === "full" && <td className="px-2 py-2 text-right text-zinc-300 whitespace-nowrap">{fmtQty(r.quantity)}</td>}
                            <td className="px-2 py-2 text-right text-amber-400 whitespace-nowrap">{price(r.avg_price)}</td>
                            {mode === "full" && <td className="px-2 py-2 text-right text-zinc-300 whitespace-nowrap">{price(r.price_usd)}</td>}
                            {mode === "full" && <td className="px-2 py-2 text-right text-zinc-200 whitespace-nowrap">{money(r.value_usd)}</td>}
                            {mode === "full" && <td className={`px-2 py-2 text-right whitespace-nowrap ${r.pnl_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{r.pnl_pct >= 0 ? "+" : ""}{Number(r.pnl_pct || 0).toFixed(1)}%</td>}
                            <td className="px-2 py-2 text-right text-zinc-300 whitespace-nowrap">{r.atual.toFixed(2)}%</td>
                            <td className="px-2 py-2 text-right whitespace-nowrap">
                              {r.locked ? (
                                <input type="number" min="0" max="100" step="0.5" value={assetTargets[r.sym]?.pct ?? ""}
                                  onChange={(e) => editLocked(r.sym, e.target.value)} onBlur={() => commitLocked(r.sym)}
                                  className="w-14 text-right bg-amber-500/10 border border-amber-500/40 rounded px-1.5 py-0.5 text-amber-300 outline-none" />
                              ) : (<span className="text-zinc-400">{r.sug.toFixed(2)}% <span className="text-[8px] text-zinc-600">auto</span></span>)}
                            </td>
                            <td className="px-2 py-2">{orientChip(r)}</td>
                          </tr>
                          {multi && open && (
                            <tr className={bg}>
                              <td className={`sticky left-0 z-10 ${bg}`}></td>
                              <td colSpan={colCount - 1} className="px-2 pb-2">
                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-400">
                                  {r.wallets.map((w, i) => (
                                    <span key={i} className="inline-flex items-center gap-1">
                                      <span className={`w-2 h-2 rounded-full ${walletDot(w.id)}`} />
                                      <span className="text-zinc-300">{walletName(w.id)}</span> {fmtQty(w.quantity)} · {money(w.value_usd)}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {!rows.length && (
                      <tr><td colSpan={colCount} className="py-6 text-center text-zinc-500">{L("alloc2.empty", "Sem ativos neste grupo.")}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            
            ) : (
              rows.length ? (() => {
                const idx = Math.min(slideIdx, rows.length - 1);
                const r = rows[idx];
                const multi = r.wallets.length > 1;
                return (
                  <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
                    className="bg-gradient-to-b from-zinc-900/70 to-zinc-950/40 border border-zinc-800/70 rounded-2xl p-5">
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleLock(r)}>
                        {r.locked ? <Lock className="w-5 h-5 text-amber-400" /> : <Unlock className="w-5 h-5 text-zinc-600" />}
                      </button>
                      <span className="text-2xl font-bold font-mono text-zinc-50">{r.symbol}</span>
                      {r.name && <span className="text-zinc-500 text-xs truncate">{r.name}</span>}
                      <span className="ml-auto">{orientChip(r, true)}</span>
                    </div>
                    <div className="mt-4 font-mono text-[13px]">
                      <div className="flex justify-between py-2 border-b border-zinc-800/60"><span className="text-zinc-500">{L("alloc2.avg_price", "Preço Médio")}</span><span className="text-amber-400">{price(r.avg_price)}</span></div>
                      <div className="flex justify-between py-2 border-b border-zinc-800/60"><span className="text-zinc-500">{L("alloc2.pct_now", "% Atual")}</span><span className="text-zinc-200">{r.atual.toFixed(2)}%</span></div>
                      <div className="flex justify-between py-2 border-b border-zinc-800/60 items-center">
                        <span className="text-zinc-500">{L("alloc2.pct_sug", "% Sugerida")}</span>
                        {r.locked ? (
                          <span className="inline-flex items-center gap-1">
                            <input type="number" min="0" max="100" step="0.5" value={assetTargets[r.sym]?.pct ?? ""}
                              onChange={(e) => editLocked(r.sym, e.target.value)} onBlur={() => commitLocked(r.sym)}
                              className="w-16 text-right bg-amber-500/10 border border-amber-500/40 rounded px-2 py-0.5 text-amber-300 outline-none" />
                            <span className="text-zinc-500">%</span>
                          </span>
                        ) : (<span className="text-zinc-200">{r.sug.toFixed(2)}% <span className="text-[9px] text-zinc-600">auto</span></span>)}
                      </div>
                      <div className="flex justify-between py-2 items-center">
                        <span className="text-zinc-500">{L("alloc2.group", "Grupo")}</span>
                        <select value={effectiveClass(r, overrides)} onChange={(e) => reclassify(r.sym, e.target.value)}
                          className="text-[11px] font-mono bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-300 outline-none">
                          {ALLOCATION_CLASSES.map((c) => <option key={c} value={c}>{clsLabel(c)}</option>)}
                        </select>
                      </div>
                      {multi && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-2 text-[10px] text-zinc-500">
                          {r.wallets.map((w, i) => (
                            <span key={i} className="inline-flex items-center gap-1">
                              <span className={`w-2 h-2 rounded-full ${walletDot(w.id)}`} />
                              {walletName(w.id)} {fmtQty(w.quantity)}
                            </span>
                          ))}
                        </div>
                      )}
                      {mode === "full" && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-[11px] text-zinc-500">
                          <span>Qtd {fmtQty(r.quantity)}</span>
                          <span>{L("alloc2.value_short", "Valor")} {money(r.value_usd)}</span>
                          <span className={r.pnl_pct >= 0 ? "text-emerald-400" : "text-rose-400"}>{r.pnl_pct >= 0 ? "+" : ""}{Number(r.pnl_pct || 0).toFixed(1)}%</span>
                          {r.sector && <span>{r.sector}</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-4">
                      <button onClick={() => setSlideIdx(Math.max(idx - 1, 0))} disabled={idx === 0} className="text-zinc-400 disabled:opacity-30 px-3 py-1 text-xl leading-none">‹</button>
                      <div className="flex gap-1.5 flex-wrap justify-center px-2">
                        {rows.map((_, i) => (
                          <span key={i} onClick={() => setSlideIdx(i)} className={`h-1.5 rounded-full cursor-pointer transition-all ${i === idx ? "w-4 bg-blue-400" : "w-1.5 bg-zinc-700"}`} />
                        ))}
                      </div>
                      <button onClick={() => setSlideIdx(Math.min(idx + 1, rows.length - 1))} disabled={idx === rows.length - 1} className="text-zinc-400 disabled:opacity-30 px-3 py-1 text-xl leading-none">›</button>
                    </div>
                    <div className="text-center text-[10px] text-zinc-600 font-mono mt-1">{idx + 1} / {rows.length}</div>
                  </div>
                );
              })() : <div className="py-6 text-center text-zinc-500 font-mono text-sm">{L("alloc2.empty", "Sem ativos neste grupo.")}</div>
            )}
          </div>

          {/* ===== Totais — PC: badges à direita; telemóvel (T2): 3 lado a lado ===== */}
          <div className="hidden sm:flex flex-wrap justify-end gap-3 mt-5 pt-4 border-t border-zinc-800/60">
            <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg px-4 py-2 text-right">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">{L("alloc2.invested", "Total Investido")}</div>
              <div className="text-base font-mono text-zinc-200">{money(summary?.total_cost_usd || 0)}</div>
            </div>
            <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg px-4 py-2 text-right">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">{L("alloc2.available", "Total Disponível")}</div>
              <div className="text-base font-mono text-zinc-100">{money(totalValue)}</div>
            </div>
            <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg px-4 py-2 text-right">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">{L("alloc2.total_pct", "Percentagem Total")}</div>
              <div className={`text-base font-mono ${(summary?.total_pnl_pct || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {(summary?.total_pnl_pct || 0) >= 0 ? "+" : ""}{Number(summary?.total_pnl_pct || 0).toFixed(2)}%
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-zinc-800/60 sm:hidden">
            <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg px-2 py-2 text-center">
              <div className="text-[9px] uppercase tracking-wide text-zinc-500 font-mono">{L("alloc2.invested_short", "Investido")}</div>
              <div className="text-[13px] font-mono text-zinc-200 mt-0.5">{moneyK(summary?.total_cost_usd || 0)}</div>
            </div>
            <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg px-2 py-2 text-center">
              <div className="text-[9px] uppercase tracking-wide text-zinc-500 font-mono">{L("alloc2.available_short", "Disponível")}</div>
              <div className="text-[13px] font-mono text-zinc-100 mt-0.5">{moneyK(totalValue)}</div>
            </div>
            <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg px-2 py-2 text-center">
              <div className="text-[9px] uppercase tracking-wide text-zinc-500 font-mono">{L("alloc2.total_short", "Total")}</div>
              <div className={`text-[13px] font-mono mt-0.5 ${(summary?.total_pnl_pct || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{(summary?.total_pnl_pct || 0) >= 0 ? "+" : ""}{Number(summary?.total_pnl_pct || 0).toFixed(2)}%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
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
import Sparkline from "../components/Sparkline";
import GroupDistribution from "../components/GroupDistribution";

// Página "Alocação" (Portfólio → Alocação) — alocação-alvo a 2 níveis.
// Nível 1: % por grupo/classe (donut + editor, soma 100%).
// Nível 2: dentro de cada aba, a % de cada ATIVO divide-se automaticamente por
// igual; cada ativo pode ser FIXADO (cadeado) e os não-fixados reajustam-se.
// O mesmo ativo em várias carteiras é AGREGADO numa linha só (1 ativo = 1 alvo);
// a repartição por carteira aparece ao expandir.
const MARGIN = 0.5; // margem para "Comprar" vs "Aguardar"

// Colunas cujo primeiro clique ordena A->Z. Todas as outras sao numeros ou
// percentagens e comecam do MAIOR para o menor — ninguem abre uma carteira
// para ver primeiro o ativo mais pequeno.
const SORT_TEXT = ["symbol", "sector", "cls", "orient"];

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
  const [sparks, setSparks] = useState({});
  // Ordenacao da tabela (29 jul 2026). O estado inicial e o de sempre — por
  // valor, decrescente —, so que agora esta escrito e a seta mostra-o.
  const [sortKey, setSortKey] = useState("value_usd");
  const [sortDir, setSortDir] = useState("desc");
  // Vista de Acao + paginacao (1 ago 2026): actOpen expande os ativos de uma
  // classe na vista de acao; tPage e a pagina da tabela/lista (10 por pagina).
  const [actOpen, setActOpen] = useState({});
  const [tPage, setTPage] = useState(0);
  // Ver todos (4 ago 2026): desliga a paginacao de 10 dentro do grupo ativo.
  const [showAll, setShowAll] = useState(false);
  const nav = useNavigate();
  // Editor "Alocacao por grupos" nasce FECHADO (2 ago 2026, pedido do Jose):
  // quem so vem ver, ve o resumo por classe (barra do atual + risco do alvo +
  // chip de acao — a mesma linguagem da vista de Acao); quem vem editar abre.
  const [editTargets, setEditTargets] = useState(false);
  const touchX = useRef(null);

  const fx = summary?.fx_rates || {};
  const money = useCallback((usd) => fmtCurrency(convert(Number(usd || 0), currency, fx), currency), [currency, fx]);
  const moneyK = useCallback((usd) => fmtCompact(convert(Number(usd || 0), currency, fx), currency), [currency, fx]);
  const price = useCallback((usd) => fmtPriceSmart(convert(Number(usd || 0), currency, fx), currency), [currency, fx]);
  const clsLabel = useCallback((c) => L(ALLOCATION_CLASS_LABEL_KEY[c], c), [L]);
  const walletName = useCallback((id) => wallets.find((w) => w.id === id)?.name || L("alloc2.wallet", "Carteira"), [wallets, L]);
  const walletDot = useCallback((id) => WALLET_DOT_CLASS[walletColorKey(wallets, id)] || "bg-zinc-500", [wallets]);

  // Coluna da carteira: so o ponto da cor, que e a mesma cor que a carteira tem
  // no Dashboard, nos Top Movers e na pagina Carteiras — o nome vai no title,
  // porque escrito ocupava uma coluna inteira e no telemovel nao cabia.
  //
  // A coluna e a mais estreita da tabela de proposito (`w-px` faz a celula
  // encolher ate ao conteudo) e nao ordena: ordenar por carteira obrigava a
  // escolher uma das carteiras de um ativo que esta em varias, o que dava uma
  // ordem que ninguem conseguia prever. Quem quiser ver por carteira tem a
  // pagina Carteiras. Com o ativo em varias carteiras aparecem varios pontos, e
  // o "N carteiras" do lado do simbolo continua a abrir o detalhe.
  const walletDots = useCallback((r) => (
    <span className="inline-flex items-center justify-center gap-0.5">
      {(r.wallets || []).map((w, i) => (
        <span key={i} title={walletName(w.id)}
          className={`w-2 h-2 rounded-full ${walletDot(w.id)}`} />
      ))}
    </span>
  ), [walletDot, walletName]);

  // Valor pelo qual cada coluna ordena. O "\uffff" nos vazios (setor
  // desconhecido, ativo sem carteira) empurra-os para o fim em A->Z em vez de
  // os pôr à frente de tudo, que era o que uma string vazia fazia.
  const sortVal = useCallback((r, k) => {
    switch (k) {
      case "symbol": return (r.symbol || "\uffff").toUpperCase();
      case "sector": return (r.sector || "\uffff").toString().toUpperCase();
      case "cls": return clsLabel(effectiveClass(r, overrides) || "other").toUpperCase();
      case "orient": return r.orient === "buy" ? 0 : 1;
      case "change_24h": return Number(r.change_24h || 0);
      case "quantity": return Number(r.quantity || 0);
      case "avg_price": return Number(r.avg_price || 0);
      case "price_usd": return Number(r.price_usd || 0);
      case "cost_usd": return Number(r.cost_usd || 0);
      case "pnl_pct": return Number(r.pnl_pct || 0);
      case "atual": return Number(r.atual || 0);
      case "sug": return Number(r.sug || 0);
      default: return Number(r.value_usd || 0);
    }
  }, [clsLabel, overrides]);

  // Empate desfaz-se sempre pelo valor decrescente (e nao e invertido pelo
  // sortDir de proposito): duas linhas com o mesmo setor ou a mesma orientacao
  // aparecem pela ordem que a pagina sempre teve, em vez de saltarem de sitio
  // de cada vez que se carrega no cabecalho.
  const cmp = useCallback((x, y) => {
    const a = sortVal(x, sortKey);
    const b = sortVal(y, sortKey);
    let d = (typeof a === "string" || typeof b === "string")
      ? String(a).localeCompare(String(b))
      : a - b;
    if (sortDir === "desc") d = -d;
    if (d === 0) d = Number(y.value_usd || 0) - Number(x.value_usd || 0);
    return d;
  }, [sortVal, sortKey, sortDir]);

  const onSort = (k) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(SORT_TEXT.includes(k) ? "asc" : "desc"); }
  };

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

  // Sparklines da coluna "24h" (29 jul 2026). Pedido separado e best-effort: o
  // /sparklines e o mais lento dos tres e isto e um enfeite, por isso nunca
  // segura a pagina nem estraga nada se falhar — a percentagem, essa, ja vem
  // dentro do /portfolio e aparece de qualquer maneira.
  useEffect(() => {
    let cancel = false;
    api.get("/sparklines")
      .then((r) => { if (!cancel) setSparks(r.data || {}); })
      .catch(() => {});
    return () => { cancel = true; };
  }, []);

  // Volta ao primeiro cartao quando se muda de aba OU de ordenacao — senao o
  // slide ficava no indice 5 a mostrar um ativo completamente diferente.
  useEffect(() => { setSlideIdx(0); setTPage(0); }, [activeTab, sortKey, sortDir]);

  const groupPie = useMemo(() => classesPresent.map((c) => {
    const val = assets.filter((a) => (effectiveClass(a, overrides) || "other") === c)
      .reduce((s, a) => s + Number(a.value_usd || 0), 0);
    return { cls: c, name: clsLabel(c), value: val, pct: totalValue ? val / totalValue * 100 : 0 };
  }), [classesPresent, assets, overrides, totalValue, clsLabel]);

  // ---- Vista de Acao (1 ago 2026) ----------------------------------------
  // Por CLASSE, agrupado pela acao a tomar: Reforcar (abaixo do plano),
  // Aliviar (acima) e No alvo (a menos de ACT_MARGIN pontos). E a resposta a
  // "o que faco a seguir?" sem obrigar a ler a tabela; a ideia visual (duas
  // barras Alvo/Atual por classe) veio de uma foto que o Jose trouxe a
  // 1 ago 2026 — ver README 2. Os euros dizem QUANTO falta/sobra, que decide
  // mais do que os pontos percentuais.
  const ACT_MARGIN = 1;
  const actionGroups = useMemo(() => groupPie.map((g) => {
    const alvo = Number(savedTargets[g.cls] || 0);
    const delta = alvo - g.pct;
    return { ...g, alvo, delta, eur: totalValue * Math.abs(delta) / 100,
             color: ALLOCATION_CLASS_COLOR[g.cls] || ALLOCATION_CLASS_COLOR.other };
  }), [groupPie, savedTargets, totalValue]);
  const actAdd = useMemo(() => actionGroups.filter((g) => g.delta > ACT_MARGIN)
    .sort((a, b) => b.delta - a.delta), [actionGroups]);
  const actTrim = useMemo(() => actionGroups.filter((g) => g.delta < -ACT_MARGIN)
    .sort((a, b) => a.delta - b.delta), [actionGroups]);
  const actOk = useMemo(() => actionGroups.filter((g) => Math.abs(g.delta) <= ACT_MARGIN),
    [actionGroups]);
  // Ativos de uma classe para a expansao "ver ativos" — agregado leve por
  // simbolo (nao reutiliza `rows`, que so existe para a aba ativa).
  const classAssets = useCallback((cls) => {
    const by = new Map();
    assets.filter((a) => (effectiveClass(a, overrides) || "other") === cls).forEach((a) => {
      const sym = (a.symbol || "").toUpperCase();
      if (sym) by.set(sym, (by.get(sym) || 0) + Number(a.value_usd || 0));
    });
    const list = [...by.entries()].map(([sym, v]) => ({ sym, v, pct: totalValue ? v / totalValue * 100 : 0 }));
    // Alvo por ativo: a MESMA regra da tabela — fixado a cadeado vale o que
    // esta fixado; os restantes repartem por igual o que sobra do alvo do
    // grupo. Progresso = atual/alvo, e e por ele que se ordena: o mais
    // atrasado primeiro, que e por ai que se comeca a reforcar.
    const groupTarget = Number(savedTargets[cls] || 0);
    const locked = list.filter((x) => assetTargets[x.sym]?.locked);
    const sumLocked = locked.reduce((s, x) => s + Number(assetTargets[x.sym].pct || 0), 0);
    const unlockedN = list.length - locked.length;
    const perUnlocked = unlockedN > 0 ? Math.max(0, groupTarget - sumLocked) / unlockedN : 0;
    return list.map((x) => {
      const lk = assetTargets[x.sym]?.locked;
      const sug = lk ? Number(assetTargets[x.sym].pct || 0) : perUnlocked;
      const prog = sug > 0 ? (x.pct / sug) * 100 : (x.pct > 0 ? 200 : 100);
      return { ...x, sug, prog, over: x.pct > sug + 0.05,
               eurGap: totalValue * Math.abs(sug - x.pct) / 100 };
    }).sort((a, b) => a.prog - b.prog);
  }, [assets, overrides, totalValue, savedTargets, assetTargets]);

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
              quantity: 0, value_usd: 0, cost_usd: 0, price_usd: Number(a.price_usd || 0),
              change_24h: Number(a.change_24h || 0), wallets: [] };
        bySym.set(sym, g);
      }
      const q = Number(a.quantity || 0);
      const v = Number(a.value_usd || 0);
      const c = a.cost_usd != null ? Number(a.cost_usd) : Number(a.avg_price || 0) * q;
      g.quantity += q;
      g.value_usd += v;
      g.cost_usd += c;
      if (Number(a.price_usd)) g.price_usd = Number(a.price_usd);
      if (a.change_24h != null) g.change_24h = Number(a.change_24h);
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
    }).sort(cmp);
  }, [activeTab, assets, overrides, savedTargets, assetTargets, totalValue, sectors, cmp]);

  // Paginacao da tabela e da lista (1 ago 2026): 10 por pagina DENTRO do
  // grupo ativo — um grupo nunca se parte entre paginas. O modo Slide navega
  // as linhas todas (ja e um-a-um por natureza).
  // Cor do Valor Investido face ao Valor Real (7 ago 2026): verde se o que
  // esta la hoje vale mais do que o que se meta, vermelho se vale menos,
  // cinzento sem custo conhecido. Mesma convenção do Retorno.
  const gainCls = useCallback((r) => {
    const c = Number(r.cost_usd || 0);
    if (!c) return "text-zinc-300";
    return Number(r.value_usd || 0) >= c ? "text-emerald-400" : "text-rose-400";
  }, []);

  const PAGE_SIZE = 10;
  const nPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pagedRows = useMemo(
    () => (showAll ? rows : rows.slice(tPage * PAGE_SIZE, tPage * PAGE_SIZE + PAGE_SIZE)),
    [rows, tPage, showAll]);

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

  // Movimento das ultimas 24 h. No modo COMPLETO: mini-grafico + percentagem —
  // o grafico so aparece quando o /sparklines ja respondeu, e sem dados o
  // proprio Sparkline desenha um travessao do mesmo tamanho para a coluna nao
  // saltar de largura a meio do carregamento. No modo BASICO fica so a
  // percentagem: o basico existe para caber no telemovel, e foi essa largura
  // que pagou a coluna nova da carteira (29 jul 2026).
  const move24h = (r, w = 56, h = 20) => {
    const ch = Number(r.change_24h || 0);
    const up = ch >= 0;
    return (
      <div className="flex items-center justify-center gap-1.5">
        {mode === "full" && <Sparkline data={sparks[`${r.asset_type}:${r.sym}`]} positive={up} width={w} height={h} />}
        <span className={`font-mono text-[11px] whitespace-nowrap ${up ? "text-emerald-400" : "text-rose-400"}`}>
          {up ? "+" : ""}{ch.toFixed(2)}%
        </span>
      </div>
    );
  };

  // 14 no completo e 8 no basico: as de antes mais a coluna "Carteira".
  // 4 ago 2026 — contagem nova: o cadeado deixou de ter coluna propria
  // (vive dentro da % Sugerida), o Retorno entrou no Basico e a Orientacao
  // saiu dele (continua no Completo; deriva 100% de atual-vs-sugerida e o
  // modo Acao responde melhor ao "que faco"). Completo: Ativo, Setor, 24h,
  // Retorno, PM, Cotacao, Valor, Qtd, %At, %Sug, Orient, C, Grupo = 13.
  // 7 ago 2026 — o Completo ganhou o Valor Investido e a Cotacao mudou de
  // sitio (passou a chamar-se Preco Atual e vive ao lado do Preco Medio,
  // para se lerem em par: "comprei a X, esta a Y"). O mesmo par em dinheiro:
  // investido ao lado do real. Completo: Ativo, Setor, 24h, Retorno, Preco
  // Atual, PM, Investido, Valor Real, Qtd, %At, %Sug, Orient, C, Grupo = 14.
  // Basico: Ativo, 24h, Retorno, PM, %At, %Sug, C = 7 (inalterado).
  const colCount = mode === "full" ? 14 : 7;

  const actionCard = (g, kind) => (
    <div key={g.cls} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <span className="w-2 h-2 rounded-sm" style={{ background: g.color }} />{g.name}
        </span>
        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${kind === "add" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
          {kind === "add" ? "+" : "−"}{Math.abs(g.delta).toFixed(0)} {L("alloc2.pts", "pts")}
        </span>
      </div>
      {[[L("alloc2.act_target", "Alvo"), g.alvo, "#059669"], [L("alloc2.act_current", "Atual"), g.pct, "#3b82f6"]].map(([lab, v, cor]) => (
        <div key={lab} className="grid grid-cols-[44px_1fr_46px] gap-2 items-center my-1">
          <span className="text-[10px] text-zinc-500">{lab}</span>
          <span className="h-2 rounded bg-zinc-950 overflow-hidden"><span className="block h-full rounded" style={{ width: `${Math.min(100, v)}%`, background: cor }} /></span>
          <span className="text-[11px] text-right tabular-nums text-zinc-200">{Number(v).toFixed(1)}%</span>
        </div>
      ))}
      <div className="flex items-center justify-between mt-2 text-[11px] text-zinc-500">
        <span>{"≈"} {money(g.eur)} {kind === "add" ? L("alloc2.act_to_target", "para o alvo") : L("alloc2.act_above", "acima do alvo")}</span>
        <button onClick={() => setActOpen((p) => ({ ...p, [g.cls]: !p[g.cls] }))} className="text-blue-400 hover:underline">
          {L("alloc2.act_assets", "ver ativos")} {actOpen[g.cls] ? "▴" : "▾"}
        </button>
      </div>
      {actOpen[g.cls] && (
        <div className="border-t border-dashed border-zinc-800 mt-2.5 pt-2.5 space-y-2.5">
          {classAssets(g.cls).map((a) => {
            const C = 2 * Math.PI * 16;
            const cor = a.over ? "#fbbf24" : a.prog < 40 ? "#ef4444" : a.prog < 80 ? "#fbbf24" : "#34d399";
            const shown = Math.min(100, a.prog);
            return (
              <div key={a.sym} className="flex items-center gap-2.5">
                <svg width="38" height="38" viewBox="0 0 40 40" className="flex-none" aria-hidden="true">
                  <circle cx="20" cy="20" r="16" fill="none" stroke="#0a0d10" strokeWidth="5" />
                  <circle cx="20" cy="20" r="16" fill="none" stroke={cor} strokeWidth="5" strokeLinecap="round"
                    strokeDasharray={`${(shown / 100) * C} ${C}`} transform="rotate(-90 20 20)" />
                  <text x="20" y="24" textAnchor="middle" style={{ font: "9px system-ui", fill: "#e4e4e7" }}>{Math.round(Math.min(199, a.prog))}%</text>
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-[12px]">
                    <b className="text-zinc-100">{a.sym}</b>
                    <span style={{ color: cor }} className="font-semibold">
                      {a.over ? L("alloc2.act_trim", "Aliviar") : a.prog >= 90 ? L("alloc2.act_almost", "Quase lá") : L("alloc2.act_add", "Reforçar")}
                    </span>
                  </div>
                  <div className="text-[10.5px] text-zinc-500">
                    <b className="text-zinc-200 tabular-nums">{a.pct.toFixed(1)}%</b> {"→"} <b className="text-zinc-200 tabular-nums">{a.sug.toFixed(1)}%</b>
                    {" · "}{Math.round(Math.min(199, a.prog))}% {L("alloc2.act_path", "do caminho")}
                    {" · "}{"≈"} {money(a.eurGap)} {a.over ? L("alloc2.act_above", "acima do alvo") : L("alloc2.act_to_target", "para o alvo")}
                  </div>
                  <div className="h-1.5 rounded bg-zinc-950 overflow-hidden mt-1">
                    <div className="h-full rounded" style={{ width: `${shown}%`, background: cor }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const actionView = (
    <div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-sm font-bold text-emerald-400">{"▲"} {L("alloc2.act_add", "Reforçar")}</span>
            <span className="text-[10px] text-zinc-600 font-mono">{actAdd.length}</span>
          </div>
          <div className="space-y-2.5">
            {actAdd.map((g) => actionCard(g, "add"))}
            {!actAdd.length && <div className="text-center text-zinc-600 text-xs py-4 font-mono">{"—"}</div>}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-sm font-bold text-amber-400">{"▼"} {L("alloc2.act_trim", "Aliviar")}</span>
            <span className="text-[10px] text-zinc-600 font-mono">{actTrim.length}</span>
          </div>
          <div className="space-y-2.5">
            {actTrim.map((g) => actionCard(g, "trim"))}
            {!actTrim.length && <div className="text-center text-zinc-600 text-xs py-4 font-mono">{"—"}</div>}
          </div>
        </div>
      </div>
      {!!actOk.length && (
        <div className="mt-4">
          <div className="text-sm font-bold text-zinc-500 px-1 pb-2">{L("alloc2.act_ok", "No alvo")}</div>
          <div className="space-y-1.5">
            {actOk.map((g) => (
              <div key={g.cls} className="flex items-center justify-between bg-zinc-900/40 border border-zinc-800/60 rounded-lg px-3.5 py-2 text-xs text-zinc-400">
                <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm" style={{ background: g.color }} /><b className="text-zinc-200 font-semibold">{g.name}</b> {"·"} {g.pct.toFixed(1)}% {"→"} {g.alvo.toFixed(0)}%</span>
                <span className="text-emerald-400">{"✓"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Cabecalho clicavel. A seta dupla cinzenta diz "isto ordena"; a azul diz
  // qual esta ativa e em que sentido.
  const th = (k, label, cls) => (
    <th key={k} onClick={() => onSort(k)} title={L("alloc2.sort_hint", "Ordenar por esta coluna")}
      className={`${cls} cursor-pointer select-none transition-colors ${sortKey === k ? "text-zinc-200" : "hover:text-zinc-300"}`}>
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        {label}
        <span className={`text-[8px] ${sortKey === k ? "text-blue-400" : "text-zinc-700"}`}>
          {sortKey === k ? (sortDir === "asc" ? "\u25b2" : "\u25bc") : "\u25b2\u25bc"}
        </span>
      </span>
    </th>
  );

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
              {!editTargets ? (
                <>
                  {actionGroups.map((g) => (
                    <div key={g.cls} className="py-1.5">
                      <div className="flex items-center justify-between text-[12.5px] mb-1">
                        <span className="flex items-center gap-2 text-zinc-200">
                          <span className="w-2 h-2 rounded-full" style={{ background: g.color }} />{g.name}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-[11.5px] text-zinc-500"><b className="text-zinc-100 text-[12.5px]">{g.pct.toFixed(1)}%</b> {"→"} {g.alvo.toFixed(0)}%</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${Math.abs(g.delta) <= ACT_MARGIN ? "bg-zinc-800 text-zinc-400" : g.delta > 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
                            {Math.abs(g.delta) <= ACT_MARGIN ? "✓" : g.delta > 0 ? `▲ ${L("alloc2.act_add", "Reforçar")}` : `▼ ${L("alloc2.act_trim", "Aliviar")}`}
                          </span>
                        </span>
                      </div>
                      <div className="relative h-2 rounded-md bg-zinc-950">
                        <div className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${Math.min(100, g.pct)}%`, background: g.color }} />
                        <div className="absolute -top-[3px] -bottom-[3px] w-[2.5px] rounded bg-zinc-100/85" style={{ left: `${Math.min(100, g.alvo)}%` }} />
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setEditTargets(true)}
                    className="w-full text-center text-[12.5px] text-blue-400 hover:text-blue-300 pt-2.5">
                    {L("alloc2.edit_targets", "Editar percentagens")} {"▾"}
                  </button>
                </>
              ) : (
                <>
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
                  <button onClick={() => setEditTargets(false)}
                    className="w-full text-center text-[12.5px] text-blue-400 hover:text-blue-300 pt-2.5">
                    {L("alloc2.edit_targets", "Editar percentagens")} {"▴"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-3 sm:p-5">
          {/* Telemóvel: Básico/Completo + Lista/Slide na mesma linha, por cima das abas. */}
          <div className="sm:hidden flex items-center justify-between gap-2 mb-3">
            <div className="inline-flex rounded-md border border-zinc-800 bg-zinc-900/60 p-0.5">
              {["basic", "full", "action"].map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-2 py-1 text-[11px] font-mono rounded transition ${mode === m ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"}`}>
                  {m === "basic" ? L("alloc2.basic", "Básico") : m === "full" ? L("alloc2.full", "Completo") : L("alloc2.action", "Ação")}
                </button>
              ))}
            </div>
            {mode !== "action" && (
            <div className="inline-flex rounded-md border border-zinc-800 bg-zinc-900/60 p-0.5">
              {/* Icones em vez de texto (2 ago 2026): com o 3.o modo "Acao" os
                  botoes por extenso saiam do cartao em 360px. O nome vive no
                  title/aria-label — o simbolo e igual nas 6 linguas. */}
              {["list", "slide"].map((m) => (
                <button key={m} onClick={() => setMobileMode(m)}
                  title={m === "list" ? L("alloc2.list", "Lista") : L("alloc2.slide", "Slide")}
                  aria-label={m === "list" ? L("alloc2.list", "Lista") : L("alloc2.slide", "Slide")}
                  className={`w-7 py-1 text-[13px] leading-none rounded transition ${mobileMode === m ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"}`}>
                  {m === "list" ? "☰" : "▤"}
                </button>
              ))}
            </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {mode !== "action" && classesPresent.map((c) => (
                <button key={c} onClick={() => setActiveTab(c)}
                  className={`text-xs font-mono px-2.5 py-1.5 rounded-md transition-colors ${activeTab === c ? "bg-blue-500/20 text-blue-300 border border-blue-500/40" : "text-zinc-400 hover:text-zinc-200 border border-transparent"}`}>
                  {clsLabel(c)}
                </button>
              ))}
            </div>
            <div className="hidden sm:inline-flex rounded-md border border-zinc-800 bg-zinc-900/60 p-0.5">
              {["basic", "full", "action"].map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-2.5 py-1 text-[11px] font-mono rounded transition ${mode === m ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"}`}>
                  {m === "basic" ? (L("alloc2.basic", "Básico")) : m === "full" ? (L("alloc2.full", "Completo")) : (L("alloc2.action", "Ação"))}
                </button>
              ))}
            </div>
          </div>

          {groupOver && (
            <div className="text-[11px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2 mb-3">
              {L("alloc2.over_group", "Os ativos fixados somam mais do que o alvo deste grupo — sobe o grupo ou baixa um ativo.")}
            </div>
          )}

          {mode === "action" ? actionView : (<>
          {/* ===== PC: tabela ===== */}
          <div className="overflow-x-auto hidden sm:block">
            <table className="w-full text-sm">
              <thead>
                {/* 4 ago 2026 — ordem nova (pedido do Jose): Retorno trocou de
                    lugar com a Qtd e entrou no Basico (a Orientacao saiu de la
                    — deriva de atual-vs-sugerida e o modo Acao ja diz "o que
                    fazer"); o cadeado deixou de ter coluna propria e vive na
                    celula da % Sugerida, que e o que ele fixa. */}
                <tr className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono border-b border-zinc-800">
                  {th("symbol", L("alloc2.asset", "Ativo"), "text-center py-2 px-2")}
                  {mode === "full" && th("sector", L("alloc2.sector", "Setor"), "text-center py-2 px-2")}
                  {th("change_24h", L("common.change_24h", "24h"), "text-center py-2 px-2")}
                  {th("pnl_pct", L("alloc2.return", "Retorno"), "text-center py-2 px-2")}
                  {mode === "full" && th("price_usd", L("alloc2.price_now", "Preço Atual"), "text-center py-2 px-2")}
                  {th("avg_price", L("alloc2.avg_price", "Preço Médio"), "text-center py-2 px-2")}
                  {mode === "full" && th("cost_usd", L("alloc2.invested_col", "Valor Investido"), "text-center py-2 px-2")}
                  {mode === "full" && th("value_usd", L("alloc2.value", "Valor Real"), "text-center py-2 px-2")}
                  {mode === "full" && th("quantity", L("alloc2.qty", "Qtd"), "text-center py-2 px-2")}
                  {th("atual", L("alloc2.pct_now", "% Atual"), "text-center py-2 px-2")}
                  {th("sug", L("alloc2.pct_sug", "% Sugerida"), "text-center py-2 px-2")}
                  {mode === "full" && th("orient", L("alloc2.orient", "Orient."), "text-center py-2 px-2")}
                  <th className="text-center py-2 px-1.5 w-px whitespace-nowrap" title={L("alloc2.wallet", "Carteira")}>
                    {L("alloc2.wallet_letter", "C")}
                  </th>
                  {mode === "full" && th("cls", L("alloc2.group", "Grupo"), "text-center py-2 px-2")}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r) => {
                  const multi = r.wallets.length > 1;
                  const open = !!expanded[r.sym];
                  return (
                    <React.Fragment key={r.sym}>
                      <tr className="border-b border-zinc-800/40 hover:bg-zinc-900/40">
                        <td className="py-2.5 px-2 font-mono">
                          <button onClick={() => nav(`/asset/${r.asset_type || "stock"}/${r.symbol}`)}
                            className="font-bold text-zinc-100 hover:text-blue-300 transition-colors"
                            title={L("alloc2.open_chart", "Abrir gráfico")}>
                            {r.symbol}
                          </button>
                          {r.name && <span className="text-zinc-500 ml-2 text-xs">{r.name}</span>}
                          {multi && (
                            <button onClick={() => toggleExpand(r.sym)}
                              className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-blue-400/80 hover:text-blue-300 align-middle">
                              <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
                              {r.wallets.length} {L("alloc2.wallets", "carteiras")}
                            </button>
                          )}
                        </td>
                        {mode === "full" && <td className="py-2.5 px-2 text-zinc-400 text-xs">{r.sector || "—"}</td>}
                        <td className="py-2.5 px-2">{move24h(r)}</td>
                        <td className={`py-2.5 px-2 text-right font-mono ${r.pnl_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{r.pnl_pct >= 0 ? "+" : ""}{Number(r.pnl_pct || 0).toFixed(1)}%</td>
                        {mode === "full" && <td className="py-2.5 px-2 text-right font-mono text-zinc-100">{price(r.price_usd)}</td>}
                        <td className="py-2.5 px-2 text-right font-mono text-amber-400">{price(r.avg_price)}</td>
                        {/* Investido vs Real: verde quando o real esta acima do que se
                            meta (ganho), vermelho quando esta abaixo — a mesma
                            convenção do Retorno e do resto da app. */}
                        {mode === "full" && <td className={`py-2.5 px-2 text-right font-mono ${gainCls(r)}`}>{money(r.cost_usd)}</td>}
                        {mode === "full" && <td className="py-2.5 px-2 text-right font-mono text-zinc-200">{money(r.value_usd)}</td>}
                        {mode === "full" && <td className="py-2.5 px-2 text-right font-mono text-zinc-300">{fmtQty(r.quantity)}</td>}
                        <td className="py-2.5 px-2 text-right font-mono text-zinc-300">{r.atual.toFixed(2)}%</td>
                        <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <button onClick={() => toggleLock(r)} title={r.locked ? "Desbloquear" : "Fixar"}>
                              {r.locked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5 text-zinc-600 hover:text-zinc-400" />}
                            </button>
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
                          </span>
                        </td>
                        {mode === "full" && <td className="py-2.5 px-2">{orientChip(r)}</td>}
                        <td className="py-2.5 px-1.5 text-center w-px">{walletDots(r)}</td>
                        {mode === "full" && (
                          <td className="py-2.5 px-2">
                            <select value={effectiveClass(r, overrides)} onChange={(e) => reclassify(r.sym, e.target.value)}
                              title={L("alloc2.reclassify", "Mudar de grupo")}
                              className="text-[10px] font-mono bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-zinc-400 hover:text-zinc-200 outline-none cursor-pointer">
                              {ALLOCATION_CLASSES.map((c) => <option key={c} value={c}>{clsLabel(c)}</option>)}
                            </select>
                          </td>
                        )}
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
                      {th("symbol", L("alloc2.asset", "Ativo"), "sticky left-0 z-20 bg-zinc-950 text-center py-2 pr-3 pl-1 border-b border-zinc-800")}
                      {mode === "full" && th("sector", L("alloc2.sector", "Setor"), "text-center px-2 py-2 border-b border-zinc-800")}
                      {th("change_24h", L("common.change_24h", "24h"), "text-center px-2 py-2 border-b border-zinc-800")}
                      {th("pnl_pct", L("alloc2.return", "Retorno"), "text-center px-2 py-2 border-b border-zinc-800")}
                      {mode === "full" && th("price_usd", L("alloc2.price_now_short", "Atual"), "text-center px-2 py-2 border-b border-zinc-800")}
                      {th("avg_price", L("alloc2.avg_price_short", "PM"), "text-center px-2 py-2 border-b border-zinc-800")}
                      {mode === "full" && th("cost_usd", L("alloc2.invested_short", "Investido"), "text-center px-2 py-2 border-b border-zinc-800")}
                      {mode === "full" && th("value_usd", L("alloc2.value_short", "Valor"), "text-center px-2 py-2 border-b border-zinc-800")}
                      {mode === "full" && th("quantity", L("alloc2.qty", "Qtd"), "text-center px-2 py-2 border-b border-zinc-800")}
                      {th("atual", L("alloc2.pct_now_short", "% At"), "text-center px-2 py-2 border-b border-zinc-800")}
                      {th("sug", L("alloc2.pct_sug_short", "% Sug"), "text-center px-2 py-2 border-b border-zinc-800")}
                      {mode === "full" && th("orient", L("alloc2.orient", "Orient."), "text-center px-2 py-2 border-b border-zinc-800")}
                      <th className="text-center px-1.5 py-2 w-px whitespace-nowrap border-b border-zinc-800" title={L("alloc2.wallet", "Carteira")}>
                        {L("alloc2.wallet_letter", "C")}
                      </th>
                      {mode === "full" && th("cls", L("alloc2.group", "Grupo"), "text-center px-2 py-2 border-b border-zinc-800")}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((r, ri) => {
                      const multi = r.wallets.length > 1;
                      const open = !!expanded[r.sym];
                      const bg = ri % 2 ? "bg-zinc-900" : "bg-zinc-950"; // xadrez (opaco p/ coluna fixa)
                      return (
                        <React.Fragment key={r.sym}>
                          <tr className={bg}>
                            <td className={`sticky left-0 z-10 ${bg} py-2 pr-3 pl-1 whitespace-nowrap`}>
                              <button onClick={() => nav(`/asset/${r.asset_type || "stock"}/${r.symbol}`)}
                                className="font-bold text-zinc-100 align-middle">
                                {r.symbol}
                              </button>
                              {multi && (
                                <button onClick={() => toggleExpand(r.sym)} className="ml-1 inline-flex items-center align-middle text-[9px] text-blue-400/80">
                                  <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />{r.wallets.length}
                                </button>
                              )}
                            </td>
                            {mode === "full" && <td className="px-2 py-2 text-zinc-400 whitespace-nowrap">{r.sector || "—"}</td>}
                            <td className="px-2 py-2">{move24h(r, 40, 18)}</td>
                            <td className={`px-2 py-2 text-right whitespace-nowrap ${r.pnl_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{r.pnl_pct >= 0 ? "+" : ""}{Number(r.pnl_pct || 0).toFixed(1)}%</td>
                            {mode === "full" && <td className="px-2 py-2 text-right text-zinc-100 whitespace-nowrap">{price(r.price_usd)}</td>}
                            <td className="px-2 py-2 text-right text-amber-400 whitespace-nowrap">{price(r.avg_price)}</td>
                            {mode === "full" && <td className={`px-2 py-2 text-right whitespace-nowrap ${gainCls(r)}`}>{money(r.cost_usd)}</td>}
                            {mode === "full" && <td className="px-2 py-2 text-right text-zinc-200 whitespace-nowrap">{money(r.value_usd)}</td>}
                            {mode === "full" && <td className="px-2 py-2 text-right text-zinc-300 whitespace-nowrap">{fmtQty(r.quantity)}</td>}
                            <td className="px-2 py-2 text-right text-zinc-300 whitespace-nowrap">{r.atual.toFixed(2)}%</td>
                            <td className="px-2 py-2 text-right whitespace-nowrap">
                              <span className="inline-flex items-center gap-1">
                                <button onClick={() => toggleLock(r)} className="align-middle">
                                  {r.locked ? <Lock className="w-3.5 h-3.5 text-amber-400 inline" /> : <Unlock className="w-3.5 h-3.5 text-zinc-600 inline" />}
                                </button>
                                {r.locked ? (
                                  <input type="number" min="0" max="100" step="0.5" value={assetTargets[r.sym]?.pct ?? ""}
                                    onChange={(e) => editLocked(r.sym, e.target.value)} onBlur={() => commitLocked(r.sym)}
                                    className="w-14 text-right bg-amber-500/10 border border-amber-500/40 rounded px-1.5 py-0.5 text-amber-300 outline-none" />
                                ) : (<span className="text-zinc-400">{r.sug.toFixed(2)}% <span className="text-[8px] text-zinc-600">auto</span></span>)}
                              </span>
                            </td>
                            {mode === "full" && <td className="px-2 py-2">{orientChip(r)}</td>}
                            <td className="px-1.5 py-2 text-center w-px">{walletDots(r)}</td>
                            {mode === "full" && (
                              <td className="px-2 py-2">
                                <select value={effectiveClass(r, overrides)} onChange={(e) => reclassify(r.sym, e.target.value)}
                                  className="text-[10px] font-mono bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-zinc-400 outline-none">
                                  {ALLOCATION_CLASSES.map((c) => <option key={c} value={c}>{clsLabel(c)}</option>)}
                                </select>
                              </td>
                            )}
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
                      {!!(r.wallets || []).length && (
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

          {rows.length > PAGE_SIZE && (
            <div className={`${mobileMode === "list" ? "flex" : "hidden sm:flex"} items-center justify-center gap-2 mt-3 text-[11px] font-mono`}>
              {!showAll && (<>
                <button onClick={() => setTPage(Math.max(0, tPage - 1))} disabled={tPage === 0}
                  className="px-2.5 py-1 rounded border border-zinc-800 text-zinc-400 disabled:opacity-30 hover:text-zinc-200">{"‹"}</button>
                <span className="text-zinc-500">{tPage * PAGE_SIZE + 1}{"–"}{Math.min(rows.length, (tPage + 1) * PAGE_SIZE)} {L("alloc2.page_of", "de")} {rows.length}</span>
                <button onClick={() => setTPage(Math.min(nPages - 1, tPage + 1))} disabled={tPage >= nPages - 1}
                  className="px-2.5 py-1 rounded border border-zinc-800 text-zinc-400 disabled:opacity-30 hover:text-zinc-200">{"›"}</button>
              </>)}
              <button onClick={() => { setShowAll(!showAll); setTPage(0); }}
                className="px-2.5 py-1 rounded border border-zinc-800 text-zinc-400 hover:text-zinc-200">
                {showAll ? L("alloc2.show_paged", "10 em 10") : `${L("alloc2.show_all", "Ver todos")} (${rows.length})`}
              </button>
            </div>
          )}

          <GroupDistribution
            rows={rows} wallets={wallets} L={L} money={money} walletName={walletName}
            title={`${L("alloc2.group_dist", "Distribuição do grupo")} · ${clsLabel(activeTab)}`} />
          </>)}

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

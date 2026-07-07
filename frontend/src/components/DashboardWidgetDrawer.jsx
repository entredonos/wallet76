import React, { useRef, useState, useEffect } from "react";
import { X, GripVertical, RotateCcw, Eye, EyeOff } from "lucide-react";
import { useI18n } from "../context/I18nContext";

export default function DashboardWidgetDrawer({ open, onClose, widgetConfig, setWidgetConfig, widgetDefs, wallets = [], dashMode }) {
  const { t } = useI18n();
  const dragId = useRef(null);
  const [dragOverId, setDragOverId] = useState(null);

  // Hidden dashboard filter pills (asset types + wallet IDs)
  const [hiddenTypes, setHiddenTypes] = useState(() => {
    try { return JSON.parse(localStorage.getItem("w76-hidden-type-pills") || "[]"); } catch { return []; }
  });
  const [hiddenWalletPills, setHiddenWalletPills] = useState(() => {
    try { return JSON.parse(localStorage.getItem("w76-hidden-wallet-pills") || "[]"); } catch { return []; }
  });

  const toggleType = (id) => {
    setHiddenTypes((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem("w76-hidden-type-pills", JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const toggleWalletPill = (id) => {
    setHiddenWalletPills((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem("w76-hidden-wallet-pills", JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const TYPE_PILLS = [
    { id: "global",  labelKey: "common.global",  color: "text-zinc-400" },
    { id: "crypto",  labelKey: "common.crypto",  color: "text-amber-400" },
    { id: "stock",   labelKey: "common.stocks",  color: "text-blue-400"  },
    { id: "etf",     labelKey: "common.etfs",    color: "text-blue-400"  },
    { id: "fund",    labelKey: "common.funds",   color: "text-purple-400"},
    { id: "cash",    labelKey: "common.cash",    color: "text-emerald-400"},
  ];

  const toggleWidget = (id) =>
    setWidgetConfig((prev) => prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w)));

  const handleDragStart = (e, id) => {
    dragId.current = id;
    e.dataTransfer.effectAllowed = "move";
    // Ghost image: use the element itself with reduced opacity
    e.dataTransfer.setDragImage(e.currentTarget, 20, 20);
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(id);
  };

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    setDragOverId(null);
    if (!dragId.current || dragId.current === targetId) return;
    setWidgetConfig((prev) => {
      const arr = [...prev];
      const fromIdx = arr.findIndex((w) => w.id === dragId.current);
      const toIdx = arr.findIndex((w) => w.id === targetId);
      const [item] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, item);
      return arr;
    });
    dragId.current = null;
  };

  const handleDragEnd = () => {
    dragId.current = null;
    setDragOverId(null);
  };

  const resetDefault = () => {
    setWidgetConfig(widgetDefs.map((d) => ({ id: d.id, enabled: true })));
    // Also clear hidden filter pills
    setHiddenTypes([]);
    setHiddenWalletPills([]);
    try {
      localStorage.removeItem("w76-hidden-type-pills");
      localStorage.removeItem("w76-hidden-wallet-pills");
    } catch { /* noop */ }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <div className="font-medium text-zinc-100 text-sm">{t("dash.widgets_title")}</div>
            <div className="text-xs text-zinc-400 mt-1 leading-relaxed">{t("dash.widgets_subtitle")}</div>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 p-1 text-zinc-400 hover:text-zinc-300 transition-colors rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Widget list — em modo "light" só "summary" (LightBalanceCard) e
            "evolution" (LightEvolutionCard) chegam a ser desenhados no
            Painel (ver Dashboard.jsx); os outros (top_movers/performers/
            allocation/monthly_returns/assets) só existem em "advanced".
            Mostrar os seus toggles aqui também em "light" não tinha efeito
            nenhum — o utilizador reparou nisto (5 jul 2026: "editor de
            widgets mas tens que ver se esta atualizado aqui") — por isso
            filtramos a lista consoante o modo. */}
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2 space-y-2">
          {widgetConfig
            .filter((w) => dashMode !== "light" || ["summary", "evolution"].includes(w.id))
            .map((w) => {
            const def = widgetDefs.find((d) => d.id === w.id);
            if (!def) return null;
            const isOver = dragOverId === w.id;
            return (
              <div
                key={w.id}
                draggable
                onDragStart={(e) => handleDragStart(e, w.id)}
                onDragOver={(e) => handleDragOver(e, w.id)}
                onDrop={(e) => handleDrop(e, w.id)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg border transition-all select-none ${
                  isOver
                    ? "border-blue-500/50 bg-blue-500/10 scale-[0.99]"
                    : w.enabled
                    ? "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                    : "border-zinc-800/50 bg-zinc-900/20 opacity-60"
                }`}
              >
                <GripVertical className="w-4 h-4 text-zinc-600 cursor-grab active:cursor-grabbing shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-200 truncate">{t(def.labelKey)}</div>
                </div>
                <button
                  onClick={() => toggleWidget(w.id)}
                  className="shrink-0 p-1 rounded transition-colors text-zinc-400 hover:text-zinc-200"
                >
                  {w.enabled
                    ? <Eye className="w-4 h-4 text-emerald-400" />
                    : <EyeOff className="w-4 h-4" />
                  }
                </button>
              </div>
            );
          })}
        </div>

        {/* Filter pills section — só existem no modo "advanced" (as pills
            de tipo/carteira da tabela de ativos); escondidas em "light"
            pela mesma razão da lista de widgets acima. */}
        {dashMode !== "light" && (
        <div className="px-4 pb-2 border-t border-zinc-800 pt-4">
          <div className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-400 mb-3">{t("dash.widgets_filter_pills") || "Filter pills"}</div>
          <div className="space-y-1.5">
            {TYPE_PILLS.map((pill) => (
              <button
                key={pill.id}
                onClick={() => toggleType(pill.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors ${
                  hiddenTypes.includes(pill.id)
                    ? "border-zinc-800/50 bg-zinc-900/20 opacity-50"
                    : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                }`}
              >
                <span className={pill.color}>{t(pill.labelKey)}</span>
                {hiddenTypes.includes(pill.id)
                  ? <EyeOff className="w-3.5 h-3.5 text-zinc-600" />
                  : <Eye className="w-3.5 h-3.5 text-emerald-400" />
                }
              </button>
            ))}
            {wallets.map((w) => (
              <button
                key={w.id}
                onClick={() => toggleWalletPill(w.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors ${
                  hiddenWalletPills.includes(w.id)
                    ? "border-zinc-800/50 bg-zinc-900/20 opacity-50"
                    : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                }`}
              >
                <span className="text-zinc-300 truncate">{w.name}</span>
                {hiddenWalletPills.includes(w.id)
                  ? <EyeOff className="w-3.5 h-3.5 text-zinc-600" />
                  : <Eye className="w-3.5 h-3.5 text-emerald-400" />
                }
              </button>
            ))}
          </div>
        </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-800">
          <button
            onClick={resetDefault}
            className="w-full flex items-center justify-center gap-2 text-xs font-mono text-zinc-400 hover:text-zinc-300 py-2 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t("dash.widgets_reset") || "Reset to default"}
          </button>
        </div>
      </div>
    </>
  );
}

import React, { useRef, useState } from "react";
import { X, GripVertical, RotateCcw, Eye, EyeOff } from "lucide-react";
import { useI18n } from "../context/I18nContext";

export default function AnalyticsWidgetDrawer({ open, onClose, widgetConfig, setWidgetConfig, widgetDefs }) {
  const { t } = useI18n();
  const dragId = useRef(null);
  const [dragOverId, setDragOverId] = useState(null);

  const toggleWidget = (id) =>
    setWidgetConfig((prev) => prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w)));

  const handleDragStart = (e, id) => {
    dragId.current = id;
    e.dataTransfer.effectAllowed = "move";
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

  const resetDefault = () =>
    setWidgetConfig(widgetDefs.map((d) => ({ id: d.id, enabled: true })));

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-72 z-50 bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800">
          <div>
            <div className="text-sm font-medium text-zinc-100">
              {t("analytics.widgets_title") || "Personalizar"}
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              {t("analytics.widgets_sub") || "Ativa, desativa e reordena secções"}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Widget list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {widgetConfig.map((w) => {
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
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-grab active:cursor-grabbing select-none ${
                  w.enabled
                    ? "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                    : "border-zinc-800/50 bg-zinc-900/20 opacity-50"
                } ${isOver ? "border-blue-500/50 bg-blue-500/5" : ""}`}
              >
                <GripVertical className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                <span className="flex-1 text-xs font-mono text-zinc-300 truncate">
                  {t(def.labelKey) || def.labelKey}
                </span>
                <button
                  onClick={() => toggleWidget(w.id)}
                  className="p-1 rounded-md hover:bg-zinc-700 transition-colors shrink-0"
                >
                  {w.enabled
                    ? <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    : <EyeOff className="w-3.5 h-3.5 text-zinc-600" />
                  }
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-800">
          <button
            onClick={resetDefault}
            className="w-full flex items-center justify-center gap-2 text-xs font-mono text-zinc-500 hover:text-zinc-300 py-2 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t("dash.widgets_reset") || "Repor predefinição"}
          </button>
        </div>
      </div>
    </>
  );
}

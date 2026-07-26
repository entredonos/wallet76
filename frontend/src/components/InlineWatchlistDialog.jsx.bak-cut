import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "./ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "./ui/select";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../context/I18nContext";
import { requestSidebarRefresh } from "../lib/sidebarRefresh";

/**
 * Popup reutilizável "adicionar à watchlist" (17 jul 2026). A partir de
 * qualquer linha (Mercado, Alertas, Transações), abre um diálogo focado com o
 * ativo, deixa escolher a sub-lista (se houver mais do que uma) + uma etiqueta
 * opcional, e faz POST /watchlists. Trata duplicado (400) e limite (402).
 * @param {{ asset: {symbol,name,asset_type,coingecko_id?}, open: boolean, onOpenChange: (b:boolean)=>void, onAdded?: ()=>void }} props
 */
export default function InlineWatchlistDialog({ asset, open, onOpenChange, onAdded }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel("");
    (async () => {
      try {
        const { data } = await api.get("/watchlist-groups");
        const gs = data || [];
        setGroups(gs);
        setGroupId(gs[0]?.id || "");
      } catch { /* o backend auto-cria uma "Default" se nao existir nenhuma */ }
    })();
  }, [open, asset?.symbol]);

  if (!asset) return null;

  const submit = async () => {
    setSaving(true);
    try {
      await api.post("/watchlists", {
        symbol: asset.symbol,
        asset_type: asset.asset_type === "crypto" ? "crypto" : "stock",
        coingecko_id: asset.asset_type === "crypto" ? (asset.coingecko_id || undefined) : undefined,
        name: asset.name || asset.symbol,
        custom_label: label.trim() || asset.symbol,
        group_id: groupId || undefined,
      });
      toast.success(t("watch.added"));
      onOpenChange(false);
      onAdded?.();
      requestSidebarRefresh();
    } catch (e) {
      const detail = e.response?.data?.detail;
      const status = e.response?.status;
      if (status === 402 && detail?.reason === "watchlist_item_limit") {
        toast.error(t("watchlists.item_limit_msg", { limit: detail.limit }), {
          action: { label: t("common.upgrade"), onClick: () => navigate("/pricing") },
        });
      } else if (status === 400 && typeof detail === "string" && detail.toLowerCase().includes("already")) {
        toast.error(t("watch.already"));
      } else {
        toast.error(formatApiErrorDetail(detail) || t("common.error"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md" data-testid="inline-watchlist-dialog">
        <DialogHeader>
          <DialogTitle className="font-display font-light text-2xl flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-400"/>
            {t("watch.add")} · <span className="font-mono">{asset.symbol}</span>
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-sm">
            {asset.name || asset.symbol}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {groups.length > 1 && (
            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("watch.group")}</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="watch-group-select">
                  <SelectValue/>
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("watch.custom_label")}</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder={asset.symbol} className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="watch-label-input"/>
          </div>
          <Button onClick={submit} disabled={saving} className="w-full bg-zinc-100 text-zinc-950 hover:bg-white font-medium" data-testid="watch-submit">
            {saving ? t("common.saving") : t("watch.add")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

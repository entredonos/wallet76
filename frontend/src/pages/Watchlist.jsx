import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { usePlan } from "../hooks/usePlan";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Plus, Trash2, Eye, ArrowUpRight, ArrowDownRight, FolderPlus, Folder, Settings2, Bell,
} from "lucide-react";
import { toast } from "sonner";
import AssetIcon from "../components/AssetIcon";
import Sparkline from "../components/Sparkline";
import InlineAlertDialog from "../components/InlineAlertDialog";
import { fmtCurrency, fmtPct, fmtCompact } from "../lib/format";
import { useI18n } from "../context/I18nContext";
import { requestSidebarRefresh } from "../lib/sidebarRefresh";

const MAX_PER_GROUP_PRO = 20;
const MAX_GROUPS_PRO = 20;
const MAX_PER_GROUP_FREE = 10;
const MAX_GROUPS_FREE = 1;

// Toggleable columns
const WATCH_COLUMNS = [
  { key: "price",    labelKey: "common.price" },
  { key: "change",   labelKey: "common.change_24h" },
  { key: "pct_7d",   labelKey: "common.change_7d" },
  { key: "mcap",     labelKey: "common.market_cap" },
  { key: "vol",      labelKey: "common.volume_24h" },
  { key: "high_low", labelKey: "common.high_low_24h" },
  { key: "spark",    labelKey: "common.chart_24h" },
];
const DEFAULT_WATCH_COLS = ["price","change","pct_7d","mcap","vol","spark"];

export default function Watchlist() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { isPro } = usePlan();
  const MAX_GROUPS = isPro ? MAX_GROUPS_PRO : MAX_GROUPS_FREE;
  const MAX_PER_GROUP = isPro ? MAX_PER_GROUP_PRO : MAX_PER_GROUP_FREE;
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState(null);
  const [activeGroupId, setActiveGroupId] = useState("");
  const [visibleCols, setVisibleCols] = useState(() => {
    try {
      const raw = localStorage.getItem("folio-watch-cols");
      return raw ? JSON.parse(raw) : DEFAULT_WATCH_COLS;
    } catch { return DEFAULT_WATCH_COLS; }
  });
  const [colMenuOpen, setColMenuOpen] = useState(false);
  useEffect(() => {
    try { localStorage.setItem("folio-watch-cols", JSON.stringify(visibleCols)); } catch { /* noop */ }
  }, [visibleCols]);
  const colVisible = (k) => visibleCols.includes(k);
  const toggleCol = (k) => setVisibleCols((arr) => arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/watchlist-groups");
      setGroups(data || []);
      if (data && data.length && !data.find((g) => g.id === activeGroupId)) {
        setActiveGroupId(data[0].id);
      }
    } catch {
      toast.error(t("watch.load_failed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const submitNewGroup = async () => {
    const name = newGroupName.trim();
    if (!name) { toast.error(t("watch.name_required")); return; }
    if (groups.length >= MAX_GROUPS) { toast.error(t("watch.groups_full")); return; }
    setSavingGroup(true);
    try {
      const { data } = await api.post("/watchlist-groups", { name });
      toast.success(t("watch.group_created"));
      setActiveGroupId(data.id);
      setNewGroupName("");
      setNewGroupOpen(false);
      load();
      requestSidebarRefresh();
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 402 && detail?.reason === "watchlist_group_limit") {
        toast.error(t("watchlists.group_limit_msg", { limit: detail.limit }), {
          action: { label: t("common.upgrade"), onClick: () => navigate("/pricing") },
        });
      } else {
        toast.error(formatApiErrorDetail(detail) || t("common.error"));
      }
    } finally {
      setSavingGroup(false);
    }
  };

  const confirmDeleteGroup = async () => {
    if (!deleteGroupTarget) return;
    try {
      await api.delete(`/watchlist-groups/${deleteGroupTarget.id}`);
      toast.success(t("watch.group_deleted"));
      // If we deleted the active group, pick first remaining
      if (deleteGroupTarget.id === activeGroupId) {
        setActiveGroupId("");
      }
      setDeleteGroupTarget(null);
      load();
      requestSidebarRefresh();
    } catch {
      toast.error(t("common.error"));
    }
  };

  const [deleteItemTarget, setDeleteItemTarget] = useState(null);
  const [alertTarget, setAlertTarget] = useState(null);
  const confirmDeleteItem = async () => {
    if (!deleteItemTarget) return;
    try {
      await api.delete(`/watchlists/${deleteItemTarget.id}`);
      toast.success(t("watch.item_removed"));
      setDeleteItemTarget(null);
      load();
      requestSidebarRefresh();
    } catch {
      toast.error(t("common.error"));
    }
  };

  const activeGroup = groups.find((g) => g.id === activeGroupId) || groups[0];
  const totalItems = groups.reduce((s, g) => s + (g.items?.length || 0), 0);

  return (
    <div className="space-y-8 fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("watch.title")}</div>
          <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mt-2">{t("watch.title")}</h1>
          <p className="text-zinc-500 mt-2">{t("watch.subtitle")} · {totalItems} {totalItems === 1 ? t("common.asset") : t("common.assets")} {t("common.in")} {groups.length} {groups.length === 1 ? t("common.list") : t("common.lists")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => { setNewGroupName(""); setNewGroupOpen(true); }}
            variant="outline"
            disabled={groups.length >= MAX_GROUPS}
            className="bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50"
            data-testid="new-group-btn"
            title={groups.length >= MAX_GROUPS ? t("watch.groups_full") : ""}
          >
            <FolderPlus className="w-4 h-4 mr-1.5"/> {t("watch.new_group")}
          </Button>
          <NewWatchDialog
            open={addOpen}
            setOpen={setAddOpen}
            onSaved={load}
            currentGroupId={activeGroup?.id}
            groupCount={activeGroup?.items?.length || 0}
            maxPerGroup={MAX_PER_GROUP}
          />
        </div>
      </div>

      {loading && <div className="text-zinc-500 font-mono text-sm">{t("common.loading")}</div>}

      {!loading && groups.length === 0 && (
        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-12 text-center" data-testid="no-groups">
          <Folder className="w-10 h-10 text-zinc-700 mx-auto mb-3"/>
          <div className="text-zinc-300 font-display text-xl">{t("watch.no_groups")}</div>
          <div className="text-zinc-500 mt-2 mb-4 text-sm">{t("watch.no_groups_hint")}</div>
          <Button onClick={() => { setNewGroupName(""); setNewGroupOpen(true); }} className="bg-zinc-100 text-zinc-950 hover:bg-white" data-testid="empty-create-group">
            <FolderPlus className="w-4 h-4 mr-1.5"/> {t("watch.new_group")}
          </Button>
        </div>
      )}

      {!loading && groups.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2" data-testid="group-tabs">
            {groups.map((g) => {
              const active = g.id === (activeGroup?.id || "");
              return (
                <button
                  key={g.id}
                  onClick={() => setActiveGroupId(g.id)}
                  className={`group inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm border transition-colors ${
                    active
                      ? "bg-zinc-100 text-zinc-950 border-zinc-100"
                      : "bg-zinc-900/40 text-zinc-300 border-zinc-800 hover:border-zinc-700"
                  }`}
                  data-testid={`group-tab-${g.id}`}
                >
                  <Folder className="w-3.5 h-3.5"/>
                  <span className="font-mono">{g.name}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${active ? "bg-zinc-900/20 text-zinc-700" : "bg-zinc-800/60 text-zinc-400"}`}>
                    {g.items?.length || 0}/{MAX_PER_GROUP}
                  </span>
                </button>
              );
            })}
          </div>

          {activeGroup && (
            <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl overflow-hidden" data-testid={`group-panel-${activeGroup.id}`}>
              <div className="px-5 py-4 border-b border-zinc-800/50 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Folder className="w-4 h-4 text-zinc-500 shrink-0"/>
                  <div className="font-display text-lg text-zinc-100 truncate">{activeGroup.name}</div>
                  <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-500 ml-1">{activeGroup.items?.length || 0}/{MAX_PER_GROUP}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button
                      onClick={() => setColMenuOpen((v) => !v)}
                      className="p-1.5 border border-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 transition-colors"
                      data-testid="watch-columns-gear-btn"
                      title={t("watch.configure_columns")}
                    >
                      <Settings2 className="w-4 h-4"/>
                    </button>
                    {colMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setColMenuOpen(false)}/>
                        <div className="absolute right-0 top-full mt-2 z-40 w-56 bg-zinc-950 border border-zinc-800 rounded-md shadow-2xl p-2" data-testid="watch-columns-menu">
                          <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-500 px-2 py-1.5">{t("watch.columns")}</div>
                          {WATCH_COLUMNS.map((c) => (
                            <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-900 rounded cursor-pointer" data-testid={`watch-col-toggle-${c.key}`}>
                              <input type="checkbox" checked={colVisible(c.key)} onChange={() => toggleCol(c.key)} className="accent-blue-500"/>
                              <span>{t(c.labelKey)}</span>
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => setDeleteGroupTarget(activeGroup)}
                    className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.15em] px-2.5 py-1 border border-rose-500/30 text-rose-300 hover:text-rose-200 hover:bg-rose-500/15 rounded-md transition-colors"
                    data-testid={`delete-group-${activeGroup.id}`}
                    title={t("watch.delete_group_tooltip")}
                  >
                    <Trash2 className="w-3.5 h-3.5"/> {t("watch.delete_group")}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full" data-testid="watchlist-table">
                  <thead>
                    <tr className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-500 border-b border-zinc-800/30">
                      <th className="text-left px-6 py-3 font-normal">{t("common.label")}</th>
                      <th className="text-left px-4 py-3 font-normal">{t("common.symbol")}</th>
                      {colVisible("price") && <th className="text-right px-4 py-3 font-normal">{t("common.price")}</th>}
                      {colVisible("change") && <th className="text-right px-4 py-3 font-normal">{t("common.change_24h")}</th>}
                      {colVisible("pct_7d") && <th className="text-right px-4 py-3 font-normal">{t("common.change_7d")}</th>}
                      {colVisible("mcap") && <th className="text-right px-4 py-3 font-normal">{t("common.market_cap")}</th>}
                      {colVisible("vol") && <th className="text-right px-4 py-3 font-normal">{t("common.volume_24h")}</th>}
                      {colVisible("high_low") && <th className="text-right px-4 py-3 font-normal">{t("common.high_low_24h")}</th>}
                      {colVisible("spark") && <th className="text-right px-4 py-3 font-normal">{t("common.chart_24h")}</th>}
                      <th className="text-right px-6 py-3 font-normal">{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activeGroup.items || []).length === 0 && (
                      <tr>
                        <td colSpan={visibleCols.length + 3} className="px-6 py-10 text-center text-zinc-600 font-mono text-sm" data-testid="empty-group">
                          {t("watch.empty_group")}
                        </td>
                      </tr>
                    )}
                    {(activeGroup.items || []).map((w) => {
                      const pos = (w.change_24h || 0) >= 0;
                      const pos7 = (w.pct_7d || 0) >= 0;
                      const spark = (w.sparkline_24h || []).map((p, i) => ({ t: i, p }));
                      return (
                        <tr key={w.id} className="border-b border-zinc-800/30 hover:bg-zinc-900/40 transition-colors" data-testid={`watch-row-${w.id}`}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <AssetIcon asset={w} size={28}/>
                              <div>
                                <div className="font-mono text-zinc-100">{w.custom_label}</div>
                                <div className="text-xs text-zinc-500">{w.name}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 font-mono text-zinc-300">
                            {w.symbol}
                            <span className="text-[10px] font-mono uppercase border border-zinc-800 rounded px-1 py-0.5 text-zinc-500 ml-1">{w.asset_type}</span>
                          </td>
                          {colVisible("price") && (
                            <td className="px-4 py-4 text-right font-mono text-zinc-100">
                              {w.price_usd ? fmtCurrency(w.price_usd, "USD") : "—"}
                            </td>
                          )}
                          {colVisible("change") && (
                            <td className={`px-4 py-4 text-right font-mono text-sm ${pos ? "text-emerald-400" : "text-rose-400"}`}>
                              <span className="inline-flex items-center gap-1">
                                {pos ? <ArrowUpRight className="w-3 h-3"/> : <ArrowDownRight className="w-3 h-3"/>}
                                {fmtPct(w.change_24h || 0)}
                              </span>
                            </td>
                          )}
                          {colVisible("pct_7d") && (
                            <td className={`px-4 py-4 text-right font-mono text-sm ${pos7 ? "text-emerald-400" : "text-rose-400"}`}>
                              {w.pct_7d != null ? fmtPct(w.pct_7d) : "—"}
                            </td>
                          )}
                          {colVisible("mcap") && (
                            <td className="px-4 py-4 text-right font-mono text-zinc-300">
                              {w.market_cap_usd ? fmtCompact(w.market_cap_usd, "USD") : "—"}
                            </td>
                          )}
                          {colVisible("vol") && (
                            <td className="px-4 py-4 text-right font-mono text-zinc-300">
                              {w.volume_24h_usd ? fmtCompact(w.volume_24h_usd, "USD") : "—"}
                            </td>
                          )}
                          {colVisible("high_low") && (
                            <td className="px-4 py-4 text-right font-mono text-xs text-zinc-400">
                              {w.high_24h_usd ? (
                                <>
                                  <div className="text-emerald-400">H {fmtCurrency(w.high_24h_usd, "USD")}</div>
                                  <div className="text-rose-400">L {fmtCurrency(w.low_24h_usd || 0, "USD")}</div>
                                </>
                              ) : "—"}
                            </td>
                          )}
                          {colVisible("spark") && (
                            <td className="px-4 py-4 text-right">
                              <div className="inline-block" data-testid={`watch-spark-${w.id}`}>
                                <Sparkline data={spark} positive={pos}/>
                              </div>
                            </td>
                          )}
                          <td className="px-6 py-4 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button onClick={() => setAlertTarget(w)} className="text-zinc-500 hover:text-blue-400 transition-colors" data-testid={`watch-alert-${w.id}`} title={t("common.alerts")}>
                                <Bell className="w-4 h-4"/>
                              </button>
                              <Link to={`/asset/${w.asset_type}/${w.symbol}`} className="text-zinc-500 hover:text-blue-400 transition-colors" data-testid={`watch-chart-${w.id}`} title={t("common.chart")}>
                                <Eye className="w-4 h-4"/>
                              </Link>
                              <button onClick={() => setDeleteItemTarget(w)} className="text-zinc-500 hover:text-rose-400 transition-colors" data-testid={`watch-delete-${w.id}`} title={t("common.delete")}>
                                <Trash2 className="w-4 h-4"/>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* New group dialog */}
      <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-light text-2xl">{t("watch.new_group")}</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">
              {t("watch.group_name_prompt")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoFocus
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitNewGroup(); }}
              placeholder={t("watch.new_group_placeholder")}
              className="bg-zinc-900/50 border-zinc-800"
              data-testid="new-group-input"
            />
            <div className="text-[10px] font-mono text-zinc-600">{groups.length}/{MAX_GROUPS} {t("watch.lists_used")}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewGroupOpen(false)} className="bg-zinc-900/50 border-zinc-800 text-zinc-300" data-testid="new-group-cancel">
              {t("common.cancel")}
            </Button>
            <Button onClick={submitNewGroup} disabled={savingGroup || !newGroupName.trim()} className="bg-zinc-100 text-zinc-950 hover:bg-white" data-testid="new-group-submit">
              {savingGroup ? t("common.saving") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete group confirm dialog */}
      <Dialog open={!!deleteGroupTarget} onOpenChange={(o) => !o && setDeleteGroupTarget(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-light text-2xl">{t("watch.delete_group")}</DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              {deleteGroupTarget && (
                <>
                  {t("watch.delete_group_confirm")} <span className="text-zinc-100 font-mono">{deleteGroupTarget.name}</span>?
                  <br/>
                  <span className="text-rose-400 text-xs">
                    {(deleteGroupTarget.items?.length || 0)} {t("common.assets")} {t("watch.will_be_removed")}.
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteGroupTarget(null)} className="bg-zinc-900/50 border-zinc-800 text-zinc-300" data-testid="delete-group-cancel">
              {t("common.cancel")}
            </Button>
            <Button onClick={confirmDeleteGroup} className="bg-rose-500 hover:bg-rose-400 text-zinc-950" data-testid="delete-group-confirm">
              <Trash2 className="w-4 h-4 mr-1.5"/> {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete item confirm dialog */}
      <Dialog open={!!deleteItemTarget} onOpenChange={(o) => !o && setDeleteItemTarget(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-light text-2xl">{t("watch.remove_item")}</DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              {deleteItemTarget && (
                <>{t("watch.remove_item_confirm")} <span className="text-zinc-100 font-mono">{deleteItemTarget.symbol}</span>?</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItemTarget(null)} className="bg-zinc-900/50 border-zinc-800 text-zinc-300" data-testid="delete-item-cancel">
              {t("common.cancel")}
            </Button>
            <Button onClick={confirmDeleteItem} className="bg-rose-500 hover:bg-rose-400 text-zinc-950" data-testid="delete-item-confirm">
              <Trash2 className="w-4 h-4 mr-1.5"/> {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inline alert dialog */}
      <InlineAlertDialog
        asset={alertTarget}
        open={!!alertTarget}
        onOpenChange={(o) => !o && setAlertTarget(null)}
        onCreated={() => setAlertTarget(null)}
      />
    </div>
  );
}

function NewWatchDialog({ open, setOpen, onSaved, currentGroupId, groupCount, maxPerGroup }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [assetType, setAssetType] = useState("crypto");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(null);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setPicked(null); setResults([]); setSearch(""); setLabel(""); setAssetType("crypto"); }
  }, [open]);

  useEffect(() => {
    if (!search || search.length < 1) { setResults([]); return; }
    const tid = setTimeout(async () => {
      setSearching(true);
      try {
        const path = assetType === "crypto" ? "/search/crypto" : "/search/stock";
        const { data } = await api.get(path, { params: { q: search } });
        setResults(data || []);
      } catch { /* noop */ }
      setSearching(false);
    }, 350);
    return () => clearTimeout(tid);
  }, [search, assetType]);

  const save = async () => {
    if (!picked) { toast.error(t("alert.pick_asset_error")); return; }
    if (!currentGroupId) { toast.error(t("watch.pick_group_first")); return; }
    setSaving(true);
    try {
      await api.post("/watchlists", {
        symbol: picked.symbol,
        asset_type: assetType,
        coingecko_id: assetType === "crypto" ? picked.id : undefined,
        name: picked.name,
        custom_label: label.trim() || picked.symbol,
        group_id: currentGroupId,
      });
      toast.success(t("watch.added"));
      setOpen(false);
      onSaved?.();
      requestSidebarRefresh();
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 402 && detail?.reason === "watchlist_item_limit") {
        toast.error(t("watchlists.item_limit_msg", { limit: detail.limit }), {
          action: { label: t("common.upgrade"), onClick: () => navigate("/pricing") },
        });
      } else {
        toast.error(formatApiErrorDetail(detail) || t("common.error"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          disabled={!currentGroupId || groupCount >= maxPerGroup}
          className="bg-zinc-100 text-zinc-950 hover:bg-white font-medium disabled:opacity-50"
          data-testid="new-watch-btn"
          title={!currentGroupId ? t("watch.pick_group_first") : (groupCount >= maxPerGroup ? t("watch.group_full") : "")}
        >
          <Plus className="w-4 h-4 mr-1"/> {t("watch.add")}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display font-light text-2xl">{t("watch.add")}</DialogTitle>
          <DialogDescription className="text-zinc-500 text-sm">
            {t("watch.add_hint", { max: maxPerGroup })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Tabs value={assetType} onValueChange={setAssetType}>
            <TabsList className="w-full bg-zinc-900/50 border border-zinc-800">
              <TabsTrigger value="crypto" className="flex-1 data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950" data-testid="watch-tab-crypto">{t("common.crypto")}</TabsTrigger>
              <TabsTrigger value="stock" className="flex-1 data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950" data-testid="watch-tab-stock">{t("common.stocks")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div>
            <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("common.search")}</Label>
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPicked(null); }}
              placeholder={assetType === "crypto" ? "bitcoin, eth..." : "Apple, AAPL..."}
              className="mt-2 bg-zinc-900/50 border-zinc-800"
              data-testid="watch-search-input"
            />
            {searching && <div className="text-xs text-zinc-500 mt-1 font-mono">{t("common.searching")}</div>}
            {results.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto border border-zinc-800 rounded-md bg-zinc-900/50">
                {results.map((r) => (
                  <button
                    key={r.id || r.symbol}
                    onClick={() => { setPicked(r); setResults([]); setSearch(r.symbol); }}
                    className="w-full text-left px-3 py-2 hover:bg-zinc-800/60 text-sm"
                    data-testid={`watch-result-${(r.id || r.symbol).toLowerCase()}`}
                  >
                    <span className="font-mono text-zinc-100">{r.symbol}</span>
                    <span className="text-zinc-500 ml-2">{r.name}</span>
                  </button>
                ))}
              </div>
            )}
            {picked && (
              <div className="mt-2 text-xs font-mono text-emerald-400">{t("watch.selected", { symbol: picked.symbol, name: picked.name })}</div>
            )}
          </div>
          <div>
            <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("common.label")} ({t("common.optional")})</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={picked?.symbol || ""}
              className="mt-2 bg-zinc-900/50 border-zinc-800"
              data-testid="watch-label-input"
            />
          </div>
          <Button
            onClick={save}
            disabled={saving || !picked}
            className="w-full bg-zinc-100 text-zinc-950 hover:bg-white"
            data-testid="watch-submit"
          >
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

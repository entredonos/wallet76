import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { toast } from "sonner";
import { Bell, Plus, Trash2, ArrowUp, ArrowDown, BellRing, Check } from "lucide-react";
import AssetIcon from "../components/AssetIcon";
import { fmtCurrency, fmtPct } from "../lib/format";
import { useI18n } from "../context/I18nContext";
import { SkeletonTableRow } from "../components/SkeletonRow";
import { useSearchParams, useNavigate } from "react-router-dom";
import { requestSidebarRefresh } from "../lib/sidebarRefresh";

export default function Alerts() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const prefillSymbol = searchParams.get("prefill");
  const prefillType   = searchParams.get("type");
  const prefillPrice  = searchParams.get("price");

  const [alerts, setAlerts] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [livePrices, setLivePrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(!!prefillSymbol);
  const [notifPerm, setNotifPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "denied");

  useEffect(() => { if (prefillSymbol) setOpen(true); }, [prefillSymbol]);

  const load = async () => {
    setLoading(true);
    try {
      const [a, p] = await Promise.all([api.get("/alerts"), api.get("/portfolio")]);
      setAlerts(a.data || []);
      const enriched = (p.data?.assets || []).filter((x) => x.quantity > 0);
      setHoldings(enriched);
      const priceMap = {};
      enriched.forEach((e) => {
        priceMap[`${e.asset_type}:${e.symbol.toUpperCase()}`] = e.price_usd;
      });
      setLivePrices(priceMap);
    } catch (e) { toast.error(t("alert.load_failed")); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const askNotificationPermission = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setNotifPerm(p);
    if (p === "granted") toast.success(t("alert.notifs_enabled"));
  };

  const deleteAlert = async (id) => {
    if (!window.confirm(t("alert.confirm_delete"))) return;
    try {
      await api.delete(`/alerts/${id}`);
      toast.success(t("alert.deleted"));
      load();
      requestSidebarRefresh();
    } catch { toast.error(t("common.error")); }
  };

  const toggleAlert = async (alert) => {
    try {
      await api.patch(`/alerts/${alert.id}`, { active: !alert.active });
      load();
      requestSidebarRefresh();
    } catch { toast.error(t("common.error")); }
  };

  return (
    <div className="space-y-8 fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("alert.kicker")}</div>
          <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mt-2">{t("alerts.title")}</h1>
          <p className="text-zinc-400 mt-2">{t("alerts.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {notifPerm !== "granted" && (
            <Button variant="outline" onClick={askNotificationPermission} className="bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:bg-zinc-800" data-testid="enable-notifs-btn">
              <BellRing className="w-4 h-4 mr-2"/> {t("alert.enable_notifs")}
            </Button>
          )}
          {notifPerm === "granted" && (
            <div className="text-xs font-mono text-emerald-400 flex items-center gap-1 px-3 py-1.5 border border-emerald-500/30 rounded-md bg-emerald-500/10">
              <Check className="w-3 h-3"/> {t("alert.notifs_enabled")}
            </div>
          )}
          <NewAlertDialog
            open={open}
            setOpen={(v) => { setOpen(v); if (!v && prefillSymbol) setSearchParams({}); }}
            holdings={holdings}
            onSaved={load}
            defaultSymbol={prefillSymbol}
            defaultAssetType={prefillType}
            defaultPrice={prefillPrice}
          />
        </div>
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-lg overflow-hidden">
        {/* Mobile — stacked cards. The desktop table's 7 columns only ever
            produced permanent horizontal scroll on a phone. */}
        <div className="md:hidden divide-y divide-zinc-800/30">
          {loading && [0, 1, 2].map((i) => (
            <div key={i} className="p-4 space-y-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 rounded-full bg-zinc-800 shrink-0" />
                <div className="h-3 bg-zinc-800 rounded w-24" />
              </div>
              <div className="h-3 bg-zinc-800 rounded w-1/2" />
            </div>
          ))}
          {!loading && alerts.length === 0 && (
            <div className="px-6 py-12 text-center text-zinc-600 font-mono text-sm" data-testid="no-alerts-mobile">
              {t("alert.empty_state")} <span className="text-zinc-300">+ {t("alert.new")}</span>.
            </div>
          )}
          {alerts.map((a) => {
            const current = livePrices[`${a.asset_type}:${a.symbol.toUpperCase()}`] || 0;
            const distance = current > 0 ? ((a.target_price_usd - current) / current) * 100 : 0;
            return (
              <AlertCard
                key={a.id}
                a={a}
                current={current}
                distance={distance}
                onToggle={() => toggleAlert(a)}
                onDelete={() => deleteAlert(a.id)}
              />
            );
          })}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full" data-testid="alerts-table">
            <thead>
              <tr className="text-xs font-mono uppercase tracking-[0.15em] text-zinc-400 border-b border-zinc-800/30">
                <th className="text-left px-6 py-3 font-normal">{t("dash.assets")}</th>
                <th className="text-left px-4 py-3 font-normal">{t("alert.condition")}</th>
                <th className="text-right px-4 py-3 font-normal">{t("alert.target")}</th>
                <th className="text-right px-4 py-3 font-normal">{t("alert.current")}</th>
                <th className="text-right px-4 py-3 font-normal">{t("alert.distance")}</th>
                <th className="text-left px-4 py-3 font-normal">{t("alert.status")}</th>
                <th className="text-right px-6 py-3 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {loading && [0,1,2,3,4].map(i => <SkeletonTableRow key={i} cols={7} />)}
              {!loading && alerts.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-zinc-600 font-mono text-sm" data-testid="no-alerts">
                  {t("alert.empty_state")} <span className="text-zinc-300">+ {t("alert.new")}</span>.
                </td></tr>
              )}
              {alerts.map((a) => {
                const current = livePrices[`${a.asset_type}:${a.symbol.toUpperCase()}`] || 0;
                const distance = current > 0 ? ((a.target_price_usd - current) / current) * 100 : 0;
                const isAbove = a.condition === "above";
                return (
                  <tr key={a.id} className="border-b border-zinc-800/30 hover:bg-zinc-900/40 transition-colors" data-testid={`alert-row-${a.id}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <AssetIcon asset={a} size={26}/>
                        <div>
                          <div className="font-mono text-zinc-100">{a.symbol}</div>
                          <div className="text-xs text-zinc-400">{a.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider px-2 py-1 rounded border ${
                        isAbove ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-rose-400 border-rose-500/30 bg-rose-500/10"
                      }`}>
                        {isAbove ? <ArrowUp className="w-3 h-3"/> : <ArrowDown className="w-3 h-3"/>}
                        {isAbove ? t("alert.above") : t("alert.below")}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-zinc-100">{fmtCurrency(a.target_price_usd, "USD")}</td>
                    <td className="px-4 py-4 text-right font-mono text-zinc-300">{current ? fmtCurrency(current, "USD") : "—"}</td>
                    <td className={`px-4 py-4 text-right font-mono text-sm ${distance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{current ? fmtPct(distance) : "—"}</td>
                    <td className="px-4 py-4">
                      <button onClick={() => toggleAlert(a)} className="text-left" data-testid={`alert-toggle-${a.id}`}>
                        {a.active ? (
                          <span className="inline-flex items-center gap-1 text-xs font-mono text-blue-400 border border-blue-500/30 bg-blue-500/10 px-2 py-1 rounded">
                            <Bell className="w-3 h-3"/> {t("alert.active")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-mono text-zinc-400 border border-zinc-800 bg-zinc-900 px-2 py-1 rounded" title={a.triggered_at ? t("alert.triggered_at", { date: a.triggered_at }) : t("alert.paused")}>
                            <Check className="w-3 h-3"/> {a.triggered_at ? t("alert.triggered") : t("alert.paused")}
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => deleteAlert(a.id)} className="text-zinc-600 hover:text-rose-400 transition-colors" data-testid={`alert-delete-${a.id}`}>
                        <Trash2 className="w-4 h-4"/>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NewAlertDialog({ open, setOpen, holdings, onSaved, defaultSymbol, defaultAssetType, defaultPrice }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [pickedKey, setPickedKey] = useState("");
  const [searchPicked, setSearchPicked] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchType, setSearchType] = useState("crypto");
  const [condition, setCondition] = useState("above");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setPickedKey(""); setSearchPicked(null); setSearchTerm(""); setResults([]);
      setCondition("above"); setTarget(""); setNote("");
    } else if (defaultSymbol) {
      // Pre-fill from asset page
      const at = defaultAssetType === "crypto" ? "crypto" : "stock";
      setSearchType(at);
      setSearchTerm(defaultSymbol.toUpperCase());
      setSearchPicked({
        symbol: defaultSymbol.toUpperCase(),
        name: defaultSymbol.toUpperCase(),
        asset_type: defaultAssetType || "stock",
        price_usd: defaultPrice ? parseFloat(defaultPrice) : undefined,
      });
      // Pre-fill target with current price if available
      if (defaultPrice) setTarget(String(parseFloat(defaultPrice).toFixed(4)));
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!searchTerm || searchTerm.length < 1) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const path = searchType === "crypto" ? "/search/crypto" : "/search/stock";
        const { data } = await api.get(path, { params: { q: searchTerm } });
        setResults(data || []);
      } catch {}
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [searchTerm, searchType]);

  const pickedAsset = (() => {
    if (searchPicked) return searchPicked;
    if (!pickedKey) return null;
    const [t, s] = pickedKey.split(":");
    return holdings.find((h) => h.asset_type === t && h.symbol === s);
  })();

  const currentPrice = pickedAsset?.price_usd || pickedAsset?.price || 0;

  const save = async () => {
    if (!pickedAsset) { toast.error(t("alert.pick_asset_error")); return; }
    if (!target) { toast.error(t("alert.target_required")); return; }
    setSaving(true);
    try {
      await api.post("/alerts", {
        symbol: pickedAsset.symbol,
        asset_type: pickedAsset.asset_type || (pickedAsset.id ? "crypto" : "stock"),
        coingecko_id: pickedAsset.coingecko_id || (pickedAsset.id && searchType === "crypto" ? pickedAsset.id : undefined),
        name: pickedAsset.name,
        condition,
        target_price_usd: parseFloat(target),
        note,
      });
      toast.success(t("alert.created"));
      setOpen(false);
      onSaved?.();
      requestSidebarRefresh();
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 402 && detail?.reason === "alert_limit") {
        toast.error(t("alerts.limit_msg", { limit: detail.limit }), {
          action: { label: t("common.upgrade"), onClick: () => navigate("/pricing") },
        });
      } else {
        toast.error(formatApiErrorDetail(detail) || t("common.error"));
      }
    }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-zinc-100 text-zinc-950 hover:bg-white font-medium" data-testid="new-alert-btn">
          <Plus className="w-4 h-4 mr-1"/> {t("alert.new")}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display font-light text-2xl">{t("alert.new")}</DialogTitle>
          <DialogDescription className="text-zinc-400 text-sm">{t("alert.subtitle")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {holdings.length > 0 && (
            <div>
              <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("alert.from_holdings")}</Label>
              <Select value={pickedKey} onValueChange={(v) => { setPickedKey(v); setSearchPicked(null); }}>
                <SelectTrigger className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="alert-holding-select">
                  <SelectValue placeholder={t("alert.pick_held")}/>
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {holdings.map((h) => (
                    <SelectItem key={`${h.asset_type}:${h.symbol}`} value={`${h.asset_type}:${h.symbol}`}>
                      {h.symbol} · {h.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="text-xs text-zinc-400 font-mono uppercase tracking-[0.2em] text-center">{t("alert.or_search")}</div>

          <Tabs value={searchType} onValueChange={setSearchType}>
            <TabsList className="w-full bg-zinc-900/50 border border-zinc-800">
              <TabsTrigger value="crypto" className="flex-1 data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950" data-testid="alert-search-crypto">{t("common.crypto")}</TabsTrigger>
              <TabsTrigger value="stock" className="flex-1 data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950" data-testid="alert-search-stock">{t("common.stocks")}</TabsTrigger>
            </TabsList>
          </Tabs>

          <Input
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setSearchPicked(null); setPickedKey(""); }}
            placeholder={searchType === "crypto" ? "bitcoin, eth..." : "Apple, AAPL..."}
            className="bg-zinc-900/50 border-zinc-800"
            data-testid="alert-search-input"
          />
          {searching && <div className="text-xs text-zinc-400 font-mono">{t("alert.searching")}</div>}
          {results.length > 0 && (
            <div className="max-h-40 overflow-y-auto border border-zinc-800 rounded-md bg-zinc-900/50">
              {results.map((r) => (
                <button key={r.id || r.symbol} onClick={() => { setSearchPicked({ ...r, asset_type: searchType, price_usd: r.price }); setResults([]); setSearchTerm(`${r.symbol} — ${r.name || ""}`); }} className="w-full text-left px-3 py-2 hover:bg-zinc-800/60 text-sm flex justify-between" data-testid={`alert-search-result-${(r.id || r.symbol).toLowerCase()}`}>
                  <div><span className="font-mono text-zinc-100">{r.symbol}</span> <span className="text-zinc-400 ml-2">{r.name}</span></div>
                  {r.price && <span className="font-mono text-zinc-400 text-xs">${Number(r.price).toFixed(2)}</span>}
                </button>
              ))}
            </div>
          )}

          {pickedAsset && (
            <div className="border border-zinc-800 rounded-md p-3 bg-zinc-900/30 flex items-center justify-between">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-zinc-400">{t("alert.selected")}</div>
                <div className="font-mono text-zinc-100">{pickedAsset.symbol} · {pickedAsset.name}</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-mono text-zinc-400">{t("alert.current_price")}</div>
                <div className="font-mono text-zinc-200">{currentPrice ? fmtCurrency(currentPrice, "USD") : "—"}</div>
              </div>
          </div>
          )}

          {pickedAsset && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("alert.condition")}</Label>
                <Tabs value={condition} onValueChange={setCondition}>
                  <TabsList className="mt-2 w-full bg-zinc-900/50 border border-zinc-800">
                    <TabsTrigger value="above" className="flex-1 data-[state=active]:bg-emerald-500/90 data-[state=active]:text-zinc-950" data-testid="alert-condition-above">
                      <ArrowUp className="w-3.5 h-3.5 mr-1"/> {t("alert.above")}
                    </TabsTrigger>
                    <TabsTrigger value="below" className="flex-1 data-[state=active]:bg-rose-500/90 data-[state=active]:text-zinc-950" data-testid="alert-condition-below">
                      <ArrowDown className="w-3.5 h-3.5 mr-1"/> {t("alert.below")}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div>
                <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("alert.target")} (USD)</Label>
                <Input type="number" step="any" value={target} onChange={(e) => setTarget(e.target.value)}
                  placeholder="50000" className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="alert-target-input"/>
              </div>
              <div>
                <Label className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">{t("alert.note")}</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder={t("alert.note_placeholder")} className="mt-2 bg-zinc-900/50 border-zinc-800" data-testid="alert-note-input"/>
              </div>
              <Button onClick={save} disabled={saving} className="w-full bg-zinc-100 text-zinc-950 hover:bg-white font-medium" data-testid="alert-submit">
                {saving ? t("common.saving") : t("alert.create")}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// One alert, stacked as a card — the mobile (< md) counterpart to a row in
// the desktop <table>. Same fields, just laid out vertically instead of in
// 7 columns that only ever produced horizontal scroll on a phone.
function AlertCard({ a, current, distance, onToggle, onDelete }) {
  const { t } = useI18n();
  const isAbove = a.condition === "above";
  return (
    <div className="p-4 space-y-3" data-testid={`alert-card-${a.id}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <AssetIcon asset={a} size={26}/>
          <div className="min-w-0">
            <div className="font-mono text-zinc-100 truncate">{a.symbol}</div>
            <div className="text-xs text-zinc-400 truncate">{a.name}</div>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider px-2 py-1 rounded border shrink-0 ${
          isAbove ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-rose-400 border-rose-500/30 bg-rose-500/10"
        }`}>
          {isAbove ? <ArrowUp className="w-3 h-3"/> : <ArrowDown className="w-3 h-3"/>}
          {isAbove ? t("alert.above") : t("alert.below")}
        </span>
      </div>

      <div className="flex items-center justify-between font-mono text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-400">{t("alert.target")}</div>
          <div className="text-zinc-100">{fmtCurrency(a.target_price_usd, "USD")}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-400">{t("alert.current")}</div>
          <div className="text-zinc-300">{current ? fmtCurrency(current, "USD") : "—"}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-400">{t("alert.distance")}</div>
          <div className={distance >= 0 ? "text-emerald-400" : "text-rose-400"}>{current ? fmtPct(distance) : "—"}</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={onToggle} className="text-left" data-testid={`alert-toggle-card-${a.id}`}>
          {a.active ? (
            <span className="inline-flex items-center gap-1 text-xs font-mono text-blue-400 border border-blue-500/30 bg-blue-500/10 px-2 py-1 rounded">
              <Bell className="w-3 h-3"/> {t("alert.active")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-mono text-zinc-400 border border-zinc-800 bg-zinc-900 px-2 py-1 rounded" title={a.triggered_at ? t("alert.triggered_at", { date: a.triggered_at }) : t("alert.paused")}>
              <Check className="w-3 h-3"/> {a.triggered_at ? t("alert.triggered") : t("alert.paused")}
            </span>
          )}
        </button>
        <button onClick={onDelete} className="text-zinc-600 hover:text-rose-400 transition-colors" data-testid={`alert-delete-card-${a.id}`}>
          <Trash2 className="w-4 h-4"/>
        </button>
      </div>
    </div>
  );
}

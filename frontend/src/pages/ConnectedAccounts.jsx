import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useI18n } from "../context/I18nContext";
import { toast } from "sonner";
import { RefreshCw, Trash2, Plus, CheckCircle, AlertCircle, Clock, ChevronDown, ChevronUp, ExternalLink, FileUp } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import ImportCsvDialog from "../components/ImportCsvDialog";
import { usePlan } from "../hooks/usePlan";
import UpgradeOverlay from "../components/UpgradeOverlay";

// -- Broker metadata ----------------------------------------------------------
const getBROKERS = (t) => ({
  degiro: {
    name: "DEGIRO",
    logo: "🇳🇱",
    description: t("brokers.degiro.description"),
    fields: [
      { key: "username", label: t("brokers.field.username"), type: "text",     placeholder: "your@email.com" },
      { key: "password", label: t("brokers.field.password"), type: "password", placeholder: "..." },
    ],
    labelDefault: "DEGIRO",
    endpoint: "/brokers/degiro",
    security: [t("brokers.degiro.security.0"), t("brokers.degiro.security.1")],
  },
  ibkr: {
    name: "Interactive Brokers",
    logo: "🏦",
    description: t("brokers.ibkr.description"),
    fields: [
      { key: "token",    label: t("brokers.field.flex_token"),    type: "password", placeholder: t("brokers.ibkr.placeholder.token") },
      { key: "query_id", label: t("brokers.field.flex_query_id"), type: "text",     placeholder: "e.g. 123456" },
    ],
    labelDefault: "Interactive Brokers",
    endpoint: "/brokers/ibkr",
    security: [t("brokers.ibkr.security.0"), t("brokers.ibkr.security.1")],
  },
  trading212: {
    name: "Trading 212",
    logo: "📈",
    description: t("brokers.t212.description"),
    fields: [
      { key: "api_key", label: "API Key", type: "password", placeholder: t("brokers.t212.placeholder.api_key") },
    ],
    labelDefault: "Trading 212",
    endpoint: "/brokers/trading212",
    security: [t("brokers.t212.security.0"), t("brokers.t212.security.1")],
  },
  binance: {
    name: "Binance",
    logo: "🟡",
    description: t("brokers.binance.description"),
    fields: [
      { key: "api_key",    label: "API Key",    type: "password", placeholder: t("brokers.placeholder.api_key") },
      { key: "api_secret", label: "API Secret", type: "password", placeholder: t("brokers.placeholder.api_secret") },
    ],
    labelDefault: "Binance",
    endpoint: "/brokers/binance",
    security: [t("brokers.binance.security.0"), t("brokers.binance.security.1"), t("brokers.binance.security.2"), t("brokers.binance.security.3")],
  },
  coinbase: {
    name: "Coinbase",
    logo: "🔵",
    description: t("brokers.coinbase.description"),
    fields: [
      { key: "api_key",    label: t("brokers.coinbase.field.key_name"),    type: "password", placeholder: t("brokers.coinbase.placeholder.key") },
      { key: "api_secret", label: t("brokers.coinbase.field.secret_pem"),  type: "password", placeholder: t("brokers.coinbase.placeholder.pem") },
      { key: "passphrase", label: t("brokers.coinbase.field.passphrase"),  type: "password", placeholder: t("brokers.coinbase.placeholder.passphrase") },
    ],
    labelDefault: "Coinbase",
    endpoint: "/brokers/coinbase",
    optionalFields: ["passphrase"],
    security: [t("brokers.coinbase.security.0"), t("brokers.coinbase.security.1")],
  },
  kraken: {
    name: "Kraken",
    logo: "🐙",
    description: t("brokers.kraken.description"),
    fields: [
      { key: "api_key",    label: "API Key",    type: "password", placeholder: t("brokers.placeholder.api_key") },
      { key: "api_secret", label: "API Secret", type: "password", placeholder: t("brokers.placeholder.private_key") },
    ],
    labelDefault: "Kraken",
    endpoint: "/brokers/kraken",
    security: [t("brokers.kraken.security.0"), t("brokers.kraken.security.1")],
  },
  manual: {
    name: t("brokers.manual.name"),
    logo: "✏️",
    description: t("brokers.manual.description"),
    fields: [],
    labelDefault: t("brokers.manual.label_default"),
    endpoint: null,
    manual: true,
  },
});

// -- Status badge -------------------------------------------------------------
function StatusBadge({ conn, t }) {
  if (conn._suspicious) {
    return (
      <span
        className="flex items-center gap-1 text-xs text-amber-400 cursor-help"
        title={t("brokers.status_suspicious_tip")}
      >
        <AlertCircle className="w-3 h-3" /> {t("brokers.status_suspicious")}
      </span>
    );
  }
  if (conn._manual) {
    return (
      <span className="flex items-center gap-1 text-xs text-zinc-400">
        ✏️ {t("brokers.status_manual")}
      </span>
    );
  }
  if (conn.last_error) {
    return (
      <span
        className="flex items-center gap-1 text-xs text-red-400 cursor-help"
        title={conn.last_error}
      >
        <AlertCircle className="w-3 h-3" /> {t("brokers.status_error")}
      </span>
    );
  }
  if (conn.last_synced_at) {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-400">
        <CheckCircle className="w-3 h-3" /> {t("brokers.status_synced")}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-zinc-500">
      <Clock className="w-3 h-3" /> {t("brokers.status_never")}
    </span>
  );
}

// -- Add form -----------------------------------------------------------------
function AddBrokerForm({ brokerKey, onAdded, onCancel }) {
  const { t } = useI18n();
  const BROKERS = getBROKERS(t);
  const meta = BROKERS[brokerKey];
  const [values, setValues] = useState({});
  const [label, setLabel] = useState(meta.labelDefault);
  const [loading, setLoading] = useState(false);

  const set = (key, val) => setValues((v) => ({ ...v, [key]: val }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (meta.manual) {
        const { data } = await api.post("/wallets", { name: label.trim(), type: "broker", currency: "USD" });
        toast.success(`"${label}" account created. Add transactions manually via Transactions.`);
        onAdded({
          id: `manual-${data.id}`,
          broker: "manual",
          label: label.trim(),
          last_synced_at: null,
          last_imported: 0,
          last_error: null,
          _wallet_id: data.id,
          _manual: true,
        });
      } else {
        const { data } = await api.post(meta.endpoint, { ...values, label });
        toast.success(`${meta.name} connected successfully`);
        onAdded(data);
      }
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : `Failed to connect ${meta.name}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 mt-4 pt-4 border-t border-zinc-800">
      <div>
        <Label className="text-xs font-mono uppercase tracking-widest text-zinc-500">
          {meta.manual ? "Account name" : "Label"}
        </Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="mt-1.5 bg-zinc-900/50 border-zinc-800"
          placeholder={meta.manual ? t("brokers.manual_placeholder") || "ex: XTB, eToro, Revolut…" : t("brokers.label_placeholder") || "ex: O meu DEGIRO"}
          autoFocus
        />
      </div>
      {meta.fields.map((f) => {
        const optional = (meta.optionalFields || []).includes(f.key);
        return (
          <div key={f.key}>
            <Label className="text-xs font-mono uppercase tracking-widest text-zinc-500">
              {f.label}{optional && <span className="ml-1 text-zinc-600 normal-case not-italic">({t("common.optional") || "opcional"})</span>}
            </Label>
            <Input
              type={f.type}
              placeholder={f.placeholder}
              value={values[f.key] || ""}
              onChange={(e) => set(f.key, e.target.value)}
              required={!optional}
              className="mt-1.5 bg-zinc-900/50 border-zinc-800 font-mono"
            />
          </div>
        );
      })}
      <p className="text-xs text-zinc-500 leading-relaxed">{meta.description}</p>
      {meta.security && (
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-2.5 space-y-1">
          <div className="text-xs font-mono uppercase tracking-widest text-amber-400/80 mb-1.5">{t("brokers.security_checklist") || "Security checklist"}</div>
          {meta.security.map((note, i) => (
            <div key={i} className="text-xs text-zinc-400 leading-relaxed">{note}</div>
          ))}
          <div className="text-xs text-zinc-600 mt-1.5">🔒 {t("brokers.aes_note") || "Your credentials are encrypted with AES-256 envelope encryption before being stored."}</div>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={loading || !label.trim()} className="bg-blue-500 hover:bg-blue-400 text-white">
          {loading
            ? (meta.manual ? (t("brokers.creating") || "A criar…") : (t("brokers.connecting") || "A ligar…"))
            : (meta.manual ? `${t("brokers.create_btn") || "Criar"} "${label || "conta"}"` : `${t("brokers.connect_btn") || "Ligar"} ${meta.name}`)}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="border-zinc-800 text-zinc-400">
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

// -- Connection card ----------------------------------------------------------
function ConnectionCard({ conn, wallets, onDelete, onSynced }) {
  const { t } = useI18n();
  const BROKERS = getBROKERS(t);
  const meta = BROKERS[conn.broker] || {};
  const [syncing, setSyncing] = useState(false);
  const [walletId, setWalletId] = useState(wallets[0]?.id || "");
  const [expanded, setExpanded] = useState(false);

  const sync = async () => {
    setSyncing(true);
    try {
      await api.post(`/brokers/${conn.id}/sync`, null, {
        params: walletId ? { wallet_id: walletId } : {},
      });
      toast.info(t("brokers.sync_started"));
      // Poll after 8s to pick up the background result
      setTimeout(async () => {
        try {
          const { data } = await api.get("/brokers");
          const updated = data.find((c) => c.id === conn.id);
          if (updated) {
            onSynced(updated);
            if (updated.last_error) {
              toast.error(updated.last_error, { duration: 8000 });
            } else {
              const n = updated.last_imported ?? 0;
              toast.success(
                n > 0
                  ? `${n} ${t("brokers.transactions")} ${t("brokers.sync_imported")}`
                  : t("brokers.sync_up_to_date")
              );
            }
          }
        } catch {}
      }, 8000);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : t("brokers.sync_failed"), { duration: 8000 });
    } finally {
      setSyncing(false);
    }
  };

  const doDelete = async () => {
    if (!window.confirm(`${t("brokers.remove_confirm") || "Remover"} ${conn.label}? ${t("brokers.remove_confirm_detail") || "As transacoes importadas nao serao apagadas."}`)) return;
    try {
      await api.delete(`/brokers/${conn.id}`);
      toast.success(`${conn.label} ${t("brokers.disconnected") || "desligado"}`);
      onDelete(conn.id);
    } catch {
      toast.error(t("brokers.remove_failed") || "Falhou ao remover ligacao.");
    }
  };

  const lastSync = conn.last_synced_at
    ? new Date(conn.last_synced_at).toLocaleString()
    : "—";

  return (
    <div className="border border-zinc-800 rounded-xl p-4 space-y-3 bg-zinc-900/40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{meta.logo || "🏦"}</span>
          <div>
            <div className="text-sm font-medium text-zinc-200">{conn.label}</div>
            <div className="text-xs text-zinc-500">{meta.name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge conn={conn} t={t} />
          <button onClick={() => setExpanded((v) => !v)} className="text-zinc-500 hover:text-zinc-300">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 pt-2 border-t border-zinc-800">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-zinc-500 mb-0.5">{t("brokers.last_sync") || "Ult. sincronizacao"}</div>
              <div className="text-zinc-300 font-mono">{lastSync}</div>
            </div>
            <div>
              <div className="text-zinc-500 mb-0.5">{t("brokers.imported_count") || "Importadas"}</div>
              <div className="text-zinc-300">{conn.last_imported ?? 0} {t("brokers.transactions") || "transacoes"}</div>
            </div>
          </div>

          {conn.last_error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {conn.last_error}
            </div>
          )}

          {wallets.length > 1 && (
            <div>
              <Label className="text-xs font-mono uppercase tracking-widest text-zinc-500">{t("brokers.import_wallet") || "Importar para carteira"}</Label>
              <select
                value={walletId}
                onChange={(e) => setWalletId(e.target.value)}
                className="mt-1.5 w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-300"
              >
                <option value="">— {t("brokers.no_wallet") || "sem carteira"} —</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2">
            {conn._manual ? (
              <Link
                to={conn._wallet_id ? `/transactions?wallet=${conn._wallet_id}` : "/transactions"}
                className="inline-flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-md transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" /> {t("brokers.add_transactions") || "Adicionar transacoes"}
              </Link>
            ) : (
              <Button
                size="sm"
                onClick={sync}
                disabled={syncing}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? (t("brokers.syncing") || "A sincronizar…") : (t("brokers.sync_now") || "Sincronizar")}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={doDelete}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> {t("common.remove") || "Remover"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// -- Main page ----------------------------------------------------------------
export default function ConnectedAccounts() {
  const { t } = useI18n();
  const { isPro } = usePlan();
  const BROKERS = getBROKERS(t);
  const [connections, setConnections] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingBroker, setAddingBroker] = useState(null);

  const load = async () => {
    try {
      const [conns, ws] = await Promise.all([
        api.get("/brokers"),
        api.get("/wallets"),
      ]);
      setConnections(conns.data);
      setWallets(ws.data);
    } catch {
      toast.error("Failed to load connections.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onAdded = (conn) => {
    setConnections((prev) => [conn, ...prev]);
    setAddingBroker(null);
  };

  const onDelete = (id) => setConnections((prev) => prev.filter((c) => c.id !== id));
  const onSynced = (updated) => setConnections((prev) => prev.map((c) => c.id === updated.id ? updated : c));

  const connected = new Set(connections.map((c) => c.broker));

  return (
    <div className="relative max-w-2xl mx-auto space-y-6 fade-in">
      {!isPro && <UpgradeOverlay feature="Broker Sync" />}
      <div>
        <h1 className="font-display text-3xl font-light tracking-tight text-zinc-50">
          {t("nav.brokers")}
        </h1>
        <p className="text-xs font-mono uppercase tracking-widest text-zinc-500 mt-1.5">
          {t("brokers.subtitle")}
        </p>
      </div>

      {/* Existing connections */}
      {loading ? (
        <div className="text-zinc-500 text-sm font-mono animate-pulse">{t("common.loading") || "A carregar…"}</div>
      ) : connections.length > 0 ? (
        <div className="space-y-3">
          {connections.map((c) => (
            <ConnectionCard key={c.id} conn={c} wallets={wallets} onDelete={onDelete} onSynced={onSynced} />
          ))}
        </div>
      ) : (
        <div className="border border-zinc-800/50 rounded-xl p-10 text-center text-zinc-500 text-sm">
          {t("brokers.no_connections") || "Nenhuma conta ligada ainda."}
        </div>
      )}

      {/* Add broker section */}
      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5 space-y-4">
        <div className="text-sm font-medium text-zinc-200">{t("brokers.add_title")}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(BROKERS).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => setAddingBroker(addingBroker === key ? null : key)}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors text-sm ${
                addingBroker === key
                  ? "border-blue-500/50 bg-blue-500/10 text-zinc-100"
                  : connected.has(key)
                  ? "border-zinc-700 text-zinc-500 cursor-default"
                  : "border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800/40"
              }`}
              disabled={connected.has(key)}
            >
              <span className="text-2xl">{meta.logo}</span>
              <span className="text-xs font-medium text-center leading-tight">{meta.name}</span>
              {connected.has(key) && <span className="text-xs text-emerald-400">{t("brokers.connected") || "Ligado"}</span>}
            </button>
          ))}
        </div>

        {addingBroker && (
          <AddBrokerForm
            brokerKey={addingBroker}
            onAdded={onAdded}
            onCancel={() => setAddingBroker(null)}
          />
        )}
      </div>

      {/* CSV / XLSX import section */}
      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-zinc-200 flex items-center gap-2">
              <FileUp className="w-4 h-4 text-zinc-400" /> {t("import.title")}
            </div>
            <p className="text-xs text-zinc-500 mt-1">{t("import.subtitle")}</p>
          </div>
        </div>
        <ImportCsvDialog
          wallets={wallets}
          onSaved={load}
          trigger={
            <Button variant="outline" size="sm" className="w-full bg-zinc-800/50 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
              <FileUp className="w-4 h-4 mr-2" /> {t("import.button")}
            </Button>
          }
        />
      </div>
    </div>
  );
}

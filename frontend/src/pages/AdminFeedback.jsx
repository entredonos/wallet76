import React, { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import {
  Star, MessageSquare, Lightbulb, Bug, HelpCircle,
  RefreshCw, ThumbsUp, Users, UserCheck, CalendarClock,
  CalendarDays, Search, Trash2, AlertTriangle, X, ShieldCheck,
} from "lucide-react";

const CAT_META = {
  rating:   { icon: Star,        label: "Rating",    color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/30" },
  question: { icon: HelpCircle,  label: "Question",  color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/30" },
  idea:     { icon: Lightbulb,   label: "Idea",      color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  bug:      { icon: Bug,         label: "Bug",       color: "text-rose-400",    bg: "bg-rose-500/10 border-rose-500/30" },
};

function Stars({ n }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={`w-3.5 h-3.5 ${i <= n ? "text-amber-400 fill-amber-400" : "text-zinc-700"}`} />
      ))}
    </div>
  );
}

function TierBadge({ tier }) {
  const cfg = {
    free:    { label: "Free",    cls: "bg-zinc-800 text-zinc-400 border-zinc-700" },
    monthly: { label: "Pro M",   cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    yearly:  { label: "Pro A",   cls: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  };
  const c = cfg[tier] || cfg.free;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border ${c.cls}`}>
      {c.label}
    </span>
  );
}

function DeleteModal({ user, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm mx-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <div className="text-zinc-100 font-medium text-sm">Eliminar utilizador?</div>
            <div className="text-zinc-500 text-xs">Esta acao e irreversivel.</div>
          </div>
        </div>
        <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-4 py-3 space-y-1">
          <div className="text-zinc-200 text-sm font-mono">{user.email}</div>
          <div className="text-zinc-500 text-xs">{user.name}</div>
        </div>
        <p className="text-zinc-400 text-xs leading-relaxed">
          Serao eliminados todos os dados: carteiras, transacoes, snapshots, alertas, watchlist e feedback.
        </p>
        <div className="flex gap-3 pt-1">
          <button onClick={onCancel} className="flex-1 border border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg py-2 text-sm transition-colors">
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors">
            {loading ? "A eliminar..." : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserRow({ u, onDelete }) {
  const date = u.created_at
    ? new Date(u.created_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "2-digit" })
    : "-";
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-zinc-900/40 border border-zinc-800/50 rounded-xl">
      <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
        <span className="text-xs font-mono text-zinc-400 uppercase">{(u.name || u.email || "?")[0]}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-zinc-200 font-mono truncate">{u.email}</span>
          <TierBadge tier={u.tier} />
          {u.email_verified && <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" title="Email verificado" />}
        </div>
        <div className="text-xs text-zinc-500 font-mono mt-0.5">
          {u.name && u.name !== u.email ? `${u.name} · ` : ""}{date}
        </div>
      </div>
      <button onClick={() => onDelete(u)} className="p-2 rounded-lg text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0" title="Eliminar">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function UsersTab() {
  const [stats, setStats]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState(null);
  const [searching, setSearching] = useState(false);
  const [toDelete, setToDelete]   = useState(null);
  const [deleting, setDeleting]   = useState(false);
  const [toast, setToast]         = useState(null);

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/users/stats");
      setStats(data);
    } catch { setStats(null); }
    setLoading(false);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) { setResults(null); return; }
    setSearching(true);
    try {
      const { data } = await api.get(`/admin/users/search?q=${encodeURIComponent(query.trim())}`);
      setResults(Array.isArray(data) ? data : []);
    } catch { setResults([]); }
    setSearching(false);
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/users/${toDelete.id}`);
      showToast(`${toDelete.email} eliminado.`, "ok");
      const deleted = toDelete;
      setToDelete(null);
      setResults(prev => prev ? prev.filter(u => u.id !== deleted.id) : prev);
      loadStats();
    } catch (err) {
      showToast(err?.response?.data?.detail || "Erro ao eliminar.", "err");
      setToDelete(null);
    }
    setDeleting(false);
  };

  const STAT_CARDS = [
    { label: "Total",       key: "total",   icon: Users,         color: "text-zinc-300",   bg: "bg-zinc-800/60 border-zinc-700/50" },
    { label: "Free",        key: "free",    icon: UserCheck,     color: "text-zinc-400",   bg: "bg-zinc-800/40 border-zinc-800/50" },
    { label: "Pro Mensal",  key: "monthly", icon: CalendarClock, color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/30" },
    { label: "Pro Anual",   key: "yearly",  icon: CalendarDays,  color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/30" },
  ];

  const displayList = results ?? stats?.last10 ?? [];

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-mono shadow-xl ${
          toast.type === "ok" ? "bg-emerald-900/80 border-emerald-700 text-emerald-300" : "bg-rose-900/80 border-rose-700 text-rose-300"
        }`}>
          {toast.msg}
          <button onClick={() => setToast(null)}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map(({ label, key, icon: Icon, color, bg }) => (
          <div key={key} className={`border rounded-xl p-4 flex items-center gap-3 ${bg}`}>
            <Icon className={`w-5 h-5 ${color} shrink-0`} />
            <div>
              <div className={`text-2xl font-mono font-light ${color}`}>{loading ? "-" : (stats?.[key] ?? 0)}</div>
              <div className="text-xs font-mono text-zinc-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); if (!e.target.value) setResults(null); }}
            placeholder="Pesquisar por email ou nome..."
            className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl pl-9 pr-4 py-2.5 text-sm font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
          />
        </div>
        <button type="submit" disabled={searching} className="px-4 py-2.5 bg-zinc-100 text-zinc-950 rounded-xl text-sm font-medium hover:bg-zinc-200 disabled:opacity-50 transition-colors">
          {searching ? "..." : "Pesquisar"}
        </button>
        {results !== null && (
          <button type="button" onClick={() => { setResults(null); setQuery(""); }} className="px-3 py-2.5 border border-zinc-700 text-zinc-400 rounded-xl hover:text-zinc-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </form>

      <div className="flex items-center justify-between">
        <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
          {results !== null ? `${results.length} resultado(s) para "${query}"` : "Ultimos 10 registados"}
        </div>
        {results === null && (
          <button onClick={loadStats} className="text-xs font-mono text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors">
            <RefreshCw className="w-3 h-3" /> Atualizar
          </button>
        )}
      </div>

      {loading && results === null ? (
        <div className="text-zinc-500 font-mono text-sm">A carregar...</div>
      ) : displayList.length === 0 ? (
        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-10 text-center">
          <Users className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
          <div className="text-zinc-500 text-sm font-mono">Nenhum utilizador encontrado.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {displayList.map(u => <UserRow key={u.id} u={u} onDelete={setToDelete} />)}
        </div>
      )}

      {toDelete && (
        <DeleteModal user={toDelete} onConfirm={handleDelete} onCancel={() => setToDelete(null)} loading={deleting} />
      )}
    </div>
  );
}

function FeedbackTab() {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/feedback");
      setItems(Array.isArray(data) ? data : []);
    } catch { setItems([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered  = filter === "all" ? items : items.filter(i => i.category === filter);
  const counts    = items.reduce((acc, i) => { acc[i.category] = (acc[i.category] || 0) + 1; return acc; }, {});
  const avgRating = items.filter(i => i.rating).reduce((s, i) => s + i.rating, 0) / (items.filter(i => i.rating).length || 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(CAT_META).map(([key, m]) => {
          const Icon = m.icon;
          return (
            <div key={key} className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-4 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${m.bg}`}>
                <Icon className={`w-4 h-4 ${m.color}`} />
              </div>
              <div>
                <div className="text-xl font-mono font-light text-zinc-100">{counts[key] || 0}</div>
                <div className="text-xs font-mono text-zinc-500">{m.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {items.some(i => i.rating) && (
        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-4 flex items-center gap-4">
          <ThumbsUp className="w-5 h-5 text-amber-400" />
          <div className="text-sm font-mono text-zinc-300">
            Avaliacao media: <span className="text-amber-400 font-medium">{avgRating.toFixed(1)}</span>/5
          </div>
          <Stars n={Math.round(avgRating)} />
          <button onClick={load} className="ml-auto flex items-center gap-1 text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors">
            <RefreshCw className="w-3 h-3" /> Atualizar
          </button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {["all", "rating", "question", "idea", "bug"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors capitalize ${
              filter === f ? "bg-zinc-100 text-zinc-950 border-zinc-100" : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
            }`}
          >
            {f === "all" ? `Todos (${items.length})` : `${CAT_META[f]?.label} (${counts[f] || 0})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-zinc-500 font-mono text-sm">A carregar...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-12 text-center">
          <MessageSquare className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
          <div className="text-zinc-500 text-sm">Nenhum feedback nesta categoria.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item, i) => {
            const meta = CAT_META[item.category] || CAT_META.question;
            const Icon = meta.icon;
            const date = new Date(item.created_at).toLocaleString("pt-PT", {
              day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit",
            });
            return (
              <div key={i} className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-md border flex items-center justify-center ${meta.bg}`}>
                      <Icon className={`w-3 h-3 ${meta.color}`} />
                    </div>
                    <span className={`text-xs font-mono font-medium uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
                    {item.rating && <Stars n={item.rating} />}
                  </div>
                  <div className="text-xs font-mono text-zinc-600 shrink-0">{date}</div>
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed font-mono whitespace-pre-wrap">{item.message}</p>
                <div className="text-xs text-zinc-600 font-mono">{item.user_email || "anonimo"}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminFeedback() {
  const { user } = useAuth();
  const [tab, setTab] = useState("feedback");

  if (user?.email !== "entredonos@gmail.com") {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500 font-mono text-sm">
        Acesso restrito.
      </div>
    );
  }

  return (
    <div className="space-y-8 fade-in">
      <div>
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">Admin</div>
        <h1 className="font-display text-4xl font-light tracking-tight mt-2">Dashboard</h1>
      </div>

      <div className="flex gap-1 border-b border-zinc-800">
        {[
          { key: "feedback", label: "Feedback",     icon: MessageSquare },
          { key: "users",    label: "Utilizadores",  icon: Users },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-mono border-b-2 transition-colors -mb-px ${
              tab === key ? "border-zinc-100 text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "feedback" ? <FeedbackTab /> : <UsersTab />}
    </div>
  );
}

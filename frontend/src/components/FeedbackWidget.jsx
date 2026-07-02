import React, { useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../context/I18nContext";
import { toast } from "sonner";
import { MessageSquarePlus, Star, X, Lightbulb, Bug, HelpCircle, ThumbsUp, Send } from "lucide-react";

const CATEGORIES = [
  { key: "rating",   icon: Star,            labelKey: "feedback.cat_rating"   },
  { key: "question", icon: HelpCircle,      labelKey: "feedback.cat_question" },
  { key: "idea",     icon: Lightbulb,       labelKey: "feedback.cat_idea"     },
  { key: "bug",      icon: Bug,             labelKey: "feedback.cat_bug"      },
];

export default function FeedbackWidget() {
  const { t } = useI18n();
  const [open, setOpen]       = useState(false);
  const [category, setCat]    = useState("rating");
  const [rating, setRating]   = useState(0);
  const [hover, setHover]     = useState(0);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone]       = useState(false);

  const reset = () => {
    setCat("rating"); setRating(0); setHover(0); setMessage(""); setDone(false);
  };

  const close = () => { setOpen(false); setTimeout(reset, 300); };

  const submit = async () => {
    if (!message.trim() && category !== "rating") {
      toast.error(t("feedback.empty") || "Escreve uma mensagem primeiro.");
      return;
    }
    if (category === "rating" && rating === 0) {
      toast.error(t("feedback.no_rating") || "Escolhe uma avaliacao.");
      return;
    }
    setSending(true);
    try {
      await api.post("/feedback", {
        category,
        rating: category === "rating" ? rating : null,
        message: message.trim() || `${rating} estrelas`,
      });
      setDone(true);
    } catch {
      toast.error(t("feedback.error") || "Erro ao enviar. Tenta novamente.");
    } finally {
      setSending(false);
    }
  };

  const catMeta = CATEGORIES.find((c) => c.key === category);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-mono px-3.5 py-2.5 rounded-full shadow-xl transition-all hover:scale-105 active:scale-95"
        title={t("feedback.title") || "Feedback"}
      >
        <MessageSquarePlus className="w-4 h-4" />
        <span className="hidden sm:inline">{t("feedback.btn") || "Feedback"}</span>
      </button>

      {/* Modal backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end p-4 sm:p-6"
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="text-sm font-medium text-zinc-100">{t("feedback.title") || "Feedback"}</div>
              <button onClick={close} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {done ? (
              /* Thank you screen */
              <div className="flex flex-col items-center justify-center py-12 px-6 gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                  <ThumbsUp className="w-6 h-6 text-emerald-400" />
                </div>
                <div className="text-zinc-100 font-medium">{t("feedback.thanks") || "Obrigado pelo feedback!"}</div>
                <div className="text-zinc-500 text-xs text-center">{t("feedback.thanks_sub") || "O teu contributo ajuda a melhorar a app."}</div>
                <button
                  onClick={close}
                  className="mt-2 text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {t("common.close") || "Fechar"}
                </button>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                {/* Category selector */}
                <div className="grid grid-cols-4 gap-2">
                  {CATEGORIES.map(({ key, icon: Icon, labelKey }) => (
                    <button
                      key={key}
                      onClick={() => setCat(key)}
                      className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border text-xs transition-colors ${
                        category === key
                          ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
                          : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[10px] font-mono leading-tight text-center">
                        {t(labelKey) || key}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Stars (only for rating) */}
                {category === "rating" && (
                  <div className="flex items-center justify-center gap-2 py-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onMouseEnter={() => setHover(n)}
                        onMouseLeave={() => setHover(0)}
                        onClick={() => setRating(n)}
                        className="transition-transform hover:scale-110 active:scale-95"
                      >
                        <Star
                          className={`w-8 h-8 transition-colors ${
                            n <= (hover || rating)
                              ? "text-amber-400 fill-amber-400"
                              : "text-zinc-700"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                )}

                {/* Message */}
                <div>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={category === "rating" ? 2 : 4}
                    placeholder={
                      category === "rating"
                        ? (t("feedback.rating_placeholder") || "Comentario opcional…")
                        : category === "question"
                        ? (t("feedback.question_placeholder") || "Qual e a tua duvida?")
                        : category === "idea"
                        ? (t("feedback.idea_placeholder") || "Descreve a tua ideia…")
                        : (t("feedback.bug_placeholder") || "O que aconteceu? Como reproduzir?")
                    }
                    className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:border-zinc-600 font-mono"
                  />
                </div>

                {/* Submit */}
                <button
                  onClick={submit}
                  disabled={sending}
                  className="w-full flex items-center justify-center gap-2 bg-zinc-100 hover:bg-white text-zinc-950 text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {sending ? (t("feedback.sending") || "A enviar…") : (t("feedback.submit") || "Enviar")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

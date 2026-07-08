import React, { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Sparkles } from "lucide-react";
import { useI18n } from "../context/I18nContext";
import { CHANGELOG, LATEST_CHANGELOG_VERSION } from "../data/changelog";

const STORAGE_KEY = "w76_whatsnew_seen";

/**
 * "O que há de novo" — popup mostrado uma vez por versão a utilizadores já
 * autenticados (montado dentro de Protected em App.js, ao lado do
 * LockScreen). Compara a versão de changelog já vista (localStorage) com
 * LATEST_CHANGELOG_VERSION; se for diferente (ou primeira vez), mostra a
 * entrada mais recente de CHANGELOG e marca como vista ao fechar.
 *
 * Isto é o padrão que as apps grandes usam para avisar de novidades sem
 * depender de push notifications: como a app nativa é uma WebView que
 * carrega o site ao vivo, qualquer deploy novo já chega sozinho — isto só
 * lhe dá uma face visível em vez de o utilizador nunca saber o que mudou.
 */
export default function WhatsNewModal() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (seen !== LATEST_CHANGELOG_VERSION) setOpen(true);
    } catch {
      // localStorage indisponível (modo privado, etc.) — não mostra, não crasha.
    }
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, LATEST_CHANGELOG_VERSION); } catch { /* noop */ }
    setOpen(false);
  };

  const entry = CHANGELOG[0];
  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-sm" data-testid="whatsnew-modal">
        <DialogHeader>
          <div className="w-12 h-12 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center mb-3">
            <Sparkles className="w-6 h-6 text-blue-300"/>
          </div>
          <DialogTitle className="text-xl text-zinc-100">{t("whatsnew.title")}</DialogTitle>
          <DialogDescription className="text-zinc-400">{t(entry.titleKey)}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-2.5 my-1">
          {entry.items.map((key) => (
            <li key={key} className="flex items-start gap-2.5 text-sm text-zinc-300">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button
            onClick={dismiss}
            className="w-full bg-zinc-100 text-zinc-950 hover:bg-white font-medium"
            data-testid="whatsnew-dismiss"
          >
            {t("whatsnew.got_it")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

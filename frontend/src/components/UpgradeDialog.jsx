import React from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Wallet as WalletIcon, Bell, ListChecks } from "lucide-react";
import { Dialog, DialogContent } from "./ui/dialog";
import { useI18n } from "../context/I18nContext";

/**
 * Dialog de upgrade bonito e simpático — substitui os toasts secos de
 * "limite atingido" por um pedido mais humano, com o mesmo tom de voz
 * amigável da app e desenho consistente com o resto da UI (fundo escuro,
 * acento âmbar, cantos arredondados).
 *
 * Uso:
 *   <UpgradeDialog open={showUpgrade} onOpenChange={setShowUpgrade} reason="wallet_limit" />
 */
export default function UpgradeDialog({ open, onOpenChange, reason = "wallet_limit" }) {
  const nav = useNavigate();
  const { t } = useI18n();

  const titleKey = reason === "wallet_limit" ? "upgrade.dialog_wallet_title" : "upgrade.locked";
  const bodyKey = reason === "wallet_limit" ? "upgrade.dialog_wallet_body" : "upgrade.desc";

  const features = [
    { Icon: WalletIcon, label: t("upgrade.dialog_feature_wallets") },
    { Icon: Bell, label: t("upgrade.dialog_feature_alerts") },
    { Icon: ListChecks, label: t("upgrade.dialog_feature_watchlists") },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-sm text-center sm:text-center p-0 overflow-hidden">
        <div className="px-6 pt-8 pb-6">
          <div className="w-14 h-14 mx-auto rounded-full bg-amber-400/10 border border-amber-400/30 flex items-center justify-center mb-5">
            <Sparkles className="w-6 h-6 text-amber-400" />
          </div>

          <h2 className="font-display font-light text-2xl tracking-tight text-zinc-50 mb-2">
            {t(titleKey)}
          </h2>
          <p className="text-sm text-zinc-400 leading-relaxed mb-6">
            {t(bodyKey)}
          </p>

          <div className="flex flex-col gap-2.5 mb-7 text-left">
            {features.map(({ Icon, label }, i) => (
              <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-zinc-900/70 border border-zinc-800">
                <div className="w-7 h-7 shrink-0 rounded-md bg-amber-400/10 flex items-center justify-center">
                  <Icon className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <span className="text-sm text-zinc-300">{label}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => nav("/pricing")}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 text-sm font-bold transition-colors mb-2.5"
            data-testid="upgrade-dialog-cta"
          >
            <Sparkles className="w-4 h-4" />
            {t("upgrade.cta")}
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="w-full px-5 py-2.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            data-testid="upgrade-dialog-dismiss"
          >
            {t("upgrade.dialog_maybe_later")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

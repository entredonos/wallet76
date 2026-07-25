import React from "react";
import { useI18n } from "../../context/I18nContext";
import { WALLET_COLOR_KEYS, WALLET_DOT_CLASS } from "../../lib/walletColors";
import { TYPE_PILL_DEFS } from "../../constants/dashboardConstants";
import FilterPill from "./FilterPill";

// Filtros CONTEXTUAIS (redesenho pedido pelo utilizador — "a proposta").
// Uma só linha, no contexto atual:
//   • GLOBAL  -> "Global · <tipos>"
//   • CARTEIRA -> "<Nome da carteira> · <tipos dessa carteira>"
// A troca de carteira faz-se pela SIDEBAR (as antigas pills de todas as
// carteiras foram removidas). Continua a filtrar tudo — cartões, gráfico e
// tabela — como antes. Mantém-se como widget no topo (Personalizar inalterado).
export default function FilterPillsRow({
  pillVisible, filterType, filterWallet, setFilterType, setFilterWallet, nav,
  globalAssetTypes, presentAssetTypes, wallets,
}) {
  const { t } = useI18n();
  const selIdx = wallets.findIndex((w) => w.id === filterWallet);
  const sel = selIdx >= 0 ? wallets[selIdx] : null;

  // ---- GLOBAL ----
  if (!sel) {
    return (
      <>
        {pillVisible("global") && (
          <FilterPill
            active={filterType === "all"}
            onClick={() => { setFilterType("all"); setFilterWallet("all"); nav("/dashboard"); }}
            testId="filter-all" color="blue"
          >▦ {t("common.global")}</FilterPill>
        )}
        {TYPE_PILL_DEFS.map(({ key, color, icon, labelKey }) => (
          pillVisible(key) && globalAssetTypes.has(key) && (
            <FilterPill
              key={`global-${key}`}
              active={filterType === key}
              onClick={() => { setFilterWallet("all"); setFilterType(key); nav("/dashboard"); }}
              testId={`filter-${key}`}
              color={color}
            >{icon}{t(labelKey)}</FilterPill>
          )
        ))}
      </>
    );
  }

  // ---- DENTRO DE UMA CARTEIRA ----
  const walletColor = WALLET_COLOR_KEYS[selIdx % WALLET_COLOR_KEYS.length];
  const dot = WALLET_DOT_CLASS[walletColor];
  return (
    <>
      <FilterPill
        active={filterType === "all"}
        onClick={() => setFilterType("all")}
        testId={`filter-wallet-${sel.id}`}
        color={walletColor}
      >
        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${dot}`} /> {sel.name}
      </FilterPill>
      {TYPE_PILL_DEFS.map(({ key, icon, labelKey }) => (
        presentAssetTypes.has(key) && (
          <FilterPill
            key={`${sel.id}-${key}`}
            active={filterType === key}
            onClick={() => setFilterType(key)}
            testId={`filter-wallet-${sel.id}-${key}`}
            color={walletColor}
            coloredBorder
          >{icon}{t(labelKey)}</FilterPill>
        )
      ))}
    </>
  );
}

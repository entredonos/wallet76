import React from "react";
import { useI18n } from "../../context/I18nContext";
import { WALLET_COLOR_KEYS, WALLET_DOT_CLASS } from "../../lib/walletColors";
import { TYPE_PILL_DEFS } from "../../constants/dashboardConstants";
import FilterPill from "./FilterPill";

// Filter pills — always visible, anchored just after the summary cards.
// Order: Global, then Global's own type pills (always present, union
// across every wallet) — then each wallet, with THAT wallet's own type
// pills opening inline right after it, but only while it's the selected
// one (so switching wallets doesn't stack every wallet's pills into one
// giant row).
export default function FilterPillsRow({
  pillVisible, filterType, filterWallet, setFilterType, setFilterWallet, nav,
  globalAssetTypes, presentAssetTypes, wallets, walletPillVisible,
}) {
  const { t } = useI18n();
  return (
    <>
      {pillVisible("global") && (
        <FilterPill
          active={filterType === "all" && filterWallet === "all"}
          onClick={() => { setFilterType("all"); setFilterWallet("all"); nav("/dashboard"); }}
          testId="filter-all" color="blue"
        >▦ {t("common.global")}</FilterPill>
      )}
      {TYPE_PILL_DEFS.map(({ key, color, icon, labelKey }) => (
        pillVisible(key) && globalAssetTypes.has(key) && (
          <FilterPill
            key={`global-${key}`}
            active={filterWallet === "all" && filterType === key}
            onClick={() => { setFilterWallet("all"); setFilterType(key); nav("/dashboard"); }}
            testId={`filter-${key}`}
            color={color}
          >{icon}{t(labelKey)}</FilterPill>
        )
      ))}

      {wallets.some((w) => walletPillVisible(w.id)) && (
        <div className="w-px h-5 bg-zinc-800 mx-1" />
      )}

      {wallets.map((w, i) => {
        if (!walletPillVisible(w.id)) return null;
        const walletColor = WALLET_COLOR_KEYS[i % WALLET_COLOR_KEYS.length];
        const dot = WALLET_DOT_CLASS[walletColor];
        const isActive = filterWallet === w.id;
        return (
          <React.Fragment key={w.id}>
            <FilterPill
              active={isActive}
              onClick={() => {
                if (isActive) { setFilterWallet("all"); nav("/dashboard"); }
                else { setFilterWallet(w.id); nav(`/dashboard?wallet=${w.id}`); }
              }}
              testId={`filter-wallet-${w.id}`}
              color={walletColor}
            >
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${dot}`} /> {w.name}
            </FilterPill>
            {/* This wallet's own type pills — only while it's selected,
                opening immediately to its right, in the SAME color as the
                wallet itself (not the generic per-type color) so the
                expanded group reads as one unit. presentAssetTypes is
                already scoped to filterWallet, so when isActive is true
                it's exactly this wallet's set. */}
            {isActive && TYPE_PILL_DEFS.map(({ key, icon, labelKey }) => (
              presentAssetTypes.has(key) && (
                <FilterPill
                  key={`${w.id}-${key}`}
                  active={filterType === key}
                  onClick={() => setFilterType(key)}
                  testId={`filter-wallet-${w.id}-${key}`}
                  color={walletColor}
                  coloredBorder
                >{icon}{t(labelKey)}</FilterPill>
              )
            ))}
          </React.Fragment>
        );
      })}
    </>
  );
}

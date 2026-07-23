// Lógica pura de filtragem das posições do portfólio pela badge de tipo
// (Global/Cripto/Ações/ETFs/Liquidez) e pela carteira selecionada. Extraída
// da Dashboard para um módulo testável (holdingsFilter.test.js) — é o que
// decide o que cada badge mostra, por isso vale a pena ter testes a fixá-la.

// Filtra por tipo de ativo e/ou carteira. "all" em qualquer dos dois =
// sem restrição nessa dimensão.
export function filterHoldings(holdings, filterType = "all", filterWallet = "all") {
  return (holdings || []).filter((a) => {
    if (filterType !== "all" && a.asset_type !== filterType) return false;
    if (filterWallet !== "all" && a.wallet_id !== filterWallet) return false;
    return true;
  });
}

// Conjunto dos tipos de ativo presentes numa lista de posições — usado para
// decidir que badges de tipo mostrar (não faz sentido mostrar "Cripto" se a
// carteira não tem cripto nenhuma).
export function assetTypeSet(holdings) {
  return new Set((holdings || []).map((a) => a.asset_type));
}

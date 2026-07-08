// "O que há de novo" — histórico de releases mostradas ao utilizador via
// WhatsNewModal.jsx. Cada entrada tem uma chave de versão própria (não é o
// semver do package.json, é só um identificador de release estilo data) e
// uma lista de chaves i18n (título + itens) que têm de existir nos 6 blocos
// de I18nContext.jsx (REGRA #1).
//
// Para lançar novidades num deploy futuro: acrescentar uma nova entrada no
// TOPO deste array com uma "version" nova, e as respetivas chaves
// "whatsnew.vXXXXXXXX_title"/"_item1"/"_item2"/... nas 6 línguas. O modal
// mostra sempre CHANGELOG[0] e guarda em localStorage a versão já vista —
// aparece de novo automaticamente assim que a "version" mudar.
export const CHANGELOG = [
  {
    version: "2026.07.08",
    titleKey: "whatsnew.v20260708_title",
    items: [
      "whatsnew.v20260708_item1",
      "whatsnew.v20260708_item2",
      "whatsnew.v20260708_item3",
      "whatsnew.v20260708_item4",
    ],
  },
];

export const LATEST_CHANGELOG_VERSION = CHANGELOG[0]?.version || "0";

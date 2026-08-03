// Meta tags dos links partilhados (/p/{slug}) na lingua de quem partilhou.
//
// PORQUE EXISTE (3 ago 2026): o WhatsApp e os restantes crawlers NAO correm
// JavaScript — a pre-visualizacao de um link /p/ mostrava sempre o titulo e a
// descricao estaticos do index.html, em ingles, mesmo com a pagina ja
// traduzida nas 6 linguas (visto num link real: pagina em portugues, cartao
// do WhatsApp em ingles). Esta Function serve o MESMO index.html estatico,
// mas reescreve na edge o <title>, description e og:*/twitter:* na lingua do
// DONO do link (que o backend conhece: GET /api/p/{slug}/meta) — quem recebe
// ve a pre-visualizacao na lingua de quem lho mandou.
//
// CUSTO: /p/* passa a invocar uma Function (ver _routes.json); trafego destas
// paginas e marginal face a quota de 100k/dia. Se o backend nao responder, a
// pagina sai tal e qual (fail-open): pior caso = cartao em ingles, como dantes.

const ORIGIN = "https://wallet76-1.onrender.com";

// Titulo/descricao por lingua do dono. {name} = nome de quem partilhou.
const META = {
  en: {
    title: "{name}'s portfolio — Wallet76",
    desc: "Stocks, ETFs and crypto in one place. View this shared portfolio on Wallet76 — live prices, alerts and multi-wallet support.",
  },
  pt: {
    title: "A carteira de {name} — Wallet76",
    desc: "Ações, ETFs e cripto num só sítio. Vê esta carteira partilhada na Wallet76 — preços ao vivo, alertas e multi-carteira.",
  },
  fr: {
    title: "Le portefeuille de {name} — Wallet76",
    desc: "Actions, ETF et crypto au même endroit. Découvrez ce portefeuille partagé sur Wallet76 — prix en direct et alertes.",
  },
  de: {
    title: "Portfolio von {name} — Wallet76",
    desc: "Aktien, ETFs und Krypto an einem Ort. Sieh dir dieses geteilte Portfolio auf Wallet76 an — Live-Kurse und Alarme.",
  },
  it: {
    title: "Il portafoglio di {name} — Wallet76",
    desc: "Azioni, ETF e cripto in un unico posto. Guarda questo portafoglio condiviso su Wallet76 — prezzi live e avvisi.",
  },
  es: {
    title: "La cartera de {name} — Wallet76",
    desc: "Acciones, ETFs y cripto en un solo lugar. Mira esta cartera compartida en Wallet76 — precios en vivo y alertas.",
  },
};

export async function onRequest(context) {
  const { request, env } = context;

  // A pagina em si vem dos estaticos da Pages (SPA fallback -> index.html).
  const page = await env.ASSETS.fetch(request);
  const ct = page.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return page;

  const slug = (new URL(request.url).pathname.split("/")[2] || "").trim();
  if (!slug) return page;

  let meta = null;
  try {
    const r = await fetch(`${ORIGIN}/api/p/${encodeURIComponent(slug)}/meta`, {
      headers: { accept: "application/json" },
    });
    if (r.ok) meta = await r.json();
  } catch (_e) {
    // fail-open: sem backend, a pagina sai com as tags estaticas.
  }
  if (!meta || !meta.display_name) return page;

  const L = META[meta.lang] || META.en;
  const title = L.title.replace("{name}", meta.display_name);
  const pageUrl = `https://wallet76.com/p/${slug}`;

  // HTMLRewriter escapa os valores sozinho (setAttribute/setInnerContent),
  // por isso um nome com <, & ou aspas nao parte o HTML.
  return new HTMLRewriter()
    .on("title", { element(e) { e.setInnerContent(title); } })
    .on('meta[name="description"]', { element(e) { e.setAttribute("content", L.desc); } })
    .on('meta[property="og:title"]', { element(e) { e.setAttribute("content", title); } })
    .on('meta[property="og:description"]', { element(e) { e.setAttribute("content", L.desc); } })
    .on('meta[property="og:url"]', { element(e) { e.setAttribute("content", pageUrl); } })
    .on('meta[name="twitter:title"]', { element(e) { e.setAttribute("content", title); } })
    .on('meta[name="twitter:description"]', { element(e) { e.setAttribute("content", L.desc); } })
    .transform(page);
}

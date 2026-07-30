// Proxy same-origin de /api/* para o backend no Render.
//
// PORQUE EXISTE (ver CLAUDE.md, REGRA #5): a autenticacao assenta so no cookie
// httpOnly `access_token`. Se o frontend chamasse `https://wallet76-1.onrender.com`
// diretamente, esse cookie era cross-site e o "Prevent Cross-Site Tracking" do
// Safari/iOS bloqueava-o — o utilizador entrava e saia logo a seguir. Por isso o
// frontend chama sempre um caminho relativo ("/api") e alguem tem de reencaminhar.
//
// Na Vercel isso eram tres linhas de `vercel.json` (rewrites). Na Cloudflare Pages
// NAO ha equivalente declarativo: o ficheiro `_redirects` so proxia caminhos
// relativos do proprio site — "You cannot proxy external domains", esta escrito na
// documentacao deles. Dai este ficheiro: e a unica forma de manter a REGRA #5 de pe.
//
// CUSTO: cada pedido a /api/* passa a invocar uma Function, e invocacoes de Function
// contam para a quota de pedidos do Workers (100 000/dia no plano gratuito). Os
// pedidos a ficheiros estaticos continuam gratis e ilimitados — e por isso que o
// `_routes.json` exclui tudo o resto.

const ORIGIN = "https://wallet76-1.onrender.com";

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  const headers = new Headers(request.headers);
  // O Host tem de ser o do Render, nao o nosso; o fetch trata disso sozinho.
  headers.delete("host");
  // O backend le o IP do cliente do primeiro elemento do X-Forwarded-For. Se
  // deixassemos passar o cabecalho que veio do cliente, qualquer pessoa podia
  // dizer que era outro IP. Reescrevemo-lo com o IP real que a Cloudflare nos
  // da, que e o unico em que se pode confiar aqui.
  const clientIp = request.headers.get("CF-Connecting-IP");
  if (clientIp) headers.set("X-Forwarded-For", clientIp);
  headers.set("X-Forwarded-Proto", "https");
  headers.set("X-Forwarded-Host", url.host);

  const init = {
    method: request.method,
    headers,
    // Um 3xx do backend e para chegar ao browser tal e qual, nao para ser
    // seguido aqui dentro.
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  const upstream = await fetch(ORIGIN + url.pathname + url.search, init);

  // `new Response(body, upstream)` copia o estado e os cabecalhos todos,
  // incluindo varios Set-Cookie separados — que e exatamente o que nao se pode
  // perder aqui. Ler os cabecalhos um a um colapsava-os num so e partia o login.
  const out = new Response(upstream.body, upstream);

  // O `_headers` da Pages nao se aplica a respostas de Functions, por isso os
  // cabecalhos de seguranca que o vercel.json punha em tudo tem de ser postos
  // aqui a mao. A API nunca e para ser embebida nem adivinhada.
  out.headers.set("X-Content-Type-Options", "nosniff");
  out.headers.set("X-Frame-Options", "DENY");
  out.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  out.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );

  return out;
}

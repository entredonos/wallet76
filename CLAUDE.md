# Wallet76 — Regras de Desenvolvimento

---

## REGRA #1 — INTERNACIONALIZAÇÃO (i18n) — OBRIGATÓRIA

**TODO o texto visível ao utilizador na app DEVE estar escrito nas 6 línguas.**

As 6 línguas suportadas são:
1. **PT** — Português
2. **DE** — Alemão (Deutsch)
3. **FR** — Francês (Français)
4. **ES** — Espanhol (Español)
5. **IT** — Italiano
6. **EN** — Inglês (English)

Isto inclui absolutamente tudo:
- Labels, títulos, subtítulos
- Botões e links
- Mensagens de erro e de sucesso
- Tooltips, placeholders, aria-labels
- Textos de estado vazio ("Sem dados", "A carregar…")
- Disclaimers e notas de rodapé
- Colunas de tabelas, cabeçalhos de cards

### Como aplicar

Todas as strings vão para `frontend/src/context/I18nContext.jsx` no objeto `TRANSLATIONS`, num bloco por língua:

```js
// Blocos: TRANSLATIONS.en | .pt | .fr | .de | .it | .es
"secao.minha_chave": "Text in English"       // en
"secao.minha_chave": "Texto em português"    // pt
"secao.minha_chave": "Texte en français"     // fr
"secao.minha_chave": "Text auf Deutsch"      // de
"secao.minha_chave": "Testo in italiano"     // it
"secao.minha_chave": "Texto en español"      // es
```

No componente usa-se SEMPRE `t("secao.minha_chave")` — nunca texto fixo em JSX.

### ❌ Proibido

- Strings hardcoded em JSX: `<div>From your holdings</div>`
- Placeholders em inglês: `placeholder="Pick an asset"`
- Labels, títulos, botões, erros, tooltips com texto fixo
- Adicionar chave a menos de 6 línguas

### ✅ Dispensado de tradução

- Nomes de produtos: "Wallet76", "DEGIRO", "Binance"
- Tickers e siglas financeiras: "AAPL", "BTC", "ETF", "SPY"
- Valores numéricos e monetários
- Datas formatadas via `toLocaleDateString`

### Checklist antes de terminar qualquer tarefa de UI

- [ ] Cada nova string tem chave em `I18nContext.jsx`
- [ ] A chave existe nos 6 blocos: `en`, `pt`, `fr`, `de`, `it`, `es`
- [ ] O componente usa `t("chave")` em vez de texto fixo
- [ ] Nenhum `placeholder`, `title` ou `aria-label` está hardcoded

---

## REGRA #2 — GRÁFICO "EVOLUÇÃO DA CARTEIRA": RECONSTRUÇÃO E REDE DE SEGURANÇA

O gráfico de evolução do Dashboard (`GET /history`) nunca depende só de
snapshots gravados — é reconstruído a partir das transações + histórico de
preços de cada ativo, para uma conta nova (ou que acabou de ser reposta)
não ficar com o gráfico vazio durante dias/semanas até acumular snapshots
reais. Há dois caminhos, consoante o `range`:

### 15m / 30m / 1h / 4h (intraday)

`_build_retro_history_intraday()` em `backend/routes/portfolio.py`:

1. Vai buscar a série intraday de cada ativo detido (mesma fonte dos
   gráficos de ativo individual — CoinGecko para cripto, Yahoo como
   fallback), com `_drop_price_spikes()` a filtrar candles isolados
   implausíveis por ativo.
2. Constrói a timeline como a união de todos os timestamps de todos os
   ativos, e para cada instante usa o último preço conhecido de cada ativo
   (carry-forward) multiplicado pela quantidade nessa data (aplicando as
   transações pela ordem certa).
3. **Rede de segurança**: se o resultado reconstruído tiver menos de 5
   pontos (ex.: CoinGecko e Yahoo ambos indisponíveis/rate-limited para
   algum ativo detido nesse momento), junta os snapshots reais já gravados
   (`run_snapshot_scheduler`, a cada 15 min) na mesma janela, com a mesma
   guarda contra outliers usada na escrita (rejeita um salto <10% ou >10x
   face ao ponto anterior).

Cada ponto devolvido tem um campo `"source"`:
- `"reconstructed"` — veio da reconstrução normal (preços ao vivo).
- `"safety_net"` — veio de um snapshot real gravado, usado como reserva.

O frontend (`Dashboard.jsx`) calcula `usedSafetyNet` a partir disto e
mostra um badge âmbar "Dados de reserva" (`dash.safety_net_badge` /
`dash.safety_net_tooltip`, ícone `ShieldAlert`) junto ao título "Evolução
da Carteira" sempre que algum ponto da resposta atual veio da rede de
segurança — para o utilizador saber que aquele troço pode ser menos
preciso, em vez de parecer uma reconstrução normal.

Cache: 15 min (`history_intraday:*`, TTL=900s), invalidado sempre que as
transações do utilizador mudam (ver `_cache_clear_prefix`).

### 1D / 1W / 1M / 1Y / ALL (diário)

`_build_retro_history()` faz uma caminhada dia-a-dia desde a primeira
transação, usando o close diário do Yahoo Finance por ativo (cache 1h) com
carry-forward. **Não tem rede de segurança** — não injeta snapshots reais,
porque a reconstrução diária raramente fica escassa (yfinance tem histórico
"period=max"). Os pontos vêm marcados `"source": "reconstructed"` na mesma;
não acionam o badge.

Existe ainda um terceiro caminho, mais antigo, que lê só snapshots reais
diretamente (sem reconstrução) — na prática está morto: todo `range` válido
é intercetado por um dos dois caminhos acima antes de lá chegar. Os pontos
desse caminho vêm marcados `"source": "snapshot"` (dados reais, não é uma
emergência) só por precaução, caso volte a ficar alcançável.

### Guardas na escrita (`_save_snapshot`)

Um snapshot só é gravado se: (a) pelo menos metade dos ativos detidos
vierem com preço válido, e (b) o total não subir/descer de forma implausível
face ao snapshot anterior (>10x subida ou queda para <10% são ignorados,
não gravados — assume-se falha temporária da fonte de preços, não um
crash/rally real).

### Limpeza de dados antigos

`backend/clean_snapshots.py` remove snapshots que ficaram na base de dados
de ANTES destas guardas existirem (ou que passaram por uma falha isolada de
1 único bucket): totais `<= 0`, quedas/subidas isoladas em V (um bucket mau
entre dois normais) e `bucket_ts` duplicados. Corre em modo *dry run* por
omissão — só reporta o que apagaria; usar `--apply` para apagar de facto, e
`--user-id <id>` para limitar a um utilizador.

---

## REGRA #3 — QUANDO O UTILIZADOR FAZ UMA PERGUNTA, NÃO AGIR SEM ORDEM

Sempre que o utilizador fizer uma **pergunta** (em vez de um pedido claro
para executar uma tarefa), a resposta tem de vir em duas partes, por esta
ordem:

1. **Opinião** — a análise/avaliação honesta sobre o assunto perguntado
   (o que penso, prós/contras, riscos, recomendação, se aplicável).
2. **Pergunta de volta** — perguntar explicitamente o que o utilizador
   quer fazer a seguir.

**Não avançar para código, ficheiros, comandos ou qualquer alteração**
depois disso sem uma ordem clara e explícita do utilizador. Uma pergunta
não é uma autorização para agir — só dar a resposta é.

Isto NÃO se aplica quando o utilizador já dá uma instrução direta ("faz
X", "corrige Y", "manda um ficheiro com Z") — nesses casos a ordem já foi
dada e o trabalho segue normalmente.

---

## REGRA #4 — CHECKLIST DE DEPLOY NO RENDER (variáveis de ambiente)

**Incidente (3 jul 2026):** ao mudar o Instance Type do serviço `wallet76`
de Free para Starter, a variável `BROKER_ENCRYPTION_KEY` desapareceu/não
sincronizou no Render. O backend está propositadamente configurado para
recusar arrancar sem ela (proteção contra correr sem cifra de credenciais
de broker — ver REGRA de arranque em `backend/server.py`), pelo que a app
esteve completamente em baixo (crash loop, "Exited with status 3") até a
variável ser reposta manualmente em Settings → Environment.

**Sempre que houver uma mudança de Instance Type, plano, ou qualquer
operação no dashboard do Render que possa recriar/mover o serviço**,
confirmar antes e depois em Settings → Environment que estas variáveis
continuam todas presentes:

- `BROKER_ENCRYPTION_KEY` (crítica — sem ela o backend nem arranca)
- `MONGO_URL`
- `JWT_SECRET`
- `RESEND_API_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`,
  `STRIPE_WEBHOOK_SECRET`
- `FRONTEND_URL`

Se `BROKER_ENCRYPTION_KEY` voltar a desaparecer, o valor de referência
(para restaurar, não gerar um novo) está guardado no `backend/.env` local
— gerar um novo valor só decifra credenciais de broker novas a partir daí;
todas as ligações de broker já guardadas ficam permanentemente ilegíveis
se a chave mudar.

---

## REGRA #5 — FRONTEND E BACKEND EM DOMÍNIOS DIFERENTES: PROXY SAME-ORIGIN OBRIGATÓRIO NO ALOJAMENTO

**Incidente (6 jul 2026):** um utilizador testou a app no iPhone (Safari) e
ao registar-se levou logo com "Sessão expirada. Por favor inicia sessão
novamente." — mesmo com o registo a correr bem no servidor. Causa: o
frontend (`wallet76.com` / `wallet76.vercel.app`) e o backend
(`wallet76-1cvt.onrender.com`) são domínios diferentes (eTLD+1 distintos),
e a autenticação assenta só num cookie `httpOnly` (`access_token` —
deliberadamente sem cópia em localStorage, ver `frontend/src/lib/api.js`).
O Safari (iOS e Mac) tem "Prevent Cross-Site Tracking" ativo por omissão,
que bloqueia o armazenamento desse cookie mesmo com
`SameSite=None; Secure` corretamente configurado no backend — o Chrome/
Android não têm este problema, por isso passava despercebido nos testes
habituais.

**A regra, seja qual for o alojamento:** quem servir o frontend TEM de servir
`/api/*` e `/ping` como proxy same-origin para o backend no Render. O
frontend chama sempre caminhos relativos; o alojamento reencaminha.

**Como se implementa em cada casa:**

- **Vercel (a casa até ao corte de DNS de 30 jul 2026):**
  `frontend/vercel.json`, dois `rewrites` (`/api/:path*` e `/ping`) para
  `https://wallet76-1.onrender.com`. Timeout de 120 s em qualquer plano,
  muito acima do arranque a frio do Render.
- **Cloudflare Pages (o destino da migração):** o `_redirects` NÃO serve —
  "You cannot proxy external domains", está na documentação deles. É uma
  Pages Function: `frontend/functions/api/[[path]].js` (e
  `functions/ping.js`, que reexporta o mesmo handler). Três armadilhas
  conhecidas: os vários `Set-Cookie` têm de chegar separados ao browser
  (`new Response(body, upstream)` copia-os bem; ler cabeçalhos um a um
  colapsa-os num só e parte o login); o `_headers` NÃO se aplica a
  respostas de Functions, por isso os cabeçalhos de segurança da API vão
  no código da Function; e o `_routes.json` tem de limitar a Function a
  `/api/*` e `/ping` — senão as páginas estáticas passam a contar para a
  quota do Workers (100 000 pedidos/dia no plano gratuito; estáticos são
  gratuitos e ilimitados, invocações de Function não).

**Invariantes que não dependem do alojamento — se um for editado sem o
resto, volta a partir:**

1. O destino do proxy aponta sempre para o URL atual do backend no Render
   (hoje `https://wallet76-1.onrender.com`) — nos DOIS sítios:
   `vercel.json` E a constante `ORIGIN` da Function.
2. A variável `REACT_APP_BACKEND_URL` no alojamento deve ficar **vazia** em
   produção (não apagada — vazia), para os pedidos serem feitos a
   caminhos relativos (`/api/...`, `/ping`) que o proxy intercepta. Todo o
   código que lê esta variável
   (`frontend/src/lib/api.js`, `BackendStatusBanner.jsx`,
   `VerifyEmail.jsx`, `ResetPassword.jsx`, `ForgotPassword.jsx`) já tem
   `|| ""` como fallback — sem isto, `${undefined}/api` vira a string
   literal `"undefined/api"` e a app fica muda em produção sem erro
   nenhum visível.
3. Em desenvolvimento local, `REACT_APP_BACKEND_URL` continua definida
   (aponta para o backend local) — nada disto se aplica aí, os pedidos já
   eram same-origin/localhost.
4. O `CORS`/`allow_origins` em `backend/server.py` mantém-se como estava
   — continua a ser necessário para a app Electron e para qualquer cliente
   que fale diretamente com o Render sem passar pelo proxy.

---

## REGRA #6 — SUGERIR SKILL ANTES DE AVANÇAR (PERGUNTAR, NUNCA INSTALAR SEM ORDEM)

Sempre que estivermos prestes a fazer alguma coisa e eu (Claude) achar que
existe — ou que valeria a pena criar — uma **skill** que ajudaria a fazer
essa tarefa melhor ou mais depressa, tenho de **parar e perguntar ANTES de
avançar**:

1. Dizer **qual é a skill** e **para que serve** (como ajudaria nesta tarefa
   em concreto).
2. Perguntar se o utilizador quer **instalar/usar** essa skill, ou não.
3. Só depois da resposta é que avanço.

**Nunca instalar nem ativar uma skill sem confirmação explícita do
utilizador.** Aplica-se tanto a skills que já existem (marketplace/perfil)
como a skills novas que poderíamos criar para o efeito. A decisão do que
entra no ambiente é sempre do Jose.

**Extensão (29 jul 2026) — propor a skill por iniciativa própria.** A regra
acima cobria o caso de eu *encontrar* uma skill. Falta o outro lado: sempre que
eu achar que valeria a pena **criar** uma skill — para não perder memória entre
compactações da conversa, para poupar passos que repetimos sempre, ou porque
acho que vamos precisar dela mais à frente — tenho de **dizer isso e perguntar**,
em vez de a criar por minha conta ou de me calar e continuar a repetir trabalho.

Ao perguntar, explico sempre **as vantagens em concreto**: o que é que se deixa
de perder, quantos passos se poupam, e o que acontece se não a fizermos. A
decisão continua a ser do Jose — o que muda é que ele passa a ter a decisão à
frente dele em vez de ela ficar por dizer.

---

## REGRA #7 — ATUALIZAR O README SEMPRE, NO MESMO TRABALHO

Sempre que criarmos, alterarmos ou corrigirmos alguma coisa neste repositório,
o **`README.md` é atualizado no mesmo trabalho**, antes de eu entregar os
comandos de commit. Não fica para depois: "depois" nunca chega, e um README
desatualizado é pior do que nenhum, porque descreve uma app que já não existe.

Em concreto, cada alteração implica:

1. **Uma entrada nova em §2 (Registo de alterações)** do README, com três
   coisas: **o que estava mal**, **porque estava mal** (a causa-raiz, não o
   sintoma) e **como ficou**. O *porquê* é a parte que vale — daqui a seis
   meses o código lê-se, o raciocínio não.
2. **Atualizar a secção estrutural afetada**: §4 estrutura de ficheiros,
   §5 mapa de endpoints, §6 rotas do frontend, §7 funcionalidades,
   §8 modelo de dados, §9 cache, §10 i18n, §11 segurança, §12 planos e
   limites, §13 deploy e variáveis.
3. **Se a alteração gerar uma lição do tipo "nunca mais fazer assim"**, essa
   lição vira uma REGRA nova aqui no `CLAUDE.md` e é referenciada no README.
4. **Atualizar a data** no cabeçalho do README.
5. Se o item estava no `Wallet76_NEGOCIO.md`, **marcar a caixa** e apontar para
   a secção do README onde ficou descrito.

Isto vale para tudo: funcionalidade nova, correção de bug, endpoint novo,
alteração de esquema, variável de ambiente nova, mudança de deploy. Se mexeu no
repositório, mexe no README.

---

## REGRA #8 — NUNCA CONCORDAR POR DEFEITO; DAR SEMPRE A MINHA OPINIÃO

Quando o Jose propõe uma coisa, afirma uma coisa ou pergunta se algo está
certo, a minha resposta começa pelo que eu **realmente** penso — incluindo, e
sobretudo, quando isso contraria o que ele acabou de dizer.

O que isto proíbe, em concreto:

1. **Concordar só porque foi ele que disse.** "Boa ideia", "exato", "faz todo o
   sentido" só se escrevem quando são verdade e vêm acompanhados da razão. Um
   "sim" sem razão por trás não é opinião nenhuma, é ruído.
2. **Calar uma objeção para não travar o trabalho.** Se vejo um risco, um custo
   escondido, uma alternativa melhor ou um erro factual, digo-o **antes** de
   executar, mesmo que a ordem seja clara e eu a vá cumprir a seguir.
3. **Executar em silêncio uma ordem com a qual não concordo.** Executo — a
   decisão é dele — mas o desacordo fica escrito primeiro, com o motivo. Ele
   decide com a informação toda à frente, não com metade.
4. **Deixar passar uma premissa errada** porque o pedido em si é claro. Se o
   pedido assenta num facto que não é verdade, o facto corrige-se primeiro.

O reverso também é um defeito: **discordar para parecer crítico** é o mesmo
erro ao contrário. Quando concordo, concordo e digo porquê — e se não tenho
dados para ter opinião, digo isso em vez de inventar uma posição.

Isto liga-se à REGRA #3 (pergunta ≠ ordem) e ao tom combinado: português de
Portugal, direto, sem entusiasmo de vendedor. E quando sou eu que me engano, a
correção é escrita antes de continuar, não enterrada numa frase a meio.

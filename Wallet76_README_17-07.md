# Wallet76 — README da aplicação

> Documento de contexto/handoff. Resume o que é a app, a stack, onde está ligada
> (integrações e serviços), as funcionalidades atuais, o que foi cortado
> recentemente e o que falta. Atualizado no fim de julho de 2026.

---

## 1. O que é

**Wallet76** é um **tracker de carteiras de investimento** (web app + PWA) para o
investidor europeu: junta ações, ETFs, fundos, cripto e liquidez numa vista
consolidada, multi-moeda e multi-língua, com sincronização de brokers/exchanges,
análises, alertas, dividendos e **alocação-alvo/rebalanceamento**.

- **Site:** https://wallet76.com
- **Backend (API):** https://wallet76-1.onrender.com (mesmo domínio via `/api`)
- **Repo:** GitHub `entredonos/wallet76` (branch principal: `main`)
- **Posicionamento:** "o tracker de carteiras europeu" — multi-moeda, multi-língua, RGPD.

---

## 2. Stack

**Frontend**
- React (Create React App via **craco**), **Tailwind CSS**
- `react-router-dom` (rotas, lazy loading), **Recharts** (gráficos)
- `sonner` (toasts — NÃO react-hot-toast), `lucide-react` (ícones)
- PWA (instalável em Windows/Mac/Android/iOS, service worker)
- i18n próprio (`context/I18nContext.jsx`) — **6 línguas**: pt, en, fr, de, it, es
- **Deploy: Vercel** (redeploy automático no push para `main`)
- **Importante (CI):** o build corre com `CI=true` → **warnings de ESLint = erros**
  (variáveis/imports por usar, deps de hooks em falta → o build falha).

**Backend**
- **FastAPI** (Python 3), **Pydantic**, servidor em `server.py`
- **MongoDB** (MongoDB Cloud/Atlas) via `motor` (async)
- Cache **em memória** por-worker (`core.py`: `cache_get/cache_set/cache_get_stale`)
- Auth: **JWT** + **bcrypt**; chaves de broker cifradas com **AES-256-GCM**
- Auth forte opcional: **WebAuthn/passkeys** (`WEBAUTHN_RP_ID`)
- Monitorização de erros: **Sentry**
- **Deploy: Render** (serviço `wallet76-1`, Python 3, plano Starter; auto-deploy no push)

---

## 3. Integrações e ligações (onde estamos ligados)

| Serviço | Para quê | Notas |
|---|---|---|
| **Stripe** (produção/live) | Subscrições, checkout, webhook | Webhook: `https://wallet76.com/api/stripe/webhook`. Cupão **FUNDADOR** (−40% forever, limite 100). |
| **CoinGecko** | Preços/nome/imagem/detalhe de cripto | Chave **Demo** em `COINGECKO_API_KEY` (obrigatória — sem ela o IP do Render apanha 429 constante). A chave vai em **todas** as chamadas. |
| **Yahoo Finance / yfinance** | Preços e histórico de ações/ETFs, setores, detalhe do ativo | Sem chave; **é rate-limited no IP do Render** (ponto frágil — ver §9). |
| **open.er-api.com** | Taxas de câmbio (FX) | Grátis; com fallback e banda de sanidade. |
| **MongoDB Cloud (Atlas)** | Base de dados | Utilizadores, carteiras, transações, alertas, prefs, alocação, etc. |
| **Resend** | Email transacional | `RESEND_API_KEY` + `FROM_EMAIL`. Verificação, reset de password, alertas, alerta de data-health. |
| **Telegram** | Bot de alertas | `TELEGRAM_BOT_TOKEN`, webhook auto-registado no arranque. |
| **Web Push (VAPID)** + **FCM** | Notificações push (web e mobile) | `VAPID_*`, `FCM_SERVICE_ACCOUNT`. |
| **Sentry** | Erros/traços | `SENTRY_DSN`. |
| **Brokers/Exchanges** | Sincronização de posições | Ver §4. |

---

## 4. Sincronização de brokers/exchanges

**Read-only**, chaves cifradas (AES-256-GCM). Duas famílias:

- **Conectores dedicados:** DEGIRO, Interactive Brokers (IBKR), Trading 212, **XTB** (ações) + Binance, Coinbase, Kraken (cripto).
- **CCXT genérico** (`broker_connectors/ccxt_generic.py`) para o resto das exchanges de cripto: Bybit, OKX, KuCoin, Bitget, MEXC, Crypto.com, Gate.io.
- **Import CSV/XLSX** como rede universal (qualquer broker).

**Direção estratégica (decidida, ainda não implementada):** cripto fica **em casa via CCXT** (open-source, comunidade mantém), **ações migram para um agregador (SnapTrade)** para tirar a manutenção dos brokers de ações, os instáveis marcam-se como **"Beta"**, e o **CSV** é sempre a rede. Ver §9.

---

## 5. Variáveis de ambiente (backend / Render)

```
# Base
APP_URL, FRONTEND_URL, RENDER

# Dados / auth
(MongoDB connection string), BROKER_ENCRYPTION_KEY, WEBAUTHN_RP_ID

# Preços
COINGECKO_API_KEY            # chave Demo do CoinGecko (crítica para a fiabilidade)

# Stripe (live)
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY
STRIPE_PRICE_MONTHLY_USD, STRIPE_PRICE_YEARLY_USD
STRIPE_PRICE_MONTHLY_CHF, STRIPE_PRICE_YEARLY_CHF
STRIPE_PRICE_MONTHLY_BRL, STRIPE_PRICE_YEARLY_BRL

# Email (Resend)
RESEND_API_KEY, FROM_EMAIL

# Telegram
TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET

# Push
VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CLAIM_EMAIL, FCM_SERVICE_ACCOUNT

# Erros
SENTRY_DSN, SENTRY_TRACES_SAMPLE_RATE
```

---

## 6. Funcionalidades (estado atual)

**Núcleo**
- **Painel (Dashboard)** — resumo, saldo, chips de filtro, gráfico de evolução, **Top Movers** (dos *teus* ativos), widget de **Alocação** (espelho só-leitura), tabela de ativos, liquidez, cartão de dividendos. Modos **Básico/Avançado** + drawer de personalização de widgets.
- **Carteiras** (multi-carteira, cor por carteira).
- **Transações** + histórico completo (compra/venda/dividendo/transferência).
- **Alertas** de preço (email, Telegram, push).
- **Alocação** — alvos a 2 níveis (grupo/classe + por ativo com cadeado), auto-distribuição, orientação **Comprar/Aguardar**, agregação por símbolo (o mesmo ativo em várias carteiras = 1 linha), tabela em xadrez com scroll horizontal no telemóvel + modo "slide". **Funcionalidade Pro.**
- **Análises** (CAGR, Sharpe, drawdown, benchmark à escolha) — **Pro**.
- **Dividendos** + calendário/agenda — **Pro**.
- **Detalhe do ativo** — gráfico + métricas de negociação (máx/mín 52S, volume, abertura) + cartão de dividendos. (Research de analistas removida — ver §8.)
- **Ativos e Liquidez**, **multi-moeda** (USD/EUR/CHF/BRL) e **6 línguas**.
- Perfil, Definições, Contas Ligadas (brokers), Partilha de carteira (link privado), Relatório fiscal, Transparência de comissões.
- **PWA** + segurança/RGPD (exportar/eliminar dados).

**Barra inferior (mobile):** 5 separadores — **Painel · Carteiras · Alocação · Alertas · Mais**.

**Admin** (só `entredonos@gmail.com`): Feedback, Utilizadores, **Dados** (health-check das fontes). Endpoint: `GET /api/admin/data-health`.

---

## 7. Planos e preços

- **Grátis:** 1 carteira, até 15 ativos, 3 alertas (email), preços em tempo real, histórico, 6 línguas/4 moedas, dashboard básico.
- **Pro:** carteiras/ativos/alertas ilimitados, sync de brokers, análises, alocação, dividendos, partilha, import CSV/XLSX, suporte prioritário, **30 dias de teste**.
- **Preços:** EUR 5,99/mês · 49,99/ano — CHF 5,90 · 49,00 — USD 5,99 · 49,99 — BRL 19,90 · 149.
- **Cupão FUNDADOR:** −40% para sempre, limitado a 100 utilizadores.

---

## 8. Fiabilidade dos dados (blindagem recente)

O ponto mais crítico de uma app financeira. Implementado em `backend/prices.py` + `core.py`:

- **Guardas de sanidade:** um preço/câmbio inválido (0, negativo, NaN, ausente) **nunca é cacheado nem servido** — cai-se para o último valor bom em cache. Câmbios têm **banda de sanidade** (0,2×–5× o valor de referência) para apanhar taxas absurdas/invertidas.
- **Fallback em cache:** com falhas de fonte (ex.: 429), mostra-se o último valor conhecido em vez de zeros/erros.
- **Health-check:** `GET /api/admin/data-health` (admin) — rejeitados recentes por fonte, frescura do câmbio, nº de preços em cache. Logs greppable `[data-health]` no Render.
- **Alerta proativo:** pico de rejeições (≥20 em 10 min) dispara **email ao dono** (throttle 1/hora).
- **CoinGecko:** a chave Demo vai em **todas** as chamadas (preço, search, markets, detalhe) — resolveu os 429 constantes do IP partilhado do Render.

---

## 9. Problemas conhecidos e próximos passos

- **Yahoo/yfinance (ações) rate-limited no Render** — sem chave equivalente à do CoinGecko. Por agora as guardas + cache seguram (mostra último valor bom). **Próximo:** mover ações para uma fonte paga fiável (ex.: Financial Modeling Prep, Twelve Data).
- **Brokers de ações → SnapTrade** — o agregador cobre DEGIRO/Trading 212/IBKR/eToro/BUX na Europa (~$1–2/mês por utilizador ligado, tier grátis para 1 + sandbox). Migrar os brokers de ações para lá tira o pesadelo de manutenção; cripto fica no CCXT; CSV é a rede.
- **Ficheiros mortos deixados no disco** (o bridge não permite `rm`): `frontend/src/pages/{Market,News,Watchlist}.jsx.bak-cut`, `frontend/src/components/InlineWatchlistDialog.jsx.bak-cut`, e `backend/routes/{market,watchlists}.py` (já não importados). Podem ser apagados à mão.
- **Foco:** manter a app magra — resistir a acrescentar funcionalidades de "fornecedor de dados de mercado"; profundidade = fiabilidade e polimento do núcleo.

### Removido recentemente (para focar e reduzir a dependência de dados externos)
- **Notícias**, **Mercado** (movers/gainers-losers), **Watchlist** e a **research de analistas** (consenso, price targets, P/E, EPS, Beta) da página do ativo. Backend: rotas `/market/*`, `/watchlists`, `/news` e o *refresher* de mercado de fundo.

---

## 10. Estrutura do repo (resumo)

```
backend/
  server.py            # app FastAPI, arranque, include de routers, tasks de fundo
  core.py              # db, auth, cache, require_admin, ADMIN_EMAILS
  prices.py            # CoinGecko/yfinance/FX + guardas + health + _cg_headers()
  models.py            # modelos Pydantic
  email_utils.py       # Resend
  push_utils.py        # Web Push (VAPID) + FCM
  telegram_utils.py    # bot Telegram
  alert_checker.py     # verificação periódica de alertas
  broker_connectors/   # degiro, ibkr, trading212, xtb, binance, coinbase, kraken, ccxt_generic
  routes/              # auth, billing, wallets, transactions, portfolio, alerts,
                       # search, news(/asset/history), preferences, security, share,
                       # brokers, asset, analytics, feedback, allocation,
                       # notifications, referrals

frontend/src/
  pages/               # Dashboard, Wallets, Transactions, Alerts, Alocacao,
                       # Analytics, Dividends, AssetDetail, Profile, Settings,
                       # ConnectedAccounts, Pricing, Billing, LandingPage, More,
                       # AdminFeedback, ...
  components/          # Layout, UpgradeOverlay/Dialog, DashboardWidgetDrawer, ...
  components/dashboard/# AllocationWidget, AssetsTable, TopMoversWidget, ...
  context/             # I18nContext (6 línguas), AuthContext
  lib/                 # api, format (fmtCurrency/fmtQty/fmtPriceSmart/convert),
                       # allocation, walletColors
  hooks/               # usePlan (isPro)
  constants/           # dashboardConstants, chartRanges
```

---

## 11. Notas de desenvolvimento (importante para quem editar)

- **Build/CI:** `CI=true` na Vercel → warnings de ESLint são erros. Cuidado com imports/variáveis por usar e `react-hooks/exhaustive-deps`.
- **i18n:** `t(chave)` devolve a **própria chave** quando não existe tradução, por isso `t(x) || fallback` **não** funciona. Padrão usado: helper `L = (key, fb) => { const v = t(key); return v && v !== key ? v : fb; }`.
- **Toasts:** usar `sonner` (não `react-hot-toast`).
- **Deploys:** push para `main` → Vercel (frontend) e Render (backend) fazem redeploy automático. Alterar variáveis no Render também dispara redeploy.
- **Admin:** `ADMIN_EMAILS = {"entredonos@gmail.com"}` em `core.py`; dependency `require_admin`.

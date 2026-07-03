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

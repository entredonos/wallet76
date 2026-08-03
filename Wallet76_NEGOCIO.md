# Wallet76 — Serviços, Custos e Plano de Lançamento

> Atualizado: 28 julho 2026. Guarda este ficheiro como fonte única de verdade
> sobre o que pagamos, o que é grátis, e o que fazer a seguir em cada fase.

---

## 1. Serviços atuais (o que pago hoje)

| Serviço | Plano atual | Custo | Estado |
|---|---|---|---|
| **Render** (backend FastAPI) | Starter | **$7/mês** | PAGO — always-on confirmado (planos pagos nunca adormecem) |
| **Domínio wallet76.com** | anual | ~€10-15/ano | PAGO |
| **Cloudflare Pages** (frontend) | Free | $0 | uso comercial permitido; migração feita a 30 jul 2026 (README §2). Vercel Hobby mantido só como reversão até ~13 ago |
| **MongoDB Atlas** (base de dados) | M0 Free | $0 | 512 MB, 500 conexões, **SEM backups automáticos** |
| **Resend** (emails) | Free | $0 | 3.000 emails/mês, máx. 100/dia, 1 domínio |
| **Stripe** (pagamentos) | pay-per-use | ~1,5% + €0,25 por transação (cartões UE) | ⚠️ ainda em modo TEST |
| **CoinGecko API** (preços cripto) | Demo | $0 | 10.000 credits/mês (~30 calls/min na prática) |
| **yfinance / Yahoo** (preços ações) | não-oficial | $0 | frágil — rate limits, sem garantias |
| **alternative.me + CNN** (sentimento) | não-oficial | $0 | best-effort, com cache stale |

**Custo total atual: ~€8/mês.**

---

## 2. Upgrades disponíveis (quando e quanto)

| Serviço | Próximo plano | Preço | Quando faz sentido |
|---|---|---|---|
| Vercel | Pro | $20/mês | Obrigatório ao vender (ver secção 3) — OU migrar p/ Cloudflare Pages ($0, permite comercial) |
| MongoDB Atlas | Flex | $8–30/mês (teto $30) | Ao ter clientes pagos: 5 GB + infraestrutura melhor. Nota: M2/M5 foram descontinuados em jan 2026 |
| MongoDB Atlas | M10 dedicado | ~$57/mês | Só com centenas de clientes (backup point-in-time) |
| Resend | Pro | $20/mês | Ao passar 3.000 emails/mês ou 100/dia (alertas de preço podem rebentar o limite diário primeiro!) |
| Render | Standard | $25/mês | Se o backend ficar lento (2 GB RAM, 1 CPU vs 512 MB / 0,5) |
| Dados de ações | FMP Starter | $22/mês (só EUA) | Quando o yfinance falhar com frequência |
| Dados de ações | FMP Premium | $59/mês (+UK/CA) | Idem, com mercados europeus parciais |
| Dados de ações | Twelve Data Grow | $79/mês ($66 anual) | Alternativa com melhor cobertura europeia |
| CoinGecko | Analyst | $129/mês ($103 anual) | Só se os rate limits de cripto doerem (500k credits, 500/min) |
| UptimeRobot | Free | $0 | ATIVAR JÁ — 50 monitores, checks de 5 min, grátis |
| Sentry | Developer | $0 | ATIVAR JÁ — 5.000 erros/mês grátis, rastreio de crashes |

> ⚠️ Dados de ações pagos: a maioria dos fornecedores exige licença comercial/
> redistribuição para mostrar dados a clientes finais. Confirmar termos antes
> de assinar. Um tracker NÃO precisa de real-time — delayed/EOD é muito mais barato.

---

## 3. ⚠️ Alertas importantes

1. **~~Vercel Hobby proíbe uso comercial~~ — RESOLVIDO a 30 jul 2026.** O
   frontend migrou para a Cloudflare Pages (grátis, uso comercial permitido);
   detalhes na entrada de 30 jul do README §2. **Pendente com data:** a partir
   de **13 ago 2026**, se as duas semanas correram sem incidentes, desmantelar
   o plano de reversão — apagar o projeto na Vercel, remover o
   `frontend/vercel.json`, e limpar a parte da Vercel na REGRA #5 + README.
   Se estás a ler isto depois dessa data e o projeto Vercel ainda existe,
   lembra o Jose.
2. **MongoDB M0 não tem backups.** Um erro/incidente apaga os portefólios de
   todos os clientes sem recuperação. Mitigação grátis imediata: script
   `mongodump` semanal no PC. Solução real: Atlas Flex ($8+).
3. **~~Stripe está em modo TEST~~ — LIVE confirmado a 30 jul 2026** (o Jose já
   tinha feito a passagem: produtos, chave e webhook live no Render). A
   transição deixou um resto: customers criados em modo de teste ficaram
   gravados na BD e faziam o checkout rebentar com 500 ("No such customer")
   para contas do período beta — corrigido no `billing.py` a 30 jul (README
   §2). **Circuito live provado a 26 jul** pelo próprio Jose (conta
   secundária: checkout com cartão real, subscrição em trial, webhook OK
   depois de acertar o `whsec_`, cancelada a 28) e re-verificado a 30 jul
   depois da correção dos customers mortos (`cs_live_`, 200). Nada falta.
4. **Emails saem de `onboarding@resend.dev`** se `FROM_EMAIL` não estiver
   definido — mata a entregabilidade e a credibilidade. Verificar o domínio
   wallet76.com no Resend (SPF+DKIM) e definir `FROM_EMAIL` no Render (grátis).

---

## 4. Prioridades técnicas (da auditoria de 28 jul 2026)

### P0 — antes de vender (bloqueadores)
- [x] Ícones PWA corrompidos (144/152/384) — corrigido em 28 jul
- [x] ~~Stripe live mode~~ **FEITO** — em live desde 26 jul (produtos, chaves, webhook, cupão: o Jose); customers órfãos do modo de teste corrigidos a 30 jul (README §2). Ver alerta 3.
- [ ] Resend: domínio verificado + FROM_EMAIL de produção
- [x] ~~Corrigir URL hardcoded `wallet76.vercel.app` no email de alertas (email_utils.py:183) e traduzi-lo (só existe em EN)~~ **JÁ ESTAVA FEITO desde 28 jul 2026** (caixa ficou por marcar; verificado a 3 ago): o `cta_url` usa `APP_URL` com reserva `wallet76.com` e aponta para `/alerts`, e o email sai do `EMAIL_I18N` ×6 — o comentário em `alert_email_html` (email_utils.py) documenta a correção
- [ ] Backups Mongo: script mongodump semanal (grátis) OU Atlas Flex
- [x] ~~Decidir Vercel Pro vs Cloudflare Pages~~ **FEITO 30 jul** — migrado para Cloudflare Pages, $0 e uso comercial permitido (README §2). Desmantelar a Vercel a partir de 13 ago se estável.
- [x] ~~Bug: `DELETE /transactions/all` nunca funciona (rota registada DEPOIS de `/transactions/{txn_id}`).~~ **FEITO 28 jul 2026** — rota movida para antes das irmãs parametrizadas (transactions.py:70); validado em produção. Ver README §2.
- [x] ~~`PublicPortfolio.jsx:6` usa env var errada (`REACT_APP_API_URL`).~~ **FEITO 28 jul 2026** — passou a importar `API` do `lib/api.js`, como todas as outras páginas. Ver README §2 e §7.1.
- [ ] `og:image` do index.html: URL relativo + ficheiro; usar URL absoluto `https://wallet76.com/...` com imagem 1200×630 (partilhas WhatsApp/redes saem sem imagem)
- [x] **~~NOVO 30 jul — bloqueador de estabilidade~~ RESOLVIDO 1 ago (24 h sem OOM; veredicto no README §2):** o backend morre por falta de memória 2-3×/dia no Render (OOM >512 MB; memória em escada o dia todo — suspeitas: caches em processo sem teto). Investigar e corrigir ANTES de meter tráfego pago em cima. Plano combinado: tetos/TTL nas caches + endpoint `/api/admin/health` (RSS, tamanho das caches, dbStats) + relatório agendado por email/Telegram. **Progresso 31 jul:** a cache central já era LRU-3000 (15 jul) mas contava entradas e não bytes — ganhou orçamento de bytes (**96 MB em produção** via env `MAX_CACHE_MB`; 128 por omissão no código — o processo nasce com ~315-374 MB de base e o orçamento tem de caber na folga) e o `/api/admin/health` está no ar. **Veredicto 31 jul, 20:30:** cache inocente (RSS 408 MB com cache a 0,5) e 3 OOM na tarde — suspeito principal: fragmentação do alocador (pandas/yf.download em threads). Mitigação: `MALLOC_ARENA_MAX=2` no Render; health passou a expor threads e fds. **1 ago:** gatilho reproduzível encontrado (várias pesquisas seguidas → 17 sufixos × yf.Ticker × 10+ threads em paralelo = pico agudo) e travado: piscina do `to_thread` fixada em 4 workers no arranque. **Prova de carga 1 ago:** 2 tempestades de pesquisas contra produção (9+6, com disparates a acionar os 17 sufixos) — zero mortes, RSS 284→313 estável na 1.ª e +0,1 MB na 2.ª; baseline de arranque desceu para 284 MB. Falta só a confirmação de 24 h em hora de ponta; depois fecha-se este P0 e desenha-se o relatório agendado. **2 ago:** relatório agendado FEITO — `health_report.py`, email aos admins de X em X dias (env `HEALTH_REPORT_DAYS`, omissão 7; cadência guardada em `db.meta` para sobreviver aos deploys; primeiro envio imediato).
- [ ] Teste ponta-a-ponta completo em live: registo → verificação → adicionar ativos → checkout fundador → cancelar no portal *(nota 30 jul: checkout normal + webhook + cancelamento já provados a 26 jul com conta secundária; falta o percurso do fundador completo)*

### P1 — primeiras semanas de vendas
- [x] Analytics de funil — **andar do meio FEITO a 3 ago 2026** (README §2): coleção `events` append-only (funnel.py), 7 degraus instrumentados (registo, email verificado, primeiro ativo nos 3 caminhos do onboarding, checkout iniciado, trial, ativo, cancelamento), `GET /admin/funnel?days=X` (7 números + % entre degraus; cancelled = churn) e lista de utilizadores enriquecida (nº ativos, corretoras, estado da subscrição) + tab Funil no painel admin. **Andar de cima também FEITO (3 ago, mesma tarde):** o site já existia no CF Web Analytics há um mês mas a 0 — o modo excluía visitantes da UE e, corrigido isso, descobriu-se que a injeção automática não funciona com a Pages; ficou o snippet manual no index.html + modo «JS Snippet installation» no painel (README §2 e §13). O andar de baixo é o painel do Stripe (link, não cópia).
- [ ] Rate-limit contornável: `_client_ip()` confia no primeiro X-Forwarded-For (controlável pelo atacante); usar o último (core.py:395)
- [ ] Chamadas Stripe síncronas dentro de endpoints async bloqueiam o servidor inteiro; envolver em `asyncio.to_thread` + try/except (billing.py)
- [ ] Bónus referral de 45 dias perde-se se o checkout for abandonado (flag gravada cedo demais; mover para o webhook) (billing.py:73)
- [ ] Registo duplicado simultâneo dá 500 em vez de 400 (auth.py:38)
- [ ] Idioma inicial: detetar `navigator.language` em vez de PT fixo (um alemão novo vê tudo em português) (I18nContext.jsx)
- [ ] `PublicPortfolio.jsx` todo em inglês hardcoded — é a montra dos links partilhados; adicionar COPY 6 línguas
- [ ] Empty state do Dashboard: fraco ("Sem ativos…"); adicionar CTA direto + considerar modo demo
- [ ] Monitorização: UptimeRobot no /ping + Sentry no frontend (ambos grátis)
- [ ] Watchlists: o router NÃO está montado no server.py (289 linhas de código com endpoints 404) — montar ou apagar

### P2 — melhoria contínua
- [ ] Lentidão da 1ª ligação: servir preços stale imediatamente e atualizar em fundo (stale-while-revalidate no /portfolio)
- [ ] Sparklines de carteira somam séries por índice e não por data (curva distorcida em carteiras mistas ações+cripto) (wallets.py:59)
- [ ] Export CSV do RGPD: usar módulo csv com quoting + proteção contra fórmulas Excel (auth.py:273)
- [ ] Limpeza de código morto: `routes/market.py` (518 linhas), pastas `_backup_*`, 36 componentes shadcn/ui não usados, 7 deps npm mortas, deps Python nunca importadas (openai, boto3, etc.), `litellm` instalado de URL de terceiros (risco supply chain)
- [ ] `TransactionUpdate` sem validação gt=0 (PATCH com valores negativos corrompe holdings) (models.py:72)
- [ ] `delete_wallet` não invalida cache de histórico (gráfico fantasma até 1h) (wallets.py:110)
- [ ] CORS: tirar localhost:3000 da allowlist de produção (server.py:137)
- [ ] Emails de utilizadores em logs INFO (PII nos logs do Render)

---

## 5. Checklist pré-venda — passo a passo

### Semana 1 — Técnica
1. Corrigir os P0 acima (1-2 dias de trabalho)
2. Push dos ícones corrigidos + este ficheiro
3. Stripe live: produtos, preços (mensal 5,99 € / anual 49,99 €), cupão fundador, webhook, testar com cartão real
4. Resend: domínio + FROM_EMAIL; testar os 7 emails (verificação, reset, 4 onboarding, alerta)
5. mongodump semanal agendado no PC (Agendador de Tarefas do Windows)
6. UptimeRobot + Sentry (1h de trabalho, grátis)

### Semana 2 — Medição e montra
7. Analytics + eventos de funil (sem cookies → banner atual continua válido)
8. og-image 1200×630 + testar partilha no WhatsApp
9. Testar instalação PWA no Android/iPhone/Windows depois do deploy dos ícones
10. 3-5 testemunhos de utilizadores beta (mesmo informais) para a landing
11. Rever preços vs concorrência (5,99 € está bem posicionado — manter)

### Lançamento — Marketing (por ordem, quase tudo grátis)
12. **Soft launch**: amigos/conhecidos com o código de referral (o programa Convida e Ganha já está pronto)
13. **Reddit**: r/eupersonalfinance, r/literaciafinanceira, r/financaspessoaispt, r/Finanzen (DE), r/vosfinances (FR) — posts honestos "construí isto", não spam
14. **Product Hunt**: preparar bem (screenshots, GIF, primeira hora é crítica)
15. **Comparativos SEO**: já no ar em 6 línguas — vão trazendo tráfego orgânico
16. **Vídeos curtos**: TikTok/Shorts/Reels a mostrar o dashboard real (30s, "como sigo 5 corretoras num só sítio") — **roteiros prontos** (15/30/60 s, personagem Miguel, falas e notas de produção): `marketing/wallet76-roteiros-anuncios.md`. Gravar com conta demo, nunca com saldos reais. Os 100 € de orçamento: guardar até um vídeo orgânico provar o gancho, e impulsionar esse.
17. **Parcerias**: micro-criadores de finanças pessoais PT/ES/FR/DE (oferecer 6-12 meses Pro grátis)
18. **Google Ads**: só DEPOIS de haver conversões orgânicas medidas — começar com €5-10/dia em "portfolio tracker" nas 6 línguas; CPC alto, cuidado
19. Meta de validação: 10 pagantes fundadores → depois escalar publicidade

---

## 6. Custos projetados por fase

| Fase | Clientes pagos | Custo mensal estimado | O que muda |
|---|---|---|---|
| Agora | 0 | ~€8 | atual |
| Lançamento | 1-20 | ~€28-35 | + Vercel Pro $20 (ou €8 se Cloudflare) + Flex $8 |
| Crescimento | 20-100 | ~€55-80 | + FMP $22-59 (dados ações fiáveis) |
| Escala | 100-500 | ~€100-150 | + Resend Pro $20, Render Standard $25 |
| Madura | 500+ | ~€250+ | + CoinGecko Analyst, M10, suporte |

Break-even: com margem de ~€5/cliente/mês, **7 clientes pagam a fase de
lançamento; 30 pagam a fase de crescimento.** A oferta de 100 fundadores
cobre folgadamente todas as fases até à escala.

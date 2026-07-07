# Wallet76 — Análise de Produto e Diferenciação (julho 2026)

Revisão do projeto todo (backend + frontend) cruzada com pesquisa de mercado sobre trackers de portefólio/net worth (Kubera, Delta/eToro, Sharesight, Ghostfolio, Empower, Monarch, Capitally, Snowball Analytics) e queixas reais de utilizadores em reviews de App Store/Play Store.

---

## As 10 coisas que quem investe mais procura neste tipo de app

1. **Cobertura multi-ativo num só sítio** — ações, ETFs, cripto, e cada vez mais também dinheiro, imóveis e outros ativos "alternativos", não só a carteira de bolsa.
2. **Análise de performance a sério**, não só o saldo — retorno vs. benchmark, CAGR, drawdown máximo, melhor/pior período.
3. **Tracking de dividendos** — yield, frequência, rendimento anual estimado, e não só o preço.
4. **Relatórios prontos para os impostos** (mais-valias/CGT num formato aceite pela autoridade fiscal do país), não só um export de transações em bruto.
5. **Alertas em mais do que email** — push nativo, e nalguns casos WhatsApp/Telegram/SMS.
6. **Transparência de comissões/fees** — quanto é que as comissões e TERs estão a custar ao longo do tempo.
7. **Confiança e segurança visíveis** — ligações só de leitura aos brokers, encriptação, "nunca pode mover dinheiro", certificações.
8. **Experiência nativa mobile a sério** — widgets no ecrã principal, desbloqueio biométrico, app de Apple Watch.
9. **Sincronização automática com brokers/exchanges**, o mínimo de introdução manual possível.
10. **Visão de património total, não só de mercado** — contas à ordem, imóveis, dívidas/empréstimos — e cada vez mais também metas/objetivos e sugestões de rebalanceamento.

Fontes: WallStreetZen, Forbes Advisor, PortfolioPilot, Capitally, AllInvestView, Kubera blog, WalletHub, useOrigin — pesquisa de julho 2026.

---

## Onde o Wallet76 já está à frente (não mexer, é força)

- **6 línguas (PT/DE/FR/ES/IT/EN)** — isto é realmente raro nesta categoria. Sharesight, Delta, Kubera são todos primeiro em inglês. Isto é uma vantagem competitiva real na Europa/América Latina que vale a pena martelar no marketing da loja, não só ter por baixo do capô.
- **Dividend tracking já está ao nível de apps especializadas** — yield, frequência, "dividend crown" (25+/10+ anos), rendimento anual estimado. Já bate a maioria da concorrência genérica.
- **6 conectores de broker/exchange** (Trading212, Binance, Coinbase, Kraken, DEGIRO, IBKR) — cobertura já sólida de sync automático, que é o ponto #9 acima.
- **Segurança já bem tratada** — encriptação AES-256-GCM por utilizador nas credenciais de broker, RGPD, servidores UE, e agora o export de dados self-service. É só preciso tornar isto mais visível ao utilizador (ponto #7).
- **Analytics já sólida** — CAGR, drawdown, benchmark SPY, melhor/pior mês, tudo isto já existe e está bem feito.

## Onde há gaps reais

- **Sem relatório fiscal (#4)** — só há export CSV/JSON em bruto. Nenhum "resumo de mais-valias" pronto para entregar ao contabilista ou preencher a declaração.
- **Benchmark preso ao SPY (#2)** — um investidor europeu pode querer comparar com o MSCI World, Euro Stoxx 50, ou o próprio índice do seu país, não só o mercado americano.
- **Sem contas de dinheiro/imóveis/dívidas (#1, #10)** — o Wallet76 é hoje só "carteira de investimentos", não "património total". Isto é a maior diferença face ao Kubera/Monarch/Empower, que estão a ganhar terreno exatamente por darem essa visão mais larga.
- **Alertas só por email (#5)** — sem push nativo (a app store vai desbloquear isto), sem WhatsApp/Telegram.
- **Sem análise de comissões (#6)** — não há nada a mostrar quanto as comissões de compra/venda ou TERs de ETFs custam ao longo do tempo.
- **Sem metas/objetivos nem sugestões de rebalanceamento** — o utilizador define alvos de alocação (já existe), mas a app não diz "estás a X% da tua meta de reforma" nem sugere o que comprar/vender para rebalancear.
- **Sem app nativa ainda (#8)** — é literalmente o que estamos a construir agora. Isto é a oportunidade de ganhar de vez este ponto: widgets, biometria nativa, e mais tarde Apple Watch.

---

## As minhas sugestões, por prioridade

### Fazer primeiro (baixo esforço, alto impacto)
1. **Widget de ecrã principal** (valor da carteira + % do dia) assim que o Capacitor estiver a funcionar — é dos recursos mais pedidos e mais visíveis nas reviews de apps concorrentes, e diferencia logo a versão nativa da versão web.
2. **Escolha de benchmark** — dropdown simples (SPY / MSCI World / Euro Stoxx 50 / índice à escolha) em vez de SPY fixo. Reaproveita a lógica de `_compute_metrics` que já existe, só muda o símbolo yfinance buscado.
3. **Tornar a segurança visível** — uma secção/selo em Definições ou na landing page: "Ligações só de leitura", "Nunca podemos mover o teu dinheiro", "AES-256", "Conforme RGPD", "Servidores UE". A confiança já existe tecnicamente, falta mostrá-la — é um dos pontos mais citados como decisivo para converter visitantes em utilizadores pagantes.

### Médio prazo
4. **Notificações push nativas** (via Capacitor, depois de ter a app nas lojas) para os alertas de preço — hoje só há email.
5. **Relatório de mais-valias exportável** — mesmo que simples (ganhos/perdas realizados por ano civil, por ativo), já cobre o caso de uso #4 que hoje só tem CSV em bruto.
6. **Análise de comissões/TER** — mostrar quanto as comissões de transação e os expense ratios dos ETFs custaram este ano.

### Maior esforço, mas maior diferenciação
7. **Ativos "outros"/património total** — permitir adicionar manualmente contas à ordem, imóveis (com valor atualizável), e dívidas/empréstimos como itens negativos. Não precisa de ligação automática a bancos (isso exige Plaid/agregadores e compliance pesada) — só entrada manual já aproxima o Wallet76 de um "net worth tracker" como o Kubera, sem o custo de integração bancária.
8. **Metas de reforma/objetivo** — "quero Xk até 20XX" com progresso visual, ligado à carteira real.
9. **App de Apple Watch** — depois da app iOS estar madura; é um recurso pequeno para implementar mas que aparece muito nas reviews positivas dos concorrentes.

---

## O que eu faria primeiro, já a pensar na loja

Dado que estamos mesmo agora a preparar o lançamento nas lojas: o widget de ecrã principal (#1 acima) é o que dá mais "uau" imediato a quem instala a app pela primeira vez, e o selo de segurança visível (#3) é o que mais ajuda a converter quem já a instalou em utilizador pagante. Nenhum dos dois exige mudanças grandes na arquitetura atual.

---

## Detalhe de cada ponto — descrição, 3 vantagens, 3 desvantagens

### 1. Multi-ativo num só sítio
Ver ações, ETFs, cripto, dinheiro e imóveis na mesma vista, sem trocar de app.
- **A favor:** visão real da riqueza, não só da carteira de bolsa · decisões de alocação mais informadas (ex.: já tenho muito imobiliário, não preciso de mais REITs) · um login em vez de 4 apps diferentes.
- **Contra:** imóveis/carros exigem entrada manual ou avaliações de terceiros nem sempre precisas · mistura ativos líquidos com ilíquidos pode iludir quanto realmente dá para vender depressa · mais dados guardados = mais responsabilidade de segurança.

### 2. Análise de performance a sério
Retorno vs. benchmark, CAGR, drawdown máximo, melhor/pior período — já existe no Wallet76.
- **A favor:** mostra se está mesmo a bater o mercado, não só "subiu" · ajuda a manter calma numa queda ao ver o drawdown histórico · dá números concretos para decidir rebalancear ou vender.
- **Contra:** pode intimidar quem começa, com jargão (CAGR, drawdown) · comparação só ao SPY pode enganar quem investe noutra região · performance passada é fácil de ler como promessa, e não é.

### 3. Tracking de dividendos
Já forte no Wallet76: yield, frequência, "dividend crown" (25+/10+ anos).
- **A favor:** mostra rendimento passivo real, não só ganho de capital · ajuda a planear reforma/independência financeira · distingue quem paga sempre de quem corta o dividendo.
- **Contra:** dividendo futuro é estimativa, pode ser cortado sem aviso · irrelevante para quem só investe em cripto/growth · pode criar viés de escolher só por yield alto ("yield trap").

### 4. Relatório fiscal
Não existe ainda — só há export CSV/JSON em bruto.
- **A favor:** poupa horas ao contabilista/à própria pessoa na época dos impostos · reduz erros de cálculo manual de mais-valias · diferenciador forte, quase ninguém faz isto bem em PT.
- **Contra:** regras fiscais variam por país e mudam todos os anos, manutenção contínua · nunca substitui um contabilista em casos complexos, tem de ficar claro · risco reputacional se o cálculo sair errado.

### 5. Alertas multi-canal
Hoje só existe email.
- **A favor:** push chega mais depressa que email · WhatsApp/Telegram têm taxa de abertura muito maior · permite alertas mais "no momento" (queda de 5% agora).
- **Contra:** push nativo só com a app das lojas, não no browser · mais canais = mais pontos de falha e manutenção · notificações a mais podem irritar se mal configuradas.

### 6. Transparência de comissões
Não existe ainda.
- **A favor:** mostra o custo real e composto dos fees ao longo dos anos · ajuda a escolher ETFs mais baratos (TER) · diferencia de apps que só mostram preço sem contexto de custo.
- **Contra:** dados de TER por fundo nem sempre fáceis de obter de fontes gratuitas · comissões de corretora nem sempre vêm estruturadas no extrato · pode parecer "chato" para quem só quer ver o saldo.

### 7. Confiança e segurança visíveis
Já forte por baixo do capô (AES-256, RGPD, servidores UE) — falta mostrar.
- **A favor:** aumenta a conversão de visitante para utilizador pagante, é o que mais pesa em reviews · tranquiliza quem já foi vítima de phishing/scam · diferencia de apps que pedem passwords em vez de acesso só de leitura.
- **Contra:** exige linguagem cuidada para não prometer mais do que a tecnologia garante · selos por si só não substituem auditorias externas reais (SOC2), que custam dinheiro · pode dar falsa sensação de segurança absoluta.

### 8. Nativo mobile (widget, biometria, Watch)
O que estamos a construir agora com o Capacitor.
- **A favor:** widget no ecrã principal é dos recursos mais pedidos nas reviews da concorrência · biometria nativa é mais rápida e mais segura que password · presença na loja aumenta confiança e descoberta orgânica.
- **Contra:** mais uma plataforma para manter (builds, revisões Apple/Google) · a Apple pode rejeitar se achar que "é só um webview" sem funcionalidade nativa suficiente · app de Watch é esforço extra para um público mais pequeno.

### 9. Sync automático com brokers
Já forte: 6 conectores (Trading212, Binance, Coinbase, Kraken, DEGIRO, IBKR).
- **A favor:** zero introdução manual de transações, menos erro humano · dados sempre atualizados sem esforço · é o que mais gente valoriza logo no onboarding.
- **Contra:** cada corretora muda a API sem aviso, exige manutenção constante · credenciais de terceiros são sempre um risco de segurança extra a gerir · corretoras mais pequenas nunca vão ter conector dedicado.

### 10. Património total (net worth com dívidas)
Não existe ainda — hoje é "carteira", não "património".
- **A favor:** visão completa e realista da riqueza, é o que Kubera/Monarch vendem bem · mostra progresso real (pagar dívida também é "crescer" património) · atrai um público mais alargado do que só quem investe em bolsa.
- **Contra:** entrada manual de imóveis/dívidas fica desatualizada se o utilizador não a mantiver · sem ligação bancária automática fica menos "mágico" que a concorrência · risco de scope creep — a app deixar de parecer focada em investimentos.

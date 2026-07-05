# Wallet76 Mobile — proposta de navegação e ecrãs

Estado: **proposta para aprovação** — nada disto foi codificado ainda.
Inspiração de estilo: XTB / eToro (bottom tab bar, cartões, números grandes,
pouco texto). Paleta e tipografia seguem o que já existe no web (zinc-950,
acento âmbar, verde/vermelho para P&L) para a marca ficar consistente entre
web, PC (Electron) e mobile.

## Arquitetura de navegação

5 separadores fixos no fundo do ecrã (bottom tab bar) — mesmo número que a
XTB/eToro usam, para não sobrecarregar:

1. Início
2. Carteiras
3. Mercado
4. Alertas
5. Perfil

"Painel avançado" e "Transações" NÃO são separadores próprios — são ecrãs a
que se chega a partir de um botão (Início → Painel avançado) ou de um cartão
de carteira (Carteiras → abrir → Transações), para manter a barra de baixo
com só 5 ícones.

## Ecrãs essenciais (MVP)

### 1. Início
O que mostra ao entrar. Saldo total, variação %, um mini-gráfico da evolução
(mesma ideia do "painel leve" que já existe no web), 2 botões rápidos
("+ Adicionar" e "Painel avançado") e as 2-3 carteiras com maior valor. É a
vista mais simples possível — qualquer pessoa entende o essencial em 2
segundos, sem menus.

### 2. Carteiras
Lista de todas as contas/corretoras ligadas (DEGIRO, Binance, Ledger, etc.),
cada uma com o seu saldo e variação %. Tocar numa carteira abre o detalhe
(que reutiliza a mesma vista de Início, mas filtrada a essa carteira) e dá
acesso ao histórico de transações dessa conta.

### 3. Mercado
Três segmentos: "Cripto" / "Ações" / "A seguir". Cripto e Ações mostram "Em
alta" e "Em baixa" do mercado geral (não da carteira do utilizador) e uma
secção "Notícias" no fundo. "A seguir" é a watchlist — os ativos que o
utilizador segue sem ter comprado, com botão para adicionar mais. Junta três
funções (mercado, watchlist, notícias) sem abrir mais nenhum separador na
barra de baixo.

### 4. Alertas
Lista de alertas de preço já configurados, com interruptor on/off por linha
e um botão "+" para criar um novo. Sem isto configurado, mostra um
estado vazio a convidar a criar o primeiro alerta.

### 5. Perfil
Idioma, moeda, segurança (PIN/biometria — já existe no backend), e sair.
Ponto único onde o utilizador ajusta preferências, sem misturar com o resto.

## Ecrãs opcionais/avançados (podem sair do MVP)

### Painel avançado
Acessível a partir de Início. É o equivalente ao dashboard completo que já
existe no web: gráfico com seletor de intervalo (1D/1S/1M/1A), gráfico de
alocação (donut) e tabela de ativos. Mais denso — só para quem quer analisar
a fundo. Dá para lançar o MVP sem isto e adicionar depois, sem afetar os
outros 5 ecrãs.

### Transações
Acessível a partir de uma carteira. Lista de compras/venda com filtro e
botão para adicionar uma transação manual. Também dá para cortar do MVP
inicial — o essencial (ver quanto vale a carteira) não depende disto.

## Notas de implementação (só depois de aprovado)

- Mesma conta em qualquer aparelho: já garantido, os dados são todos
  server-side por user_id (API partilhada com o web).
- PC: `frontend/package.json` já tem `electron-builder` configurado
  (`main: electron/main.js`, instalador `.nsis` Windows) — falta ligar o
  build e publicar o instalador na landing page.
- Mobile (Play Store / App Store): caminho mais leve a partir do React já
  existente é envolver o mesmo frontend com Capacitor, em vez de escrever
  uma app nativa à parte.
- Tudo dentro do mesmo repositório Wallet76 — não numa pasta separada (ver
  discussão em chat: evita duplicar auth/API/i18n).

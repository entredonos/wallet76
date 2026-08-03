---
name: frontend-design
description: >-
  Guia de bom design de frontend/UI — princípios reutilizáveis para construir
  interfaces limpas, modernas e profissionais em qualquer projeto (HTML/CSS,
  React, Tailwind, etc.). Cobre layout e espaçamento, hierarquia visual,
  tipografia, cor, componentes e estados, profundidade e movimento, responsivo,
  acessibilidade e os erros que denunciam design amador. USA esta skill SEMPRE
  que fores construir, redesenhar ou rever qualquer interface — uma página,
  um ecrã, um componente, um dashboard, uma landing, um formulário, um modal —
  ou quando o utilizador falar em "UI", "design", "layout", "aspeto", "estética",
  "deixar bonito", "parece amador", "melhorar o visual" ou "frontend". Lê-a
  ANTES de escrever a primeira linha de markup/estilos, para o resultado sair
  coerente à primeira em vez de remendado depois. (Para gráficos/visualização de
  dados especificamente, usa a skill dataviz.)
---

# Frontend Design — guia de bom design

Bom design é quase invisível: a pessoa faz o que quer sem reparar na interface. Chega-se lá com **clareza, hierarquia, consistência e contenção** — não com mais efeitos. Antes de construir, decide o *sistema* (escala de espaçamento, escala tipográfica, paleta) e depois aplica-o sem exceções. É a consistência que faz uma UI parecer profissional.

Regra-mãe: **na dúvida, tira em vez de pôr.** Menos cores, menos tamanhos, menos caixas, mais espaço.

## 1. Layout e espaçamento

- **Espaço em branco é uma funcionalidade, não desperdício.** Dá ar aos elementos; interfaces apertadas parecem baratas. Padding generoso dentro de cartões e botões.
- **Usa uma escala de espaçamento** (ex.: 4, 8, 12, 16, 24, 32, 48, 64). Nunca valores aleatórios (7px, 13px). O Tailwind já força isto — aproveita.
- **Alinhamento é tudo.** Alinha à esquerda por defeito; cria uma grelha e respeita-a. Coisas desalinhadas por 2-3px são o que faz algo "cheirar mal" sem se perceber porquê.
- **Agrupa por proximidade.** O que está relacionado fica junto; separa grupos com mais espaço (não com linhas/bordas por tudo).
- **Larguras máximas.** Conteúdo não deve esticar até 2000px — limita (ex.: `max-w-6xl`) e centra.

## 2. Hierarquia visual

- Guia o olho com **tamanho, peso, cor e espaço** — por esta ordem de força. O elemento mais importante tem de ganhar sem esforço.
- **Uma ação primária por ecrã.** Um botão cheio/destacado; o resto secundário (contorno) ou terciário (só texto). Se tudo grita, nada se ouve.
- **Contraste de peso, não só de tamanho.** Um título 600–700 vs corpo 400 lê melhor do que dois tamanhos parecidos.

## 3. Tipografia

- **Uma ou duas famílias, no máximo.** Uma para tudo já chega quase sempre.
- **Escala tipográfica** com poucos degraus (ex.: 12, 14, 16, 20, 24, 32, 48). Não uses 15 tamanhos diferentes.
- **Corpo a ~16px, `line-height` ~1.5.** Títulos mais apertados (~1.1–1.25).
- **Medida de linha ~60–75 caracteres.** Linhas demasiado longas cansam; por isso o texto corrido não deve ocupar a largura toda.
- **Alinha texto longo à esquerda** (não centrado). Centrar só títulos curtos.
- **Contraste de texto suficiente.** Cinzento-claro sobre fundo escuro fica ilegível — respeita o mínimo de contraste (ver Acessibilidade).

## 4. Cor

- **60 / 30 / 10:** ~60% neutro (fundos), ~30% tom secundário, ~10% cor de destaque. A cor de destaque é rara — é isso que a torna eficaz.
- **Uma cor de marca/destaque, usada com parcimónia** (ações, foco, estados ativos). Não pintes tudo.
- **Neutros fazem o trabalho pesado.** Uma boa escala de cinzentos (ex.: zinc/slate) resolve 90% da UI.
- **Cores semânticas** consistentes: verde=sucesso, âmbar=aviso, vermelho=erro/negativo. Não uses vermelho decorativo.
- **Evita gradientes por todo o lado** e arco-íris de cores. Um gradiente subtil, pontual, ok.
- **Dark mode:** não é só inverter. Fundos quase-pretos (não #000 puro), superfícies ligeiramente mais claras que o fundo para dar profundidade, texto não-branco-puro (ex.: zinc-100/200), e verifica o contraste outra vez.

## 5. Componentes e estados

- **Consistência de forma:** o mesmo raio de canto, a mesma espessura de borda, a mesma sombra em toda a app. Define uma vez, reutiliza.
- **Botões com hierarquia clara:** primário (cheio), secundário (contorno), terciário (só texto/ghost). Mesma altura e padding.
- **Nunca te esqueças dos estados.** Para cada elemento interativo pensa em: `default`, `hover`, `focus` (visível!), `active`, `disabled`, e — quando aplicável — `loading`, `empty`, `error`. É a diferença entre um protótipo e um produto.
- **Formulários:** label sempre visível (não só placeholder), erros claros junto ao campo, área de toque suficiente, foco óbvio.
- **Feedback imediato:** botões mostram estado de carregamento; ações destrutivas pedem confirmação; toasts para confirmar/erro.

## 6. Profundidade e movimento

- **Profundidade subtil.** Sombras suaves e/ou bordas ténues para separar camadas — não sombras pesadas e escuras. Em dark mode, muitas vezes uma borda ténue (`border-zinc-800`) dá melhor separação do que sombra.
- **Transições curtas:** 150–200ms, com `ease`. Animar hover/focus/aparições dá polimento; animar tudo distrai.
- **Micro-interações** com propósito (um check que aparece, um número que conta). Nunca movimento gratuito.
- **Respeita `prefers-reduced-motion`.**

## 7. Responsivo e telemóvel

- **Mobile-first.** Desenha para o ecrã pequeno primeiro; o desktop é o caso fácil.
- **Reflui, não encolhas.** No telemóvel, empilha e reorganiza — não metas só a versão desktop mais pequena. Tabelas largas → cartões ou scroll horizontal com a 1.ª coluna fixa.
- **Áreas de toque ≥ ~44px.** Botões e links suficientemente grandes para o dedo.
- **Respeita as *safe areas*** (notch, barra de gestos) com `env(safe-area-inset-*)`.
- Testa em ~360–390px de largura (telemóveis reais), não só no ecrã grande.

## 8. Acessibilidade (não é opcional)

- **Contraste:** texto normal ≥ 4.5:1, texto grande ≥ 3:1 (WCAG AA). Aquele cinzento bonito mas ilegível reprova aqui.
- **Foco visível** em tudo o que é navegável por teclado (`focus-visible`). Não removas o outline sem pôr algo melhor.
- **HTML semântico:** `<button>` para ações, `<a>` para navegação, headings por ordem, `<label>` ligado ao input.
- **Imagens com `alt`**, ícones decorativos escondidos de leitores de ecrã, ícones informativos com rótulo.
- Não transmitas informação **só pela cor** (ex.: verde/vermelho sem outro sinal).

## 9. Estados de conteúdo (o que separa amador de profissional)

- **Empty state** que orienta ("Ainda não tens X — começa por…") em vez de um ecrã vazio.
- **Loading** com skeletons (não um spinner solitário no meio) — dá noção da estrutura que vem a caminho.
- **Erro** claro e recuperável, com o que fazer a seguir.

## Erros comuns (tiques de design amador / "de IA")

Se vês isto, corrige:

- Espaçamentos inconsistentes; coisas quase-alinhadas mas não.
- Cores a mais / paleta arco-íris / gradientes por tudo.
- Tudo centrado, incluindo parágrafos longos.
- Texto cinzento de baixo contraste ("bonito" mas ilegível).
- Sombras pesadas e caixas dentro de caixas dentro de caixas.
- Sem hierarquia — tudo com o mesmo tamanho/peso; ou vários botões todos "primários".
- Cantos redondos inconsistentes; bordas em tudo.
- Emojis a servir de ícones num produto sério.
- Densidade a mais (tudo colado) ou a menos (tudo perdido no vazio).
- Ignorar estados (sem hover/focus/empty/loading/error).

## Checklist antes de dar por feito

1. Há **uma** ação primária clara neste ecrã?
2. O espaçamento vem todo da **mesma escala**?
3. Uso ≤ 2 famílias e poucos tamanhos de letra?
4. Neutros + **uma** cor de destaque, usada com parcimónia?
5. O texto todo passa no **contraste**? O foco é **visível**?
6. Todos os elementos interativos têm **hover/focus** (e loading/empty/error onde faz sentido)?
7. Funciona a **360px** de largura, com áreas de toque decentes?
8. Consigo **tirar** mais alguma coisa (cor, borda, caixa, palavra)?

Se um destes falha, ainda não está pronto.

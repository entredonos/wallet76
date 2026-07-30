---
name: wallet76
description: Método de trabalho no repositório Wallet76 (app de carteira de investimentos do Jose - FastAPI/MongoDB no Render + React na Cloudflare Pages, domínio wallet76.com). Usa esta skill SEMPRE que o trabalho toque neste repositório - editar backend ou frontend, diagnosticar lentidão ou erros em produção, mexer no README/CLAUDE.md, preparar um commit, ou investigar logs do Render. Contém as regras do projeto, o procedimento obrigatório de edição através da ponte do dispositivo (acentos + CRLF), as armadilhas que já custaram tempo, e o método de medição de performance. Se a conversa foi compactada e perdeste o contexto do Wallet76, lê isto primeiro.
---

# Wallet76 — método de trabalho

Esta skill existe porque o contexto desta conversa é compactado com frequência e
as lições do projeto perdiam-se de cada vez. O que está aqui é o que já custou
tempo a descobrir. Lê antes de mexer, não depois.

## O terreno

| O quê | Onde |
|---|---|
| Repositório (máquina do Jose) | `/sessions/<sessao>/mnt/Wallet76` via `device_bash` |
| Caminho Windows (para `device_stage_files`/`device_commit_files`) | `C:\Users\bruno\Desktop\APPS\Wallet76\...` |
| Backend | FastAPI + MongoDB, Render (plano Starter: **512 MB / 0,5 CPU**) |
| Frontend | React + CRA/craco; Cloudflare Pages (projeto `wallet76`, deploy automático no push ao `main`; `beta.wallet76.com` = teste); domínio `wallet76.com` |
| API em produção | `https://wallet76.com/api/...` (mesmo domínio, via proxy — **não** `wallet76-1.onrender.com`) |
| Regras do projeto | `CLAUDE.md` na raiz |
| Registo de alterações | `README.md` na raiz — **não versionado, está no `.gitignore`, nunca o metas num commit** |
| Prioridades de negócio | `Wallet76_NEGOCIO.md` |

O contentor da cloud onde corro (`Bash`, `Read`, `Write`) é um **sistema de
ficheiros diferente** da máquina do Jose. Um ficheiro escrito num não existe no
outro. Além disso o contentor **não tem rede útil** para esta app (`curl` ao
Render devolve exit 56) e o `device_bash` também não tem rede — qualquer medição
contra produção faz-se pelo browser (Chrome MCP).

## Regras do Jose (resumo — o texto que manda está no `CLAUDE.md`)

1. **#1 i18n obrigatório** — texto novo visível passa pelas 6 línguas, nunca
   hardcoded.
2. **#2 histórico/snapshots é território sensível** — o gráfico de evolução já
   foi corrompido uma vez e não se reconstrói sozinho. Não mexer "de passagem".
   Mudar *quando* um pedido é feito é aceitável; mudar *como* o histórico é
   reconstruído exige conversa.
3. **#3 pergunta ≠ ordem** — quando ele pergunta, respondo com opinião e uma
   pergunta de volta. Não avanço sem ordem explícita.
4. **#4 checklist de variáveis do Render** antes de deploy.
5. **#5 proxy same-origin obrigatório no alojamento** (frontend e backend em
   domínios diferentes) — na Vercel são os `rewrites` do `vercel.json`; na
   Cloudflare Pages é a Function `frontend/functions/api/[[path]].js`, porque
   o `_redirects` não proxia domínios externos.
6. **#6 skills: perguntar, nunca instalar/criar sem ordem** — e, pela extensão
   de 29 jul 2026, **propor por iniciativa própria** sempre que uma skill
   evitaria perder memória ou repetir passos, explicando as vantagens concretas.
7. **#7 README atualizado no mesmo trabalho, antes do commit** — entrada nova em
   §2 (o que estava mal, **porquê**, como ficou), secção estrutural afetada
   reescrita, data do cabeçalho atualizada.
8. **#8 nunca concordar por defeito** — a resposta começa pelo que eu penso,
   mesmo quando contraria o que ele disse. Objeções dizem-se **antes** de
   executar, ordens com que não concordo cumprem-se mas com o desacordo escrito,
   e premissas erradas corrigem-se primeiro. Discordar para parecer crítico é o
   mesmo erro ao contrário.

O tom que ele quer: português de Portugal, direto, sem entusiasmo de vendedor.
Quando eu me engano, corrijo por escrito antes de continuar — já aconteceu
propor uma solução e descobrir a meio que estava errada; dizê-lo é obrigatório.

## Editar ficheiros: o procedimento que funciona

**O problema.** Um heredoc no `device_bash` estraga acentos. Escrever
`histórico` acaba em `hist\udcc3\udcb3rico` no ficheiro. Como quase todo o
código deste repo tem comentários em português, isto atinge praticamente
qualquer edição.

**Ficheiro novo** — o caminho mais simples: `Write` na cloud →
`SendUserFile` → `device_commit_files` com o `file_uuid` e o caminho Windows.
Bytes idênticos, sem conversões.

**Editar ficheiro existente** — splice por base64:

1. `Write` do bloco novo num ficheiro na cloud (`/tmp/x.txt`).
2. `base64 -w0 /tmp/x.txt` na cloud e `md5sum` do original.
3. `Read` do `.b64` para o trazer para o contexto.
4. No dispositivo: `printf '%s' '<b64>' | base64 -d > /tmp/x.txt` e `md5sum`
   para confirmar que chegou igual. **Se passar de ~2000 bytes de base64**,
   `split -b 1900` na cloud, um `printf` por pedaço, `cat` a juntar no
   dispositivo, e só depois o `md5sum`.
5. Splice em Python no dispositivo, com `io.open(..., encoding="utf-8",
   newline="")` na leitura *e* na escrita.

O script de splice deve sempre: afirmar que **não há `\r`** no ficheiro, afirmar
que a âncora aparece **exatamente uma vez**, e afirmar que a alteração **ainda
não foi aplicada** (para ser seguro correr duas vezes). Sem estas três
afirmações, um splice silenciosamente errado é pior do que um erro.

```python
def rep(s, old, new):
    assert s.count(old) == 1, "ancora %d vezes: %r" % (s.count(old), old[:60])
    return s.replace(old, new)
```

**A armadilha do CRLF.** Três ficheiros aparecem como modificados no `git
status` sem terem alteração nenhuma real — só fins de linha:
`backend/prices.py`, `frontend/src/components/Layout.jsx`,
`frontend/src/components/Sparkline.jsx`. **Nunca os incluir num `git add`.**
Confirmar sempre com:

```bash
git diff --ignore-all-space --stat
```

Se um ficheiro aparece no `git status` mas não aqui, é ruído de CRLF.

**Apagar está proibido.** O `rm` no mount devolve "Operation not permitted".
Renomear para `.bak-*` ou `mv` para `_to_delete/`, e dizer ao Jose o que foi
movido para ele apagar à mão.

## Verificar antes de entregar

Nunca entregar uma edição sem a fazer passar por um parser. É rápido e apanha
o erro antes do deploy:

```bash
# Python
python3 -c "import ast,io; ast.parse(io.open('backend/routes/x.py',encoding='utf-8').read()); print('OK')"

# JSX — o @babel/parser já está em frontend/node_modules
cd frontend && node -e "
const p=require('@babel/parser'),fs=require('fs');
p.parse(fs.readFileSync('src/pages/Dashboard.jsx','utf8'),
        {sourceType:'module',plugins:['jsx','classProperties','optionalChaining','nullishCoalescingOperator']});
console.log('OK');"
```

O `eslint` está instalado mas não tem `eslint.config.js` (v9), por isso falha
sozinho — não vale a pena insistir. `esbuild` não está disponível.

## Git

O git do meu lado só serve para **ler** (`log`, `status`, `diff`). Escrever
falha: o `.git/index.lock` não se consegue remover e o `push` devolve `403 from
proxy`. Quem faz o commit é o Jose, no PowerShell, e o bloco entregue começa
**sempre** pela limpeza dos locks:

```powershell
cd C:\Users\bruno\Desktop\APPS\Wallet76
Get-ChildItem -Path .git -Recurse -Filter *.lock -Force | Remove-Item -Force
git add <ficheiros, um a um — nunca "git add .">
git commit -m "..."
git push
```

Listar os ficheiros um a um não é preciosismo: é o que impede os três ficheiros
de CRLF e os `.bak-*` de entrarem no commit.

## Diagnosticar lentidão — o método que dá resposta

Não adivinhar pelo código. Medir, por esta ordem:

**1. Onde vai o tempo, no cliente.** Com o separador dele já autenticado
(Chrome MCP), recarregar e ler:

```js
performance.getEntriesByType('resource')
  .filter(r => r.name.includes('/api/'))
  .map(r => [r.name.split('/api/')[1], Math.round(r.startTime), Math.round(r.duration)])
```

Ler o resultado como uma escada: se tudo parte no mesmo milissegundo e chega
espaçado, o servidor está a servir em fila. Um `/ping` lento **no meio da
rajada** é a prova de que o event loop está bloqueado — ou seja, é CPU, não
rede.

**2. Porquê, no servidor.** Logs do Render, pela caixa de pesquisa da própria
página (clicar ~(700, 49), escrever, Enter — o URL ganha `&q=`). Extrair texto
da página por `javascript_tool` vem bloqueado; usar capturas de ecrã.

**3. O contexto que explica quase tudo.** 0,5 CPU. O `asyncio.to_thread` **não**
resolve parsing de pandas/yfinance, porque o GIL fica seguro na thread — 44
ativos "em paralelo" correm quase em fila. E a memória: já houve
`Ran out of memory (used over 512MB)` várias vezes; a cache LRU limita o
**número** de entradas (`MAX_CACHE_ENTRIES = 3000` em `backend/core.py`), não o
tamanho, e uma entrada `retro_closes` é uma série diária inteira.

**Onde o tempo costuma estar.** `/history` (`routes/portfolio.py`:
`_build_retro_history`, `_build_retro_history_intraday`) faz fan-out sem limite
de concorrência por todos os ativos; as janelas de download estão em
`routes/news.py` (`_INTRADAY`, `_RESAMPLE`, `_CG_DAYS`) e todos os caminhos
cortam em `N_BARS = 70` — pedir janelas maiores do que isso é trabalho puro para
o pandas. `/portfolio`, `/sparklines` e `/prices/live` são os outros pesados.

## Coisas que não se repetem

- **Não fazer pedidos de teste a `POST /auth/login` com a app dele aberta.** Um
  401 dispara o interceptor do axios e põe-no fora da sessão. Já aconteceu uma
  vez; prometi que não voltava a acontecer.
- **Nunca `grep -r` dentro de `backend/` sem excluir `venv/`** — estoura o
  limite de 45 s do `device_bash`. Apontar ao ficheiro concreto.
- **Cópias em `/mnt/user-data/uploads/` ficam desatualizadas.** A verdade está
  no dispositivo; confirmar lá antes de raciocinar sobre o conteúdo.
- **Processos em segundo plano não sobrevivem entre chamadas `device_bash`.**
  Um `pgrep -f` na chamada seguinte não prova nada.
- **`backend/.env` tem segredos reais** (MongoDB com credenciais, `JWT_SECRET`,
  Resend, Stripe, `BROKER_ENCRYPTION_KEY`). Não imprimir, não transcrever, não
  enviar. Quando precisar de confirmar uma variável no painel do Render, pedir
  só presença/prefixo/domínio.
- **Afirmações sobre números querem prova.** Já afirmei "~100 MB por import
  lazy de pandas" sem medir e estava errado. Se não medi, digo que não medi.

## Fechar um trabalho

1. `git diff --ignore-all-space --stat` — confirmar que só lá está o que devia.
2. Parser a passar nos ficheiros tocados.
3. README: entrada em §2 + secção estrutural + data do cabeçalho (REGRA #7).
4. Se saiu uma lição do tipo "nunca mais assim", vira REGRA nova no `CLAUDE.md`.
5. Entregar o bloco PowerShell com os ficheiros listados um a um.
6. Dizer o que ficou por fazer e porquê — o backlog vive no
   `Wallet76_NEGOCIO.md` e as pendências técnicas no fim do README.

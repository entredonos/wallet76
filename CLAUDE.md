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

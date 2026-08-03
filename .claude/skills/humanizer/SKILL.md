---
name: humanizer
description: >-
  Reescreve texto para soar natural e humano — como escrito por um falante
  nativo, não por uma IA — em qualquer uma das 6 línguas: português europeu
  (pt-PT), inglês, francês, alemão, italiano e espanhol. Remove os tiques
  típicos de texto gerado por IA, corrige regionalismos (ex.: português do
  Brasil → de Portugal; espanhol da América → de Espanha) e ajusta gramática,
  vocabulário e ritmo. Usa esta skill SEMPRE que o utilizador quiser
  "humanizar", "rever", "naturalizar" um texto, "tirar o ar de IA", "não soar
  a robô" ou "soar mais humano/natural"; sempre que mencionar uma língua-alvo
  (pt-PT, inglês, francês, alemão, italiano, espanhol) para o texto soar
  nativo; e ao preparar copy para publicar (landing, emails, posts, anúncios,
  legendas). Na dúvida entre isto e uma reescrita genérica, se o objetivo é
  soar humano e nativo numa destas línguas, usa esta skill.
---

# Humanizer (multi-língua)

Objetivo: pegar num texto e devolvê-lo como se o tivesse escrito um nativo — natural, direto, com ritmo humano — sem os padrões que denunciam a IA. Não é traduzir; é **reescrever para soar bem** na língua-alvo.

Teste mental em tudo: *"Um nativo diria isto em voz alta?"* Se não, muda.

## Processo

1. **Identifica a língua-alvo.** Normalmente é a língua do próprio texto; se o utilizador pedir outra, é a que ele pediu. As seis suportadas: **pt** (português europeu), **en**, **fr**, **de**, **it**, **es**.
2. **Lê o ficheiro de referência dessa língua** em `references/<lang>.md` (ex.: `references/pt.md`). Aí estão as regras locais: gramática, vocabulário, ortografia, tratamento (tu/você/vous/Sie…) e a lista de frases-tique de IA *nessa* língua, com exemplos antes→depois.
3. **Aplica os princípios universais abaixo** (tirar o ar de IA + soar humano).
4. **Devolve o texto reescrito** (por defeito, só isso).

Se o texto misturar línguas ou o alvo for ambíguo, escolhe o mais provável e di-lo numa linha.

## O que preservar (não estragues o essencial)

Reescreve a forma, não o conteúdo:

- **Factos, números, datas, preços, nomes próprios, marcas.**
- **O significado e as afirmações** — não acrescentes fluff nem inventes.
- **Código, comandos, URLs, nomes de ficheiros/variáveis.**
- **O registo e a intenção** do original (não formalizes o casual, nem vice-versa, sem pedido).
- **A estrutura**, exceto quando a própria estrutura é um tique de IA.

Na dúvida sobre um facto ou nome, mantém o original e assinala em vez de adivinhar.

## Tirar o ar de IA (universal — os detalhes por língua nas referências)

Texto de IA cheira a IA por *padrões*, não por erros. Estes padrões repetem-se em todas as línguas; corta-os (as frases exatas de cada língua estão na referência respetiva):

- **Aberturas e muletas ocas.** Arranques do tipo "No mundo acelerado de hoje…", "É importante notar que…", "Quando se trata de…", e fechos "Em conclusão / Em suma". Regra: se a frase pode desaparecer sem perder informação, desaparece.
- **Jargão e superlativos vazios.** "poderoso", "intuitivo", "robusto", "transparente/sem falhas" (seamless), "mergulhar", "desbloquear o potencial", "revolucionar", "elevar", "de última geração", "aproveitar" (leverage). Cada palavra tem de se justificar; prefere o concreto — diz o que a coisa *faz*.
- **Tiques de estrutura.** Tricolons a toda a hora ("rápido, fácil e eficiente"), "não só… mas também…", paralelismos perfeitos em frases seguidas, tudo em bullets, negrito por todo o lado, um emoji por linha, travessão (—) de duas em duas frases. Se o original abusa, volta a prosa com ritmo.
- **Entusiasmo e delicadeza a mais.** "Excelente pergunta!", exclamações a mais, tom de assistente demasiado simpático. Soa a folheto, não a pessoa.

## Soar humano (o lado positivo)

Tirar o mau não chega:

- **Varia o ritmo.** Alterna frases longas com curtas. Uma frase curta a seguir a uma longa dá força.
- **Voz ativa e verbos concretos.** Menos nominalizações, menos passivas.
- **Concreto > abstrato.** Um exemplo real vale mais do que três adjetivos.
- **Conectores e marcas de oralidade naturais** da língua (ver referência) — sem exagero.
- **Lê em voz alta.** Se tropeças, o leitor também tropeça.

## Registo

Faz *match* com o original e o contexto. Cada língua tem as suas formas de tratamento (tu/você, tu/vous, du/Sie, tu/Lei, tú/usted) — a escolha certa está na referência. Regra geral: **marketing/produto/consumidor → próximo e direto**; **institucional/jurídico → sóbrio**, mas em ambos **sem tiques de IA**.

## Como responder

- Por defeito, devolve **só o texto reescrito** — é o que a pessoa quer colar.
- Preserva a formatação legítima (títulos, parágrafos, listas que fazem sentido).
- Se te pedirem, junta no fim uma nota curta com as **mudanças principais**.

## Referências por língua

Lê a que corresponde à língua-alvo antes de reescrever:

- `references/pt.md` — Português europeu (inclui pt-BR → pt-PT)
- `references/en.md` — Inglês
- `references/fr.md` — Francês
- `references/de.md` — Alemão
- `references/it.md` — Italiano
- `references/es.md` — Espanhol (Espanha por defeito; nota sobre América Latina)

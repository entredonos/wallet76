// Topo do funil: os dois eventos de quem ainda não tem conta (5 ago 2026).
//
// O funil do admin começava no registo, e faltava-lhe o princípio da história:
// quantas pessoas chegaram à landing e quantas chegaram a carregar num botão
// que leva ao registo. Sem isso não se sabe se o problema é ninguém aparecer
// ou aparecer e não entrar — que são doenças diferentes com remédios
// diferentes.
//
// O que NÃO se guarda, de propósito: nenhum identificador do visitante. Sem
// cookie, sem id, sem IP. O servidor recebe «alguém viu a landing» e mais
// nada. A repetição é travada aqui, no browser, com sessionStorage: uma
// contagem por separador aberto, e desaparece quando ele fecha. Por isso os
// números do admin são «visitas», não «visitantes únicos» — e o rótulo lá
// diz isso.
//
// Best-effort em tudo: se o pedido falhar ou o sessionStorage estiver
// bloqueado (Safari privado), o clique do utilizador segue na mesma. Nunca
// se trava a app por causa de uma contagem.

import { api } from "./api";

const PREFIXO = "w76-anon-";

export function trackAnon(event) {
  try {
    const chave = PREFIXO + event;
    if (sessionStorage.getItem(chave)) return;
    sessionStorage.setItem(chave, "1");
  } catch (_e) {
    // Sem sessionStorage não há como evitar repetir. Mais vale contar duas
    // vezes do que não contar — o número serve para comparar dias, não para
    // auditoria.
  }
  api.post("/events/anon", { event }).catch(() => {});
}

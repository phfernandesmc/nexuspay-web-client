/**
 * Serializacao de renovacao ENTRE ABAS.
 *
 * A fila unica de `lib/http.ts` e uma variavel de modulo, e modulo e por
 * aba: ela impede dois `/auth/refresh` concorrentes dentro de uma aba, e
 * nada mais. Duas abas abertas, restaurar a sessao do navegador, duplicar a
 * aba ou dois cliques rapidos produzem dois refresh genuinamente
 * concorrentes com o MESMO cookie — o primeiro rotaciona, o segundo
 * apresenta um token ja gasto, e o gateway revoga TODAS as sessoes do
 * usuario, em todos os dispositivos.
 *
 * A Web Locks API e por origem, nao por aba, e e o que fecha esse buraco.
 * Nao e preciso compartilhar o token entre abas: a rotacao sequencial e
 * valida, e a aba que esperou simplesmente pega o token seguinte.
 */
export const NOME_DA_TRAVA = "nexuspay-refresh";

export async function comTrava<T>(fn: () => Promise<T>): Promise<T> {
  // O caminho direto e obrigatorio, nao defensivo: o jsdom dos testes nao
  // implementa a Web Locks API, e ela tambem nao existe em contexto
  // inseguro. Sem sair de perto, a fila unica de dentro da aba continua
  // valendo — perde-se so a coordenacao entre abas.
  if (typeof navigator === "undefined" || !navigator.locks) return fn();
  return navigator.locks.request(NOME_DA_TRAVA, fn);
}

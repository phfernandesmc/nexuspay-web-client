import type { Conta } from "@/features/account/types";
import type { ItemExtrato, PaginaExtrato } from "@/features/statement/types";

/** Um item do extrato sabendo de qual conta do usuario ele veio. */
export type ItemRecente = ItemExtrato & { conta: Conta };

export type ExtratoDaConta = { conta: Conta; pagina: PaginaExtrato };

/**
 * As transacoes mais recentes entre TODAS as contas.
 *
 * O extrato do gateway e por conta, entao a atividade global e montada
 * aqui. Pedir as N mais recentes de cada conta e ficar com as N mais novas
 * da uniao da o resultado certo: uma transacao entre as N mais recentes no
 * geral e, necessariamente, uma das N mais recentes da propria conta.
 *
 * Cada item carrega a conta de onde veio. Sem isso, duas transferencias de
 * mesmo valor em contas diferentes ficam indistinguiveis na home, que e o
 * unico lugar onde varios extratos aparecem misturados.
 *
 * Ordena por created_at e nao pela ordem de chegada das respostas: as
 * requisicoes sao paralelas e respondem fora de ordem.
 */
export function juntarRecentes(
  extratos: ExtratoDaConta[],
  limite: number,
): ItemRecente[] {
  return extratos
    .flatMap(({ conta, pagina }) => pagina.items.map((item) => ({ ...item, conta })))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, limite);
}

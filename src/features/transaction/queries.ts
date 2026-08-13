import { useQuery } from "@tanstack/react-query";
import { buscarTransacao } from "@/features/transaction/api";
import { CHAVES } from "@/features/account/queries";
import { MOTIVOS_DE_FALHA } from "@/features/transaction/types";

export function useTransacao(id: string) {
  return useQuery({
    queryKey: CHAVES.transacao(id),
    queryFn: () => buscarTransacao(id),
  });
}

const motivosConhecidos = new Set<string>(MOTIVOS_DE_FALHA);

/**
 * O codigo pronto para o t(..., { ns: "errors" }).
 *
 * failure_reason e um conjunto FECHADO de tres valores no enum do worker,
 * mas nada impede o worker de ganhar um quarto antes do frontend. Um valor
 * fora da lista cai em UNKNOWN em vez de virar chave crua na tela.
 */
export function motivoTraduzivel(motivo: string | null): string {
  if (motivo !== null && motivosConhecidos.has(motivo)) return motivo;
  if (motivo !== null) {
    console.warn(
      `[nexuspay] failure_reason desconhecido vindo do worker: ${motivo}. ` +
        `Acrescente-o a MOTIVOS_DE_FALHA, a CODIGOS_DE_ERRO e aos dois dicionarios.`,
    );
  }
  return "UNKNOWN";
}

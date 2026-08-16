import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buscarTransacao, depositar, transferir } from "@/features/transaction/api";
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

/**
 * Depois de mover dinheiro, tudo que depende de conta esta velho: a lista,
 * o saldo do detalhe, o extrato e a soma de pendentes. Invalidar so a lista
 * deixaria o extrato mostrando o estado anterior.
 */
function invalidarTudoDeConta(qc: ReturnType<typeof useQueryClient>, contaId: string) {
  void qc.invalidateQueries({ queryKey: CHAVES.contas() });
  void qc.invalidateQueries({ queryKey: CHAVES.conta(contaId) });
  void qc.invalidateQueries({ queryKey: CHAVES.extrato(contaId) });
  void qc.invalidateQueries({ queryKey: CHAVES.extratoPendentes(contaId) });
}

export function useDepositar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      entrada,
      chave,
    }: {
      entrada: { account_id: string; amount: string };
      chave: string;
    }) => depositar(entrada, chave),
    onSuccess: (_resposta, variaveis) => {
      invalidarTudoDeConta(qc, variaveis.entrada.account_id);
    },
  });
}

export function useTransferir() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      entrada,
      chave,
    }: {
      entrada: { source_account_id: string; destination_account_id: string; amount: string };
      chave: string;
    }) => transferir(entrada, chave),
    onSuccess: (_resposta, variaveis) => {
      invalidarTudoDeConta(qc, variaveis.entrada.source_account_id);
    },
  });
}

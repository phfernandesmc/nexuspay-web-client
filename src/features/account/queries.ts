import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { abrirConta, buscarConta, listarContas, listarInstituicoes } from "@/features/account/api";

/**
 * As chaves de cache do projeto inteiro, em um lugar so.
 *
 * A invalidacao depende delas casarem exatamente. Chave escrita a mao no
 * ponto de uso e como um saldo velho fica na tela: nada quebra, o numero
 * so para de atualizar.
 */
export const CHAVES = {
  contas: () => ["contas"] as const,
  conta: (id: string) => ["conta", id] as const,
  extrato: (contaId: string) => ["extrato", contaId] as const,
  extratoPendentes: (contaId: string) => ["extrato-pendentes", contaId] as const,
  instituicoes: () => ["instituicoes"] as const,
};

export function useContas() {
  return useQuery({ queryKey: CHAVES.contas(), queryFn: listarContas });
}

export function useConta(id: string) {
  return useQuery({ queryKey: CHAVES.conta(id), queryFn: () => buscarConta(id) });
}

export function useInstituicoes() {
  return useQuery({
    queryKey: CHAVES.instituicoes(),
    queryFn: listarInstituicoes,
    // O catalogo praticamente nao muda; buscar a cada montagem seria
    // requisicao desperdicada em toda abertura do dialogo.
    staleTime: 60 * 60 * 1000,
  });
}

export function useAbrirConta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: abrirConta,
    // Regra do projeto: toda operacao que muda conta invalida a lista.
    // Esquecer esta linha nao quebra nada — so deixa a tela mostrando o
    // estado anterior, que e o defeito que ninguem nota.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVES.contas() });
    },
  });
}

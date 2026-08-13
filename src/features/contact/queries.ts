import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  atualizarContato,
  buscarContaPorDados,
  listarContatos,
  removerContato,
  salvarContato,
} from "@/features/contact/api";
import { CHAVES } from "@/features/account/queries";

export function useBuscarConta() {
  return useMutation({ mutationFn: buscarContaPorDados });
}

export function useSalvarContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: salvarContato,
    // Sem esta linha o contato e criado no servidor e a lista na tela
    // continua a antiga — o defeito que nao quebra nada.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVES.contatos() });
    },
  });
}

export function useContatos() {
  return useQuery({ queryKey: CHAVES.contatos(), queryFn: listarContatos });
}

function invalidarContatos(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: CHAVES.contatos() });
}

export function useAtualizarContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      mudanca,
    }: {
      id: string;
      mudanca: { alias?: string; is_favorite?: boolean };
    }) => atualizarContato(id, mudanca),
    onSuccess: () => invalidarContatos(qc),
  });
}

export function useRemoverContato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: removerContato,
    onSuccess: () => invalidarContatos(qc),
  });
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { buscarContaPorDados, salvarContato } from "@/features/contact/api";
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

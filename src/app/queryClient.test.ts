import { describe, it, expect } from "vitest";
import { criarQueryClient } from "@/app/queryClient";

describe("queryClient", () => {
  it("nao busca sozinho ao voltar para a aba", () => {
    // Decisao do dono: nada atualiza sem acao explicita. Este teste existe
    // para que ligar refetchOnWindowFocus por engano quebre a suite.
    const cliente = criarQueryClient();
    expect(cliente.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });

  it("nao repete requisicao que falhou", () => {
    // O cliente HTTP ja renova a sessao sozinho; repetir por cima disso
    // multiplicaria chamadas num 500 e esconderia a falha do usuario.
    const cliente = criarQueryClient();
    expect(cliente.getDefaultOptions().queries?.retry).toBe(false);
  });

  it("cada chamada devolve um cliente novo", () => {
    // Testes precisam de cache isolado; um cliente compartilhado faria um
    // teste enxergar o cache do outro.
    expect(criarQueryClient()).not.toBe(criarQueryClient());
  });
});

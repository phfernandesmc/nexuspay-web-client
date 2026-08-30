import { describe, it, expect } from "vitest";
import { juntarRecentes } from "@/features/statement/recentes";
import type { ItemExtrato, PaginaExtrato } from "@/features/statement/types";
import type { Conta } from "@/features/account/types";

function conta(id: string, apelido: string): Conta {
  return {
    id,
    branch: "0001",
    number: `${id}-0`,
    alias: apelido,
    type: "CHECKING",
    balance: "0.00",
    pending_outgoing: "0.00",
    status: "ACTIVE",
    institution: {
      id: "inst-1",
      code: "NUBANK",
      name: "Nubank",
      color_hex: "#820AD1",
    },
    created_at: "2026-03-09T14:30:00Z",
  };
}

function item(id: string, quando: string): ItemExtrato {
  return {
    id,
    type: "TRANSFER",
    direction: "OUT",
    amount: "10.00",
    status: "COMPLETED",
    is_between_own_accounts: false,
    counterparty: null,
    created_at: quando,
  };
}

function pagina(...itens: ItemExtrato[]): PaginaExtrato {
  return { items: itens, next_cursor: null };
}

describe("atividade recente", () => {
  it("junta contas diferentes e devolve as mais recentes no geral", () => {
    // O defeito que este teste existe para pegar: ficar com as mais recentes
    // de UMA conta. Aqui a conta B tem a transacao mais nova de todas, e a
    // conta A tem a segunda — um resultado que so olhe para a primeira lista
    // devolveria a3 e a2, que nao sao as duas mais novas.
    const a = { conta: conta("ca", "Salario"), pagina: pagina(item("a1", "2026-08-10T10:00:00Z"), item("a2", "2026-08-01T10:00:00Z")) };
    const b = { conta: conta("cb", "Reserva"), pagina: pagina(item("b1", "2026-08-20T10:00:00Z"), item("b2", "2026-08-05T10:00:00Z")) };

    const resultado = juntarRecentes([a, b], 3);

    expect(resultado.map((i) => i.id)).toEqual(["b1", "a1", "b2"]);
  });

  it("respeita o limite", () => {
    const paginaX = pagina(
      item("x1", "2026-08-03T10:00:00Z"),
      item("x2", "2026-08-02T10:00:00Z"),
      item("x3", "2026-08-01T10:00:00Z"),
    );

    expect(juntarRecentes([{ conta: conta("cx", "X"), pagina: paginaX }], 2)).toHaveLength(2);
  });

  it("ignora contas sem movimento", () => {
    // Conta recem-aberta nao pode zerar a atividade das outras.
    const vazia = { conta: conta("cv", "Vazia"), pagina: pagina() };
    const comMovimento = { conta: conta("cm", "Com"), pagina: pagina(item("y1", "2026-08-01T10:00:00Z")) };

    expect(juntarRecentes([vazia, comMovimento], 5).map((i) => i.id)).toEqual(["y1"]);
  });

  it("anexa a cada item a conta de onde ele veio", () => {
    // As requisicoes sao paralelas. Associar a resposta errada a conta
    // errada nao quebra nada visivel: a linha so passa a exibir o banco e o
    // apelido de outra conta, o que ninguem contesta olhando a tela.
    const a = { conta: conta("ca", "Salario"), pagina: pagina(item("a1", "2026-08-10T10:00:00Z")) };
    const b = { conta: conta("cb", "Reserva"), pagina: pagina(item("b1", "2026-08-20T10:00:00Z")) };

    const porId = Object.fromEntries(
      juntarRecentes([a, b], 5).map((i) => [i.id, i.conta.alias]),
    );

    expect(porId).toEqual({ a1: "Salario", b1: "Reserva" });
  });
});

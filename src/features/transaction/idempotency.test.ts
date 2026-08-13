import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChaveDeIntencao } from "@/features/transaction/idempotency";

describe("chave de intencao", () => {
  it("devolve a MESMA chave enquanto o payload nao muda", () => {
    // Este e o teste que protege contra a transferencia duplicada: se a
    // chave mudasse a cada render, um clique duplo criaria duas transacoes.
    const { result, rerender } = renderHook(
      ({ p }) => useChaveDeIntencao(p),
      { initialProps: { p: { conta: "a", valor: "10.00" } } },
    );
    const primeira = result.current.chave;

    rerender({ p: { conta: "a", valor: "10.00" } });

    expect(result.current.chave).toBe(primeira);
  });

  it("gera chave NOVA quando qualquer campo muda", () => {
    const { result, rerender } = renderHook(
      ({ p }) => useChaveDeIntencao(p),
      { initialProps: { p: { conta: "a", valor: "10.00" } } },
    );
    const primeira = result.current.chave;

    rerender({ p: { conta: "a", valor: "10.01" } });

    expect(result.current.chave).not.toBe(primeira);
  });

  it("limpar gera chave nova para o mesmo payload", () => {
    // Depois do sucesso a intencao acabou. Reusar a chave faria o proximo
    // envio identico ser tratado como reenvio, e o gateway devolveria a
    // transacao antiga em vez de mandar dinheiro de novo.
    const { result } = renderHook(() => useChaveDeIntencao({ conta: "a", valor: "10.00" }));
    const primeira = result.current.chave;

    act(() => result.current.limparChave());

    expect(result.current.chave).not.toBe(primeira);
  });

  it("a chave e um UUID", () => {
    const { result } = renderHook(() => useChaveDeIntencao({ conta: "a" }));
    expect(result.current.chave).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("ordem diferente das mesmas chaves NAO muda a intencao", () => {
    // Um objeto com as mesmas entradas em ordem diferente e o mesmo payload.
    // Sem ordenacao, JSON.stringify daria strings diferentes e a chave
    // trocaria sem o usuario ter mudado nada.
    const { result, rerender } = renderHook(
      ({ p }) => useChaveDeIntencao(p),
      { initialProps: { p: { a: "1", b: "2" } as Record<string, string> } },
    );
    const primeira = result.current.chave;

    rerender({ p: { b: "2", a: "1" } });

    expect(result.current.chave).toBe(primeira);
  });
});

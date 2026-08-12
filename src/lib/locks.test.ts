import { describe, it, expect, afterEach } from "vitest";
import { comTrava, NOME_DA_TRAVA } from "@/lib/locks";

/**
 * O jsdom NAO implementa a Web Locks API, entao os dois caminhos precisam de
 * tratamento diferente aqui: o de ausencia e o real do ambiente de teste, e
 * o de presenca so existe com um dublê. A prova de verdade — duas ABAS
 * disputando o mesmo cookie — exige Playwright e esta registrada como
 * cobertura ausente nos follow-ups.
 */

function definirLocks(valor: unknown) {
  Object.defineProperty(navigator, "locks", { value: valor, configurable: true });
}

/** Dublê que serializa de verdade, como a Web Locks API faz. */
function travaFalsa() {
  const nomes: string[] = [];
  let cauda: Promise<unknown> = Promise.resolve();
  return {
    nomes,
    manager: {
      request<T>(nome: string, cb: () => Promise<T>): Promise<T> {
        nomes.push(nome);
        const resultado = cauda.then(() => cb());
        cauda = resultado.catch(() => undefined);
        return resultado;
      },
    },
  };
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "locks");
});

describe("comTrava", () => {
  it("sem navigator.locks executa direto, sem travar para sempre", async () => {
    // Este caminho e obrigatorio, nao defensivo: sem ele a suite inteira de
    // testes — e qualquer navegador sem a API ou em contexto inseguro —
    // ficaria sem renovacao de sessao.
    definirLocks(undefined);

    await expect(comTrava(async () => "renovado")).resolves.toBe("renovado");
  });

  it("com navigator.locks pede a trava pelo nome combinado", async () => {
    // O nome precisa ser o MESMO nas duas entradas de refresh (o interceptor
    // e o boot), senao as abas se coordenam em filas separadas e o buraco
    // continua aberto.
    const falsa = travaFalsa();
    definirLocks(falsa.manager);

    await comTrava(async () => "renovado");

    expect(falsa.nomes).toEqual([NOME_DA_TRAVA]);
  });

  it("serializa chamadas concorrentes: a segunda so comeca quando a primeira termina", async () => {
    // Este e o defeito que a trava existe para fechar. Duas abas rodam
    // modulos separados, entao a fila unica de lib/http.ts nao as ve: as
    // duas apresentam o mesmo cookie, a segunda apresenta um token ja
    // rotacionado, e o gateway revoga TODAS as sessoes do usuario.
    const falsa = travaFalsa();
    definirLocks(falsa.manager);
    const eventos: string[] = [];

    const primeira = comTrava(async () => {
      eventos.push("comeca-1");
      await new Promise((r) => setTimeout(r, 20));
      eventos.push("termina-1");
    });
    const segunda = comTrava(async () => {
      eventos.push("comeca-2");
      eventos.push("termina-2");
    });

    await Promise.all([primeira, segunda]);

    expect(eventos).toEqual(["comeca-1", "termina-1", "comeca-2", "termina-2"]);
  });

  it("uma renovacao que falha libera a trava para a proxima", async () => {
    // Se a rejeicao prendesse a fila, uma falha de rede numa aba deixaria
    // todas as outras sem conseguir renovar ate o recarregamento.
    const falsa = travaFalsa();
    definirLocks(falsa.manager);

    await expect(
      comTrava(async () => {
        throw new Error("refresh falhou");
      }),
    ).rejects.toThrow("refresh falhou");

    await expect(comTrava(async () => "depois")).resolves.toBe("depois");
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import i18n from "@/app/i18n";
import {
  CODIGOS_DE_ERRO,
  extrairErro,
  chaveDeTraducao,
  camposInvalidos,
} from "@/lib/errors";

function erroAxios(status: number, corpo: unknown): AxiosError {
  const erro = new AxiosError("falhou");
  erro.response = {
    status,
    statusText: "",
    data: corpo,
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
  return erro;
}

afterEach(() => vi.restoreAllMocks());

describe("catalogo de erro", () => {
  it("todo codigo tem traducao nos DOIS idiomas", () => {
    const semTraducao: string[] = [];
    for (const idioma of ["pt-BR", "en"]) {
      for (const codigo of CODIGOS_DE_ERRO) {
        // fallbackLng: false e obrigatorio aqui. O i18n de producao tem
        // fallbackLng: "pt-BR" (de proposito — o dominio e brasileiro), o
        // que faz getFixedT("en", ...) devolver silenciosamente o texto em
        // pt-BR quando falta a chave em en. Sem desligar o fallback, este
        // teste nunca acusa uma chave faltando em en — ele so pegaria uma
        // chave faltando em pt-BR (o fallback final, que devolve a propria
        // chave crua).
        const texto = i18n.getFixedT(idioma, "errors")(codigo, { fallbackLng: false });
        if (!texto || texto === codigo) semTraducao.push(`${idioma}:${codigo}`);
      }
    }
    expect(semTraducao).toEqual([]);
  });

  it("cobre os codigos que nascem nos handlers genericos do gateway", () => {
    // Estes tres nao vem de uma classe de excecao e sao os mais faceis de
    // esquecer — e aparecem justamente quando algo quebrou de verdade.
    expect(CODIGOS_DE_ERRO).toContain("NOT_FOUND");
    expect(CODIGOS_DE_ERRO).toContain("METHOD_NOT_ALLOWED");
    expect(CODIGOS_DE_ERRO).toContain("INTERNAL_ERROR");
  });

  it("tem 29 codigos", () => {
    expect(CODIGOS_DE_ERRO).toHaveLength(29);
  });
});

describe("extrairErro", () => {
  it("le o envelope do gateway", () => {
    const erro = extrairErro(
      erroAxios(422, { error: { code: "WEAK_PASSWORD", message: "x", details: {} } }),
    );
    expect(erro.code).toBe("WEAK_PASSWORD");
  });

  it("falha de rede vira NETWORK_ERROR em vez de estourar", () => {
    expect(extrairErro(new AxiosError("Network Error")).code).toBe("NETWORK_ERROR");
  });

  it("resposta fora do formato do envelope nao quebra", () => {
    expect(extrairErro(erroAxios(500, "<html>oops</html>")).code).toBe("INTERNAL_ERROR");
  });

  it("valor que nem e erro do axios nao quebra", () => {
    expect(extrairErro("qualquer coisa").code).toBe("INTERNAL_ERROR");
  });
});

describe("chaveDeTraducao", () => {
  it("devolve a chave do codigo conhecido", () => {
    expect(chaveDeTraducao("INVALID_CREDENTIALS")).toBe("errors.INVALID_CREDENTIALS");
  });

  it("codigo desconhecido cai no generico E vai para o console", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(chaveDeTraducao("CODIGO_QUE_NAO_EXISTE")).toBe("errors.UNKNOWN");
    // A divergencia entre gateway e cliente precisa APARECER, nao virar um
    // texto vago que ninguem investiga.
    expect(aviso).toHaveBeenCalledOnce();
  });
});

describe("camposInvalidos", () => {
  it("le details.fields do VALIDATION_ERROR", () => {
    const erro = extrairErro(
      erroAxios(422, {
        error: {
          code: "VALIDATION_ERROR",
          message: "x",
          details: { fields: [{ field: "email", reason: "invalido" }] },
        },
      }),
    );
    expect(camposInvalidos(erro)).toEqual([{ field: "email", reason: "invalido" }]);
  });

  it("devolve lista vazia quando nao ha details.fields", () => {
    const erro = extrairErro(
      erroAxios(401, { error: { code: "INVALID_CREDENTIALS", message: "x", details: {} } }),
    );
    expect(camposInvalidos(erro)).toEqual([]);
  });
});

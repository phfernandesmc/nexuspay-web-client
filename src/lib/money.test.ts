import { describe, it, expect } from "vitest";
import { paraCentavos, somarCentavos, formatarDinheiro, centavosDeDigitos, centavosParaDecimal } from "@/lib/money";

describe("paraCentavos", () => {
  it("aceita string, que e como o Pydantic costuma serializar Decimal", () => {
    expect(paraCentavos("1234.56")).toBe(123456);
    expect(paraCentavos("0.01")).toBe(1);
    expect(paraCentavos("100")).toBe(10000);
    expect(paraCentavos("100.5")).toBe(10050);
  });

  it("aceita numero, que e como algumas versoes do Pydantic serializam", () => {
    expect(paraCentavos(1234.56)).toBe(123456);
    expect(paraCentavos(0.1)).toBe(10);
  });

  it("aceita negativo", () => {
    expect(paraCentavos("-50.00")).toBe(-5000);
  });

  it("falha alto em qualquer outra coisa", () => {
    // Silenciar aqui produziria um total errado na tela sem nenhum sinal.
    expect(() => paraCentavos("abc")).toThrow();
    expect(() => paraCentavos("")).toThrow();
    expect(() => paraCentavos("1.234")).toThrow();
  });

  it("rejeita numero com mais de duas casas decimais, nao arredonda em silencio", () => {
    // Simetria com a string: "1.234" ja lanca acima. O caminho numerico
    // tem que se comportar igual, senao o mesmo valor lanca vindo como
    // string e passa silenciosamente vindo como numero.
    expect(() => paraCentavos(1.234)).toThrow();
  });

  it("rejeita o classico valor de fronteira que toFixed(2) arredonda errado", () => {
    // (1.005).toFixed(2) devolve "1.00", nao "1.01", por causa da
    // representacao binaria — perderia um centavo em silencio. Melhor
    // lancar do que devolver um valor errado sem nenhum sinal.
    expect(() => paraCentavos(1.005)).toThrow();
  });

  it("rejeita numero nao finito, com mensagem que diz a verdade em vez de 'null'", () => {
    // JSON.stringify(NaN) e JSON.stringify(Infinity)/(-Infinity) devolvem
    // "null" — o mesmo defeito nos tres casos —, o que enganaria quem for
    // depurar. So toThrow() nao discrimina: passaria mesmo com a mensagem
    // errada, entao a asercao verifica o texto da mensagem tambem.
    expect(() => paraCentavos(NaN)).toThrow(/NaN/);
    expect(() => paraCentavos(Infinity)).toThrow(/Infinity/);
    expect(() => paraCentavos(-Infinity)).toThrow(/-Infinity/);

    for (const valor of [NaN, Infinity, -Infinity]) {
      try {
        paraCentavos(valor);
        throw new Error("nao deveria chegar aqui");
      } catch (erro) {
        expect((erro as Error).message).not.toContain("null");
      }
    }
  });

  it("rejeita null e undefined com o erro proprio, nao com TypeError do runtime", () => {
    // A API pode entregar null/undefined apesar do tipo dizer string|number.
    // Sem tratamento, .trim() em null estoura um TypeError generico do
    // runtime em vez do erro proprio da funcao — a falha alta continua
    // acontecendo, mas a mensagem engana quem for depurar.
    // @ts-expect-error valor pode chegar null mesmo que o tipo nao permita
    expect(() => paraCentavos(null)).toThrow("valor monetario invalido");
    // @ts-expect-error valor pode chegar undefined mesmo que o tipo nao permita
    expect(() => paraCentavos(undefined)).toThrow("valor monetario invalido");
  });
});

describe("somarCentavos", () => {
  it("soma valores que quebram em ponto flutuante", () => {
    // 0.1 + 0.2 em ponto flutuante da 0.30000000000000004, e num total
    // visivel na tela isso aparece. Em centavos inteiros nao ha residuo.
    const total = somarCentavos([paraCentavos("0.10"), paraCentavos("0.20")]);
    expect(total).toBe(30);
    expect(formatarDinheiro(total, "pt-BR")).not.toContain("0000");
  });

  it("soma uma lista longa sem acumular erro", () => {
    const cem = Array.from({ length: 100 }, () => paraCentavos("0.07"));
    expect(somarCentavos(cem)).toBe(700);
  });

  it("lista vazia da zero", () => {
    expect(somarCentavos([])).toBe(0);
  });
});

describe("formatarDinheiro", () => {
  it("usa BRL mesmo em ingles", () => {
    // A moeda nao segue o idioma: o dinheiro e real em qualquer lingua.
    const emIngles = formatarDinheiro(120000, "en");
    expect(emIngles).toContain("R$");
    // O ICU deste Node nao coloca espaco entre "R$" e o numero em locale
    // "en" (sai "R$1,200.00"), entao um toContain("$1") ingenuo acusaria
    // falso positivo. O que importa e nao haver um "$" solto (de USD).
    expect(emIngles).not.toMatch(/(?<!R)\$/);
  });

  it("formata com o separador do locale", () => {
    expect(formatarDinheiro(123456, "pt-BR")).toContain("1.234,56");
    expect(formatarDinheiro(123456, "en")).toContain("1,234.56");
  });
});

describe("mascara de dinheiro", () => {
  it("le so os digitos e trata o ultimo par como centavos", () => {
    // O usuario digita da direita para a esquerda, como em caixa
    // eletronico: cada tecla empurra o valor uma casa.
    expect(centavosDeDigitos("1")).toBe(1);
    expect(centavosDeDigitos("100")).toBe(100);
    expect(centavosDeDigitos("5077")).toBe(5077);
    expect(centavosDeDigitos("100000")).toBe(100000);
  });

  it("ignora pontuacao, espaco e letra", () => {
    // Colar "R$ 1.000,00" precisa dar 100000 centavos, nao erro.
    expect(centavosDeDigitos("R$ 1.000,00")).toBe(100000);
    expect(centavosDeDigitos("  50,77  ")).toBe(5077);
  });

  it("campo vazio nao vira zero", () => {
    // Zero e um valor que o usuario pode ter escolhido; vazio e ausencia de
    // escolha. Confundir os dois habilitaria o envio de um formulario em
    // branco.
    expect(centavosDeDigitos("")).toBeNull();
    expect(centavosDeDigitos("abc")).toBeNull();
  });

  it("converte centavos para a string decimal que o gateway espera", () => {
    // Sem passar por ponto flutuante: (0.07).toFixed(2) e seguro, mas
    // dividir por 100 em cadeia nao e, e este e o valor que vai no payload.
    expect(centavosParaDecimal(7)).toBe("0.07");
    expect(centavosParaDecimal(5077)).toBe("50.77");
    expect(centavosParaDecimal(100000)).toBe("1000.00");
    expect(centavosParaDecimal(0)).toBe("0.00");
  });
});

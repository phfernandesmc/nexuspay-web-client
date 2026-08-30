import { describe, it, expect } from "vitest";
import { corLegivel } from "@/lib/cor";

/**
 * A formula do WCAG, reimplementada aqui de proposito.
 *
 * Usar a funcao de contraste do proprio modulo faria o teste concordar com
 * um erro dela — os dois estariam errados juntos e o teste passaria. Esta
 * copia e a segunda opiniao independente.
 */
function contraste(a: string, b: string): number {
  const luminancia = (hex: string) => {
    const canais = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, bl] = canais.map((c) =>
      c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

/** As cores REAIS do catalogo, como estao no banco. */
const CATALOGO = {
  BB: "#0038A8",
  BRADESCO: "#CC092F",
  CAIXA: "#0070AF",
  ITAU: "#EC7000",
  NUBANK: "#820AD1",
  SANTANDER: "#EC0000",
};

describe("cor de fundo legivel", () => {
  it.each(Object.entries(CATALOGO))(
    "branco sobre %s atinge o AA de texto normal",
    (_banco, cor) => {
      expect(contraste(corLegivel(cor), "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("nao mexe numa cor que ja passa", () => {
    // Escurecer o que ja esta bom afastaria o card da marca sem motivo.
    expect(corLegivel("#820AD1")).toBe("#820AD1");
  });

  it("escurece o laranja do Itau, que sozinho reprova", () => {
    // 3,05:1 com branco. E o unico dos seis que precisa de ajuste, e a
    // razao desta funcao existir.
    expect(corLegivel("#EC7000")).not.toBe("#EC7000");
  });
});

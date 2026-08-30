import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import StatementRow from "@/features/statement/StatementRow";
import type { ItemExtrato } from "@/features/statement/types";
import i18n from "@/app/i18n";

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
});

function item(direcao: "IN" | "OUT"): ItemExtrato {
  return {
    id: "t1",
    type: "TRANSFER",
    direction: direcao,
    amount: "10.00",
    status: "COMPLETED",
    is_between_own_accounts: false,
    counterparty: null,
    created_at: "2026-08-20T10:00:00Z",
  };
}

/**
 * A assercao e sobre a classe, e nao sobre a cor computada, porque o Vitest
 * roda com css:false — nenhum estilo do Tailwind e aplicado no jsdom, entao
 * getComputedStyle devolveria vazio para qualquer variante. E o unico
 * handle disponivel, e serve ao proposito: se alguem remover a coloracao,
 * o teste acusa.
 */
describe("linha do extrato", () => {
  it("entrada aparece em verde", () => {
    render(<StatementRow item={item("IN")} />);

    expect(screen.getByTestId("valor-t1").className).toContain("text-green");
  });

  it("saida aparece em vermelho, mas NAO no vermelho de erro", () => {
    // Entrada verde e saida vermelha e a convencao de app de banco, e vale
    // mais que o receio de confundir com falha. O que se preserva daquele
    // receio: o token DESTRUTIVO continua reservado a erros de verdade
    // (alertas, status FAILED). Sao dois vermelhos proximos e
    // deliberadamente diferentes — se alguem trocar por text-destructive,
    // "saiu dinheiro" e "deu problema" viram a mesma cor.
    const classes = render(<StatementRow item={item("OUT")} />).container.innerHTML;

    expect(screen.getByTestId("valor-t1").className).toContain("text-rose");
    expect(screen.getByTestId("valor-t1").className).not.toContain("text-green");
    expect(classes).not.toContain("text-destructive");
  });

  it("a seta acompanha a direcao do dinheiro", () => {
    // Reforca o que o sinal e a cor ja dizem, para quem varre a lista sem
    // ler. Nao acrescenta informacao nova: e por isso que o icone e
    // aria-hidden — anuncia-lo faria o leitor de tela repetir "saida" logo
    // antes de "-R$ 10,00".
    const { unmount } = render(<StatementRow item={item("IN")} />);
    expect(screen.getByTestId("direcao-IN")).toBeInTheDocument();
    expect(screen.queryByTestId("direcao-OUT")).toBeNull();
    unmount();

    render(<StatementRow item={item("OUT")} />);
    expect(screen.getByTestId("direcao-OUT")).toBeInTheDocument();
  });
});

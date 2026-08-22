import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PendingBalanceLine from "@/features/statement/PendingBalanceLine";
import i18n from "@/app/i18n";

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
});

describe("linha de processamento", () => {
  it("mostra o processando e o disponivel a partir dos dois numeros", () => {
    render(<PendingBalanceLine saldo="500.00" pendente="100.00" />);

    expect(screen.getByText(/400,00/)).toBeInTheDocument();
    expect(screen.getByText(/100,00/)).toBeInTheDocument();
  });

  it("some quando nao ha saida pendente", () => {
    const { container } = render(<PendingBalanceLine saldo="500.00" pendente="0.00" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("soma em centavos inteiros, sem residuo de ponto flutuante", () => {
    // 0.10 e 0.20 quebram em ponto flutuante. Se a subtracao fosse feita em
    // reais, o disponivel sairia com residuo binario.
    render(<PendingBalanceLine saldo="0.30" pendente="0.10" />);

    expect(screen.getByText(/0,20/)).toBeInTheDocument();
    expect(screen.queryByText(/0000/)).not.toBeInTheDocument();
  });

  it("nao faz consulta nenhuma", () => {
    // O componente e uma funcao pura dos dois numeros. Se ele voltasse a
    // consultar, precisaria de QueryClientProvider e este render lancaria.
    expect(() =>
      render(<PendingBalanceLine saldo="500.00" pendente="100.00" />),
    ).not.toThrow();
  });
});

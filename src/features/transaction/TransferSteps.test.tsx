import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import TransferSteps from "@/features/transaction/TransferSteps";
import i18n from "@/app/i18n";

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
});

describe("etapas da transferencia", () => {
  it("marca concluida so a etapa preenchida", () => {
    render(
      <TransferSteps
        etapas={[
          { id: "origem", rotulo: "Conta", feita: true },
          { id: "destino", rotulo: "Destino", feita: false },
          { id: "valor", rotulo: "Valor", feita: false },
        ]}
      />,
    );

    expect(screen.getByTestId("etapa-origem")).toHaveAttribute("data-concluida", "true");
    expect(screen.getByTestId("etapa-destino")).toHaveAttribute("data-concluida", "false");
    expect(screen.getByTestId("etapa-valor")).toHaveAttribute("data-concluida", "false");
  });

  it("anuncia o progresso para leitor de tela", () => {
    // Um traco colorido nao diz nada a quem nao ve. O grupo carrega o
    // progresso em texto para que a informacao exista sem a cor.
    render(
      <TransferSteps
        etapas={[
          { id: "origem", rotulo: "Conta", feita: true },
          { id: "destino", rotulo: "Destino", feita: true },
          { id: "valor", rotulo: "Valor", feita: false },
        ]}
      />,
    );

    expect(screen.getByRole("group", { name: /2 de 3/ })).toBeInTheDocument();
  });
});

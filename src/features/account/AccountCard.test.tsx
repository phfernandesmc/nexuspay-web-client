import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import AccountCard from "@/features/account/AccountCard";
import i18n from "@/app/i18n";

const conta = {
  id: "cccccccc-0000-0000-0000-000000000001",
  branch: "0001",
  number: "12345678-9",
  alias: "Salario",
  type: "CHECKING" as const,
  balance: "500.00",
  pending_outgoing: "0.00",
  status: "ACTIVE" as const,
  institution: {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    code: "NUBANK",
    name: "Nubank",
    color_hex: "#820AD1",
  },
  created_at: "2026-03-09T14:30:00Z",
};

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
});

describe("card da conta", () => {
  it("mostra o logo da instituicao", () => {
    render(
      <MemoryRouter>
        <AccountCard conta={conta} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("img", { name: "Nubank" })).toBeInTheDocument();
  });
});

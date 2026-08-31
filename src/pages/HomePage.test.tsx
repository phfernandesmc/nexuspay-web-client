import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import HomePage from "@/pages/HomePage";
import i18n from "@/app/i18n";

const instituicao = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  code: "NUBANK",
  name: "Nubank",
  color_hex: "#820AD1",
};

function conta(id: string, saldo: string) {
  return {
    id,
    branch: "0001",
    number: `${id}-0`,
    alias: `Conta ${id}`,
    type: "CHECKING" as const,
    balance: saldo,
    pending_outgoing: "0.00",
    status: "ACTIVE" as const,
    institution: instituicao,
    created_at: "2026-03-09T14:30:00Z",
  };
}

function movimento(id: string, quando: string) {
  return {
    id,
    type: "TRANSFER" as const,
    direction: "OUT" as const,
    amount: "10.00",
    status: "COMPLETED" as const,
    account_id: "conta-1",
    is_between_own_accounts: false,
    counterparty: null,
    created_at: quando,
  };
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({
    accessToken: "tok",
    user: {
      id: "11111111-1111-1111-1111-111111111111",
      full_name: "Joao Silva",
      email: "joao@example.com",
      document: "39053344705",
      created_at: "2026-08-12T00:00:00Z",
    },
    status: "authenticated",
    motivoEncerramento: null,
    sessaoEncerrada: false,
  });
});

function montar() {
  return envolverComQuery(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

describe("home", () => {
  it("soma o saldo de todas as contas", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json([conta("c1", "5000.00"), conta("c2", "7500.00")]),
      ),
      mswHttp.get(`${URL_TESTE}/accounts/:id/statement`, () =>
        HttpResponse.json({ items: [], next_cursor: null }),
      ),
    );
    montar();

    expect(await screen.findByText("R$ 12.500,00")).toBeInTheDocument();
  });

  it("mostra a atividade recente juntando as contas", async () => {
    // A mais nova esta na SEGUNDA conta: um painel que so olhasse a
    // primeira mostraria apenas m1 e passaria neste teste se ele nao
    // exigisse as duas.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json([conta("c1", "10.00"), conta("c2", "10.00")]),
      ),
      mswHttp.get(`${URL_TESTE}/accounts/c1/statement`, () =>
        HttpResponse.json({ items: [movimento("m1", "2026-08-01T10:00:00Z")], next_cursor: null }),
      ),
      mswHttp.get(`${URL_TESTE}/accounts/c2/statement`, () =>
        HttpResponse.json({ items: [movimento("m2", "2026-08-20T10:00:00Z")], next_cursor: null }),
      ),
    );
    montar();

    expect(await screen.findByTestId("extrato-m2")).toBeInTheDocument();
    expect(screen.getByTestId("extrato-m1")).toBeInTheDocument();
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import StatementReportPage from "@/features/statement/StatementReportPage";
import i18n from "@/app/i18n";

const instituicao = { id: "inst-1", code: "001", name: "Banco Um", color_hex: "#112233" };

const conta = {
  id: "conta-1",
  branch: "0001",
  number: "12345678-9",
  alias: "Salario",
  type: "CHECKING" as const,
  balance: "500.00",
  pending_outgoing: "0.00",
  status: "ACTIVE" as const,
  institution: instituicao,
  created_at: "2026-03-01T10:00:00Z",
};

const item = {
  id: "tx-1",
  type: "TRANSFER" as const,
  direction: "OUT" as const,
  amount: "10.00",
  status: "COMPLETED" as const,
  is_between_own_accounts: false,
  counterparty: null,
  created_at: "2026-05-10T10:00:00Z",
};

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({
    accessToken: "tok",
    user: null,
    status: "authenticated",
    motivoEncerramento: null,
    sessaoEncerrada: false,
  });
  servidor.use(mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta])));
});

function montar() {
  return envolverComQuery(
    <MemoryRouter>
      <StatementReportPage />
    </MemoryRouter>,
  );
}

describe("extrato por periodo", () => {
  it("mostra os totais QUE O SERVIDOR mandou, nao a soma da pagina", async () => {
    // A pagina traz um item de R$ 10,00 e os totais dizem 1.000 e 600. Se a
    // tela somasse o que recebeu, mostraria 10 — e o numero mudaria a cada
    // "carregar mais", que e pior que nao ter numero nenhum.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/statement`, () =>
        HttpResponse.json({
          items: [item],
          next_cursor: "proxima",
          totals: { total_in: "1000.00", total_out: "600.00" },
        }),
      ),
    );
    montar();

    expect(await screen.findByTestId("total-entradas")).toHaveTextContent("1.000,00");
    expect(screen.getByTestId("total-saidas")).toHaveTextContent("600,00");
  });

  it("por padrao pede o mes corrente e TODAS as contas", async () => {
    // Sem filtro nenhum o gateway recusa (date_from e date_to sao
    // obrigatorios), entao a tela precisa chegar com um periodo. E o padrao
    // e todas as contas: escolher uma e um refinamento, nao um pre-requisito.
    let consulta: URLSearchParams | null = null;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/statement`, ({ request }) => {
        consulta = new URL(request.url).searchParams;
        return HttpResponse.json({
          items: [],
          next_cursor: null,
          totals: { total_in: "0.00", total_out: "0.00" },
        });
      }),
    );
    montar();

    await screen.findByTestId("total-entradas");
    expect(consulta!.get("date_from")).toMatch(/^\d{4}-\d{2}-01$/);
    expect(consulta!.get("date_to")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Ausente, nao vazio: o gateway distingue "todas" pela AUSENCIA do
    // parametro, e uma string vazia viraria UUID invalido.
    expect(consulta!.has("account_id")).toBe(false);
  });

  it("escolher uma conta passa a enviar account_id", async () => {
    let consulta: URLSearchParams | null = null;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/statement`, ({ request }) => {
        consulta = new URL(request.url).searchParams;
        return HttpResponse.json({
          items: [],
          next_cursor: null,
          totals: { total_in: "0.00", total_out: "0.00" },
        });
      }),
    );
    montar();
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByTestId(`conta-filtro-${conta.id}`));

    await screen.findByTestId("total-entradas");
    expect(consulta!.get("account_id")).toBe(conta.id);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import AccountsPage from "@/features/account/AccountsPage";
import AccountDetailPage from "@/features/account/AccountDetailPage";
import i18n from "@/app/i18n";

/**
 * Critério de aceitação 6 do spec (§11): encerrar uma conta zerada e sem
 * pendências faz ela sumir da lista, E o detalhe continua acessível com o
 * status encerrado. O que existia antes provava só metade de cada vez
 * (AccountDetailPage.test.tsx cobre o erro do servidor; testes soltos
 * cobrem lista vazia e status CLOSED isoladamente) — nenhum teste encadeava
 * as duas coisas.
 *
 * Este teste NÃO força o resultado com um mock estático: o handler de
 * DELETE muda o estado que os handlers de GET devolvem depois, reproduzindo
 * o que o gateway real faz (confirmado contra o servidor: DELETE devolve
 * 204, GET /accounts/{id} depois devolve 200 com status "CLOSED", e
 * GET /accounts devolve lista vazia).
 */

const instituicao = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  code: "001",
  name: "Banco Um",
  color_hex: "#112233",
};

const conta = {
  id: "cccccccc-0000-0000-0000-000000000001",
  branch: "0001",
  number: "12345678-9",
  alias: "Salario",
  type: "CHECKING" as const,
  balance: "0.00",
  status: "ACTIVE" as const,
  institution: instituicao,
  created_at: "2026-03-09T14:30:00Z",
};

const extratoVazio = { items: [], next_cursor: null };

function montar(rotaInicial: string) {
  return envolverComQuery(
    <MemoryRouter initialEntries={[rotaInicial]}>
      <Routes>
        <Route path="/contas" element={<AccountsPage />} />
        <Route path="/contas/:id" element={<AccountDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({
    accessToken: "tok",
    user: null,
    status: "authenticated",
    motivoEncerramento: null,
  });
});

describe("ciclo de vida de encerrar conta (criterio 6)", () => {
  it("conta encerrada some da lista, e o detalhe segue acessivel com status encerrado", async () => {
    // Estado compartilhado pelos handlers, mudado pelo DELETE de verdade —
    // nao um mock que ja nasce respondendo "fechada".
    let fechada = false;

    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json(fechada ? [] : [conta]),
      ),
      mswHttp.get(`${URL_TESTE}/accounts/${conta.id}`, () =>
        HttpResponse.json({ ...conta, status: fechada ? "CLOSED" : "ACTIVE" }),
      ),
      mswHttp.get(`${URL_TESTE}/accounts/${conta.id}/statement`, () =>
        HttpResponse.json(extratoVazio),
      ),
      mswHttp.delete(`${URL_TESTE}/accounts/${conta.id}`, () => {
        fechada = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { unmount } = montar("/contas");

    // Lista -> detalhe -> encerrar. CloseAccountDialog navega de volta para
    // /contas sozinho quando a mutacao da certo (ver CloseAccountDialog.tsx).
    await userEvent.click(await screen.findByTestId(`conta-${conta.id}`));
    await userEvent.click(await screen.findByRole("button", { name: "Encerrar conta" }));
    await userEvent.click(screen.getByRole("button", { name: "Encerrar" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Suas contas" })).toBeInTheDocument(),
    );
    // A navegacao de volta pode mostrar a lista em cache por um instante,
    // antes do refetch (disparado pela invalidacao da mutacao) resolver —
    // por isso a espera e pelo estado vazio aparecer, nao uma checagem
    // sincrona logo apos a navegacao.
    expect(
      await screen.findByText("Você ainda não tem contas. Abra a primeira."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId(`conta-${conta.id}`)).not.toBeInTheDocument();

    unmount();

    // Metade 2: a mesma conta, acessada direto pelo detalhe, continua
    // respondendo (nao "nao encontrada") e mostra o status encerrado.
    montar(`/contas/${conta.id}`);

    const subtitulo = await screen.findByText(/Banco Um/);
    expect(subtitulo).toHaveTextContent(/Encerrada$/);
  });
});

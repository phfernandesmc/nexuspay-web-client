import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import StatementList from "@/features/statement/StatementList";
import i18n from "@/app/i18n";

const CONTA = "cccccccc-0000-0000-0000-000000000001";

const instituicao = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  code: "001",
  name: "Banco Um",
  color_hex: "#112233",
};

const transferencia = {
  id: "tttttttt-0000-0000-0000-000000000001",
  type: "TRANSFER" as const,
  direction: "OUT" as const,
  amount: "100.00",
  status: "PENDING" as const,
  account_id: "conta-1",
  is_between_own_accounts: false,
  counterparty: {
    holder_name: "M**** S****",
    branch: "0002",
    number: "87654321-0",
    institution: instituicao,
  },
  created_at: "2026-03-09T14:30:00Z",
};

const deposito = {
  id: "tttttttt-0000-0000-0000-000000000002",
  type: "DEPOSIT" as const,
  direction: "IN" as const,
  amount: "250.00",
  status: "COMPLETED" as const,
  account_id: "conta-1",
  is_between_own_accounts: false,
  counterparty: null,
  created_at: "2026-03-08T10:00:00Z",
};

const transferenciaEntreContasProprias = {
  id: "tttttttt-0000-0000-0000-000000000003",
  type: "TRANSFER" as const,
  direction: "OUT" as const,
  amount: "50.00",
  status: "COMPLETED" as const,
  account_id: "conta-1",
  is_between_own_accounts: true,
  counterparty: {
    holder_name: "A**** C****",
    branch: "0001",
    number: "12345678-0",
    institution: instituicao,
  },
  created_at: "2026-03-10T09:00:00Z",
};

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({
    accessToken: "tok",
    user: null,
    status: "authenticated",
    motivoEncerramento: null,
  });
});

describe("extrato", () => {
  it("mostra transferencia com contraparte mascarada e estado pendente", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${CONTA}/statement`, () =>
        HttpResponse.json({ items: [transferencia], next_cursor: null }),
      ),
    );
    envolverComQuery(<StatementList contaId={CONTA} />);

    expect(await screen.findByText("M**** S****")).toBeInTheDocument();
    // "Em processamento" divide o mesmo <p> com a data formatada — sao nos
    // de texto irmaos, entao o texto concatenado do elemento nao e a string
    // isolada. getByText com string exata exige o elemento inteiro; regex
    // casa substring. Ancorada no fim com o separador "· " exigido na
    // frente, para nao aceitar "Em processamento" em qualquer lugar do
    // documento — so no fim do texto concatenado desse <p>.
    expect(screen.getByText(/· Em processamento$/)).toBeInTheDocument();
    expect(screen.getByText(/100,00/)).toBeInTheDocument();
  });

  it("deposito aparece sem contraparte", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${CONTA}/statement`, () =>
        HttpResponse.json({ items: [deposito], next_cursor: null }),
      ),
    );
    envolverComQuery(<StatementList contaId={CONTA} />);

    expect(await screen.findByText("Depósito")).toBeInTheDocument();
  });

  it("carregar mais usa o cursor da pagina anterior", async () => {
    // O cursor do gateway e keyset: paginas nao repetem nem pulam item
    // quando algo novo e inserido durante a navegacao. Mandar o cursor
    // errado — ou nenhum — traria a primeira pagina de novo.
    const cursoresRecebidos: (string | null)[] = [];
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${CONTA}/statement`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        cursoresRecebidos.push(cursor);
        return cursor === null
          ? HttpResponse.json({ items: [transferencia], next_cursor: "CURSOR-1" })
          : HttpResponse.json({ items: [deposito], next_cursor: null });
      }),
    );
    envolverComQuery(<StatementList contaId={CONTA} />);
    await screen.findByText("M**** S****");

    await userEvent.click(screen.getByRole("button", { name: "Carregar mais" }));

    expect(await screen.findByText("Depósito")).toBeInTheDocument();
    expect(cursoresRecebidos).toEqual([null, "CURSOR-1"]);
  });

  it("transferencia entre contas proprias recebe rotulo distinto", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${CONTA}/statement`, () =>
        HttpResponse.json({ items: [transferenciaEntreContasProprias], next_cursor: null }),
      ),
    );
    envolverComQuery(<StatementList contaId={CONTA} />);

    expect(await screen.findByText("A**** C****")).toBeInTheDocument();
    expect(screen.getByText("Entre suas contas")).toBeInTheDocument();
  });

  it("sem proxima pagina o botao some", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${CONTA}/statement`, () =>
        HttpResponse.json({ items: [deposito], next_cursor: null }),
      ),
    );
    envolverComQuery(<StatementList contaId={CONTA} />);
    await screen.findByText("Depósito");

    expect(screen.queryByRole("button", { name: "Carregar mais" })).not.toBeInTheDocument();
  });

  it("conta sem transacoes mostra estado vazio proprio", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${CONTA}/statement`, () =>
        HttpResponse.json({ items: [], next_cursor: null }),
      ),
    );
    envolverComQuery(<StatementList contaId={CONTA} />);

    expect(await screen.findByText("Nenhuma transação nesta conta ainda.")).toBeInTheDocument();
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import AccountsPage from "@/features/account/AccountsPage";
import i18n from "@/app/i18n";

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
  balance: "1234.56",
  pending_outgoing: "0.00",
  status: "ACTIVE" as const,
  institution: instituicao,
  created_at: "2026-03-09T14:30:00Z",
};

function montar() {
  return envolverComQuery(
    <MemoryRouter>
      <AccountsPage />
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

describe("lista de contas", () => {
  it("mostra o saldo formatado em real", async () => {
    servidor.use(mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta])));
    montar();

    expect(await screen.findByText("Salario")).toBeInTheDocument();
    expect(screen.getByText(/1\.234,56/)).toBeInTheDocument();
  });

  it("usa a cor da instituicao no cartao", async () => {
    // O color_hex existe na API para a interface diferenciar instituicoes.
    servidor.use(mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta])));
    montar();

    const cartao = await screen.findByTestId(`conta-${conta.id}`);
    expect(cartao).toHaveStyle({ borderLeftColor: "#112233" });
  });

  it("conta sem apelido nao mostra vazio", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json([{ ...conta, alias: null }]),
      ),
    );
    montar();

    expect(await screen.findByText("Sem apelido")).toBeInTheDocument();
  });

  it("sem contas mostra estado vazio proprio", async () => {
    servidor.use(mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([])));
    montar();

    expect(
      await screen.findByText("Você ainda não tem contas. Abra a primeira."),
    ).toBeInTheDocument();
  });

  it("falha de rede mostra mensagem traduzida, nao tela vazia", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.error()),
    );
    montar();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Não conseguimos falar com o servidor. Verifique sua conexão.",
      ),
    );
  });

  it("trocar o idioma reformata o valor sem nova requisicao", async () => {
    let chamadas = 0;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () => {
        chamadas += 1;
        return HttpResponse.json([conta]);
      }),
    );
    montar();
    await screen.findByText(/1\.234,56/);

    await i18n.changeLanguage("en");

    await waitFor(() => expect(screen.getByText(/1,234\.56/)).toBeInTheDocument());
    expect(chamadas).toBe(1);
  });

  it("o cartao mostra saldo E disponivel quando ha saida pendente", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json([{ ...conta, balance: "500.00", pending_outgoing: "100.00" }]),
      ),
    );

    montar();

    expect(await screen.findByText(/500,00/)).toBeInTheDocument();
    expect(screen.getByText(/400,00/)).toBeInTheDocument();
  });

  it("o cartao mostra so o saldo quando nao ha saida pendente", async () => {
    // Sem pendencia os dois numeros sao iguais, e repetir o mesmo valor
    // duas vezes e ruido.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json([{ ...conta, balance: "500.00", pending_outgoing: "0.00" }]),
      ),
    );

    montar();

    await screen.findByText(/500,00/);
    expect(screen.queryByText("Disponível")).not.toBeInTheDocument();
  });
});

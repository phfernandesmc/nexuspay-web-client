import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    // Agora ele preenche o cartao inteiro, e nao mais uma borda lateral.
    // #112233 e escuro o bastante para passar no AA com texto branco, entao
    // corLegivel o devolve intacto — ver lib/cor.test.ts.
    servidor.use(mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta])));
    montar();

    const cartao = await screen.findByTestId(`conta-${conta.id}`);
    expect(cartao.querySelector("[style]")).toHaveStyle({ backgroundColor: "#112233" });
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
    expect(screen.getByText(/Dispon[ií]vel/)).toBeInTheDocument();
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

    // Espera pelo cartao pelo testid, nao pelo valor: com a mutacao
    // pending_outgoing >= 0 o saldo e o disponivel viram o mesmo texto
    // "R$ 500,00" duplicado, e findByText(/500,00/) estouraria por
    // ambiguidade antes mesmo de chegar na asserção que importa aqui.
    await screen.findByTestId(`conta-${conta.id}`);
    expect(screen.queryByText(/Dispon[ií]vel/)).not.toBeInTheDocument();
  });

  it("o convite para abrir conta aparece mesmo sem nenhuma conta", async () => {
    // Ele e o proprio estado vazio: quem chega sem contas precisa de um
    // caminho visivel para a primeira, nao so de uma frase.
    servidor.use(mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([])));
    montar();

    expect(await screen.findByRole("button", { name: "Abrir conta" })).toBeInTheDocument();
  });

  it("clicar no convite abre o dialogo", async () => {
    // A ligacao entre o convite e o dialogo nao tinha teste nenhum: o
    // dialogo era exercitado montado a mao, entao trocar o gatilho por um
    // card poderia deixar de abrir sem nada acusar.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta])),
      mswHttp.get(`${URL_TESTE}/institutions`, () => HttpResponse.json([instituicao])),
    );
    montar();

    await userEvent.click(await screen.findByRole("button", { name: "Abrir conta" }));

    // O titulo do dialogo ("Abrir uma conta") e diferente do rotulo do
    // gatilho ("Abrir conta"): sao chaves distintas no catalogo.
    expect(await screen.findByRole("dialog", { name: "Abrir uma conta" })).toBeInTheDocument();
  });
});

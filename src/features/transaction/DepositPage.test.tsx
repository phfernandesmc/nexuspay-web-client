import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import DepositPage from "@/features/transaction/DepositPage";
import { useContas } from "@/features/account/queries";
import i18n from "@/app/i18n";

const conta = {
  id: "conta-1",
  branch: "0001",
  number: "12345678",
  alias: "Principal",
  type: "CHECKING",
  balance: "500.00",
  pending_outgoing: "0.00",
  status: "ACTIVE",
  institution: {
    id: "inst-1",
    code: "001",
    name: "Banco Um",
    color_hex: "#112233",
  },
  created_at: "2026-03-01T10:00:00Z",
};

/** Expoe a rota e o estado da navegacao para o teste conferir. */
function Espiao() {
  const local = useLocation();
  return (
    <div>
      <span data-testid="rota">{local.pathname}</span>
      <span data-testid="criada">{String((local.state as { criadaAgora?: boolean } | null)?.criadaAgora)}</span>
    </div>
  );
}

function montar() {
  return envolverComQuery(
    <MemoryRouter initialEntries={["/depositar"]}>
      <Routes>
        <Route path="/depositar" element={<DepositPage />} />
        <Route path="/transacoes/:id" element={<Espiao />} />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * Mantem CHAVES.contas() com observador ativo durante o teste todo, mesmo
 * depois que o deposito navega para longe do DepositPage e desmonta o
 * <select> que tambem observava a lista. invalidateQueries so refaz consulta
 * com observador ativo (o "active" do refetchType default); sem este
 * componente paralelo, uma corrida entre a navegacao e a invalidacao
 * deixaria o teste instavel em vez de provar a invalidacao de fato.
 */
function ListaObservada() {
  useContas();
  return null;
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({
    accessToken: "tok",
    user: null,
    status: "authenticated",
    motivoEncerramento: null,
  });
  servidor.use(mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta])));
});

describe("deposito", () => {
  it("manda o cabecalho Idempotency-Key e leva ao recibo", async () => {
    let chave: string | null = null;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/deposit`, ({ request }) => {
        chave = request.headers.get("Idempotency-Key");
        return HttpResponse.json(
          {
            id: "tx-1",
            type: "DEPOSIT",
            status: "PENDING",
            amount: "100.00",
            source_account_id: null,
            destination_account_id: conta.id,
            failure_reason: null,
            created_at: "2026-03-09T14:30:00Z",
          },
          { status: 202 },
        );
      }),
    );

    montar();
    const usuario = userEvent.setup();
    await screen.findByRole("option", { name: /Principal/ });
    await usuario.selectOptions(screen.getByLabelText("Conta"), conta.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByTestId("rota")).toHaveTextContent("/transacoes/tx-1");
    expect(chave).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("o 202 chega ao recibo como criadaAgora true", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/deposit`, () =>
        HttpResponse.json(
          {
            id: "tx-1",
            type: "DEPOSIT",
            status: "PENDING",
            amount: "100.00",
            source_account_id: null,
            destination_account_id: conta.id,
            failure_reason: null,
            created_at: "2026-03-09T14:30:00Z",
          },
          { status: 202 },
        ),
      ),
    );

    montar();
    const usuario = userEvent.setup();
    await screen.findByRole("option", { name: /Principal/ });
    await usuario.selectOptions(screen.getByLabelText("Conta"), conta.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByTestId("criada")).toHaveTextContent("true");
  });

  it("erro ao carregar contas mostra o alerta traduzido em vez de select vazio silencioso", async () => {
    // Com GET /accounts em 500, a tela antes renderizava o formulario com
    // select vazio e ZERO alertas — afirmando por omissao que o usuario nao
    // tem contas. Deposito e a UNICA forma de por dinheiro numa conta. Mesmo
    // padrao de AccountsPage.tsx.
    servidor.use(mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.error()));

    montar();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não conseguimos falar com o servidor. Verifique sua conexão.",
    );
    expect(screen.queryByLabelText("Conta")).not.toBeInTheDocument();
  });

  it("mudar SO o valor gera uma chave de idempotencia NOVA", async () => {
    // Criterio 15 do spec: a chave precisa estar presa ao valor. Sem isso,
    // um reenvio depois de trocar so o valor reusaria a chave e o gateway
    // devolveria a transacao ANTIGA em vez de criar a nova.
    const chaves: string[] = [];
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/deposit`, ({ request }) => {
        chaves.push(request.headers.get("Idempotency-Key") ?? "");
        return HttpResponse.error();
      }),
    );

    montar();
    const usuario = userEvent.setup();
    await screen.findByRole("option", { name: /Principal/ });
    await usuario.selectOptions(screen.getByLabelText("Conta"), conta.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByRole("alert");

    await usuario.clear(screen.getByLabelText("Valor"));
    await usuario.type(screen.getByLabelText("Valor"), "200.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(chaves).toHaveLength(2));
    expect(chaves[0]).not.toBe(chaves[1]);
  });

  it("espaco em branco no fim do valor NAO muda a chave de idempotencia", async () => {
    // Mesma estrutura da TransferPage: a assinatura precisa usar o MESMO
    // valor aparado que vai na requisicao. Sem isso, editar so espaco
    // geraria chave nova para um payload identico, e um reenvio depois de
    // falha de rede criaria um SEGUNDO deposito.
    const chaves: string[] = [];
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/deposit`, ({ request }) => {
        chaves.push(request.headers.get("Idempotency-Key") ?? "");
        return HttpResponse.error();
      }),
    );

    montar();
    const usuario = userEvent.setup();
    await screen.findByRole("option", { name: /Principal/ });
    await usuario.selectOptions(screen.getByLabelText("Conta"), conta.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByRole("alert");

    await usuario.type(screen.getByLabelText("Valor"), " ");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(chaves).toHaveLength(2));
    expect(chaves[0]).toBe(chaves[1]);
  });

  it("o 200 chega ao recibo como criadaAgora false", async () => {
    // O gateway responde 200 quando a chave ja tinha sido usada. A tela
    // precisa saber, senao diz que enviou algo que nao enviou.
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/deposit`, () =>
        HttpResponse.json(
          {
            id: "tx-1",
            type: "DEPOSIT",
            status: "PENDING",
            amount: "100.00",
            source_account_id: null,
            destination_account_id: conta.id,
            failure_reason: null,
            created_at: "2026-03-09T14:30:00Z",
          },
          { status: 200 },
        ),
      ),
    );

    montar();
    const usuario = userEvent.setup();
    await screen.findByRole("option", { name: /Principal/ });
    await usuario.selectOptions(screen.getByLabelText("Conta"), conta.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByTestId("criada")).toHaveTextContent("false");
  });

  it("erro do servidor aparece traduzido por codigo, nunca a mensagem", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/deposit`, () =>
        HttpResponse.json(
          { error: { code: "ACCOUNT_NOT_FOUND", message: "nao mostre isto", details: {} } },
          { status: 404 },
        ),
      ),
    );

    montar();
    const usuario = userEvent.setup();
    await screen.findByRole("option", { name: /Principal/ });
    await usuario.selectOptions(screen.getByLabelText("Conta"), conta.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(i18n.t("ACCOUNT_NOT_FOUND", { ns: "errors" }));
    expect(alerta).not.toHaveTextContent("nao mostre isto");
  });

  it("deposito bem sucedido REFAZ a lista de contas", async () => {
    // Este e o teste que pega o defeito silencioso: sem invalidarTudoDeConta
    // em useDepositar, o deposito e criado no servidor e a lista de contas
    // na tela continua com o saldo antigo. Nada quebra — so fica errado.
    let listagens = 0;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () => {
        listagens += 1;
        return HttpResponse.json([conta]);
      }),
      mswHttp.post(`${URL_TESTE}/transactions/deposit`, () =>
        HttpResponse.json(
          {
            id: "tx-1",
            type: "DEPOSIT",
            status: "PENDING",
            amount: "100.00",
            source_account_id: null,
            destination_account_id: conta.id,
            failure_reason: null,
            created_at: "2026-03-09T14:30:00Z",
          },
          { status: 202 },
        ),
      ),
    );

    envolverComQuery(
      <>
        <ListaObservada />
        <MemoryRouter initialEntries={["/depositar"]}>
          <Routes>
            <Route path="/depositar" element={<DepositPage />} />
            <Route path="/transacoes/:id" element={<Espiao />} />
          </Routes>
        </MemoryRouter>
      </>,
    );
    const usuario = userEvent.setup();
    await screen.findByRole("option", { name: /Principal/ });
    // A montagem ja dispara uma listagem inicial (DepositPage e
    // ListaObservada observam a mesma chave); guarda o numero para so contar
    // o que acontece DEPOIS do deposito.
    await waitFor(() => expect(listagens).toBeGreaterThanOrEqual(1));
    const antes = listagens;

    await usuario.selectOptions(screen.getByLabelText("Conta"), conta.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(listagens).toBeGreaterThan(antes));
  });

  it("valor zerado NAO habilita o envio", async () => {
    // Mesmo furo da transferencia: a completude olhava string vazia, e "0"
    // nao e vazia.
    montar();
    const usuario = userEvent.setup();
    await screen.findByRole("option", { name: /Principal/ });
    await usuario.selectOptions(screen.getByLabelText("Conta"), conta.id);

    await usuario.type(screen.getByLabelText("Valor"), "0");

    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });
});

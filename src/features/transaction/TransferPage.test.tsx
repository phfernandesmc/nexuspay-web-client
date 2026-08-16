import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import TransferPage from "@/features/transaction/TransferPage";
import i18n from "@/app/i18n";

const instituicao = { id: "inst-1", code: "001", name: "Banco Um", color_hex: "#112233" };

const conta = {
  id: "conta-1",
  branch: "0001",
  number: "12345678",
  alias: "Principal",
  type: "CHECKING",
  balance: "500.00",
  status: "ACTIVE",
  institution: instituicao,
  created_at: "2026-03-01T10:00:00Z",
};

const contato = {
  id: "contato-1",
  alias: "Maria",
  is_favorite: false,
  target_account: {
    id: "conta-maria",
    branch: "0002",
    number: "87654321",
    holder_name: "M**** S****",
    type: "CHECKING",
    status: "ACTIVE",
    institution: instituicao,
  },
  created_at: "2026-03-01T10:00:00Z",
};

function Espiao() {
  const local = useLocation();
  return <span data-testid="rota">{local.pathname}</span>;
}

function montar() {
  return envolverComQuery(
    <MemoryRouter initialEntries={["/transferir"]}>
      <Routes>
        <Route path="/transferir" element={<TransferPage />} />
        <Route path="/transacoes/:id" element={<Espiao />} />
      </Routes>
    </MemoryRouter>,
  );
}

function respostaTransacao(status: number) {
  return HttpResponse.json(
    {
      id: "tx-1",
      type: "TRANSFER",
      status: "PENDING",
      amount: "100.00",
      source_account_id: conta.id,
      destination_account_id: "conta-maria",
      failure_reason: null,
      created_at: "2026-03-09T14:30:00Z",
    },
    { status },
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
  servidor.use(
    mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta])),
    mswHttp.get(`${URL_TESTE}/contacts`, () => HttpResponse.json([contato])),
    mswHttp.get(`${URL_TESTE}/institutions`, () => HttpResponse.json([instituicao])),
    mswHttp.get(`${URL_TESTE}/accounts/${conta.id}/statement`, () =>
      HttpResponse.json({ items: [], next_cursor: null }),
    ),
  );
});

async function escolherOrigem(usuario: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("option", { name: /Principal/ });
  await usuario.selectOptions(screen.getByLabelText("Conta de origem"), conta.id);
}

describe("transferencia", () => {
  it("transfere para um contato salvo", async () => {
    let corpo: unknown = null;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, async ({ request }) => {
        corpo = await request.json();
        return respostaTransacao(202);
      }),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByRole("option", { name: /Maria/ });
    await usuario.selectOptions(screen.getByLabelText("Destino"), contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() =>
      expect(corpo).toEqual({
        source_account_id: conta.id,
        destination_account_id: "conta-maria",
        amount: "100.00",
      }),
    );
    expect(await screen.findByTestId("rota")).toHaveTextContent("/transacoes/tx-1");
  });

  it("transfere para uma conta buscada na hora, sem salvar contato", async () => {
    let salvouContato = false;
    let corpo: unknown = null;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/contacts`, () => {
        salvouContato = true;
        return HttpResponse.json({}, { status: 201 });
      }),
      mswHttp.post(`${URL_TESTE}/contacts/lookup`, () =>
        HttpResponse.json({
          account_id: "conta-nova",
          holder_name: "J**** P****",
          type: "CHECKING",
          institution: instituicao,
        }),
      ),
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, async ({ request }) => {
        corpo = await request.json();
        return respostaTransacao(202);
      }),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await usuario.click(screen.getByRole("button", { name: "Buscar outra conta" }));

    await screen.findByRole("option", { name: instituicao.name });
    await usuario.selectOptions(screen.getByLabelText("Instituição"), instituicao.id);
    await usuario.type(screen.getByLabelText("Agência"), "0003");
    await usuario.type(screen.getByLabelText("Número da conta"), "99999999");
    await usuario.click(screen.getByRole("button", { name: "Buscar" }));

    expect(await screen.findByText("J**** P****")).toBeInTheDocument();
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() =>
      expect(corpo).toEqual({
        source_account_id: conta.id,
        destination_account_id: "conta-nova",
        amount: "100.00",
      }),
    );
    // Transferir nao cria contato. O gateway nem liga um ao outro.
    expect(salvouContato).toBe(false);
  });

  it("valor acima do disponivel avisa mas NAO desabilita o botao", async () => {
    // O disponivel derivado pode estar MAIOR que o real (furo declarado na
    // secao 6 do spec da 3b). Bloquear no cliente barraria envio legitimo.
    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByRole("option", { name: /Maria/ });
    await usuario.selectOptions(screen.getByLabelText("Destino"), contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "999999.00");

    expect(
      await screen.findByText(
        "O valor é maior que o disponível calculado. Você pode enviar mesmo assim — quem decide é o servidor.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
  });

  it("saldo insuficiente do servidor aparece traduzido por codigo", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, () =>
        HttpResponse.json(
          {
            error: {
              code: "INSUFFICIENT_FUNDS",
              message: "nao mostre isto",
              details: { available: "50.00" },
            },
          },
          { status: 422 },
        ),
      ),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByRole("option", { name: /Maria/ });
    await usuario.selectOptions(screen.getByLabelText("Destino"), contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(i18n.t("INSUFFICIENT_FUNDS", { ns: "errors" }));
    expect(alerta).not.toHaveTextContent("nao mostre isto");
  });

  it("transferir para a mesma conta mostra a mensagem propria", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, () =>
        HttpResponse.json(
          { error: { code: "SAME_ACCOUNT_TRANSFER", message: "", details: {} } },
          { status: 422 },
        ),
      ),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByRole("option", { name: /Maria/ });
    await usuario.selectOptions(screen.getByLabelText("Destino"), contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("SAME_ACCOUNT_TRANSFER", { ns: "errors" }),
    );
  });

  it("reenviar o MESMO pedido usa a MESMA chave; mudar o valor gera outra", async () => {
    // O teste central da idempotencia na tela real: sem isto, um clique
    // duplo depois de uma falha de rede criaria duas transferencias.
    const chaves: string[] = [];
    let falhar = true;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, ({ request }) => {
        chaves.push(request.headers.get("Idempotency-Key") ?? "");
        if (falhar) {
          falhar = false;
          return HttpResponse.error();
        }
        return respostaTransacao(202);
      }),
    );

    montar();
    const usuario = userEvent.setup();
    await escolherOrigem(usuario);
    await screen.findByRole("option", { name: /Maria/ });
    await usuario.selectOptions(screen.getByLabelText("Destino"), contato.id);
    await usuario.type(screen.getByLabelText("Valor"), "100.00");

    await usuario.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByRole("alert");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(chaves).toHaveLength(2));
    expect(chaves[0]).toBe(chaves[1]);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import OwnTransferDialog from "@/features/account/OwnTransferDialog";
import i18n from "@/app/i18n";

const instituicao = { id: "inst-1", code: "001", name: "Banco Um", color_hex: "#112233" };

function conta(id: string, apelido: string, extras: Record<string, unknown> = {}) {
  return {
    id,
    branch: "0001",
    number: `${id}-0`,
    alias: apelido,
    type: "CHECKING" as const,
    balance: "500.00",
    pending_outgoing: "0.00",
    status: "ACTIVE" as const,
    institution: instituicao,
    created_at: "2026-03-01T10:00:00Z",
    ...extras,
  };
}

const origem = conta("conta-1", "Salario");

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({
    accessToken: "tok",
    user: null,
    status: "authenticated",
    motivoEncerramento: null,
    sessaoEncerrada: false,
  });
});

function montar() {
  return envolverComQuery(
    <MemoryRouter>
      <OwnTransferDialog conta={origem} aoFechar={() => {}} />
    </MemoryRouter>,
  );
}

describe("transferencia entre contas proprias", () => {
  it("transfere para uma conta propria sem passar pelo lookup", async () => {
    // Recuperado do que foi removido da tela de transferencia, como o
    // follow-up registrou: e o caminho feliz do recurso. Aqui a origem ja e
    // conhecida (a conta da pagina) e o destino sai da lista curta das
    // outras contas do mesmo dono — nenhuma busca por agencia e numero.
    let corpo: unknown = null;
    let chave: string | null = null;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json([origem, conta("conta-2", "Reserva")]),
      ),
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, async ({ request }) => {
        corpo = await request.json();
        chave = request.headers.get("Idempotency-Key");
        return HttpResponse.json({ id: "tx-1" }, { status: 202 });
      }),
    );
    montar();
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByTestId("destino-conta-2"));
    await usuario.type(screen.getByLabelText("Valor"), "10000");
    await usuario.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(corpo).toEqual({
        source_account_id: "conta-1",
        destination_account_id: "conta-2",
        amount: "100.00",
      }),
    );
    expect(chave).not.toBeNull();
  });

  it("a propria conta e as encerradas NAO aparecem como destino", async () => {
    // Transferir para si mesma seria recusado pelo gateway
    // (SAME_ACCOUNT_TRANSFER), e conta encerrada nao recebe. Oferecer as
    // duas seria convidar a um erro que so aparece depois do envio.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json([
          origem,
          conta("conta-2", "Reserva"),
          conta("conta-3", "Antiga", { status: "CLOSED" }),
        ]),
      ),
    );
    montar();

    expect(await screen.findByTestId("destino-conta-2")).toBeInTheDocument();
    expect(screen.queryByTestId("destino-conta-1")).toBeNull();
    expect(screen.queryByTestId("destino-conta-3")).toBeNull();
  });
});

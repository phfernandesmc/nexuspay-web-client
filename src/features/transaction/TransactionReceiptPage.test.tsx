import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import TransactionReceiptPage from "@/features/transaction/TransactionReceiptPage";
import i18n from "@/app/i18n";

function transacao(extras: Record<string, unknown> = {}) {
  return {
    id: "tx-1",
    type: "TRANSFER",
    status: "PENDING",
    amount: "150.00",
    source_account_id: "conta-origem",
    destination_account_id: "conta-destino",
    failure_reason: null,
    created_at: "2026-03-09T14:30:00Z",
    ...extras,
  };
}

function montar(estado: { criadaAgora?: boolean } | null = null) {
  return envolverComQuery(
    <MemoryRouter initialEntries={[{ pathname: "/transacoes/tx-1", state: estado }]}>
      <Routes>
        <Route path="/transacoes/:id" element={<TransactionReceiptPage />} />
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

describe("recibo", () => {
  it("diz que PENDING ainda nao concluiu, com todas as letras", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => HttpResponse.json(transacao())),
    );

    montar();

    // O valor da situacao e irmao de texto do rotulo ("Situação: Aceita,
    // ainda não concluída") dentro do mesmo <p> — getNodeText concatena os
    // dois, entao nenhum elemento tem so o valor isolado. Regex de
    // substring resolve sem mexer na producao.
    expect(await screen.findByText(/Aceita, ainda não concluída/)).toBeInTheDocument();
    expect(
      screen.getByText("O pedido foi aceito e está sendo processado. O dinheiro ainda não saiu."),
    ).toBeInTheDocument();
  });

  it("distingue a criada agora (202) da reapresentada (200)", async () => {
    // Esta e a razao do RespostaTransacao carregar o status: sem isso, um
    // reenvio diria "enviado agora" sem ter enviado nada.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => HttpResponse.json(transacao())),
    );

    const { unmount } = montar({ criadaAgora: true });
    expect(await screen.findByText("Pedido enviado agora.")).toBeInTheDocument();
    unmount();

    montar({ criadaAgora: false });
    expect(
      await screen.findByText(
        "Este pedido já tinha sido enviado. Você está vendo a mesma transação, não uma nova.",
      ),
    ).toBeInTheDocument();
  });

  it("sem estado de navegacao NAO afirma nada sobre novidade", async () => {
    // E o caso do recarregamento: a chave de idempotencia morreu, o estado
    // da navegacao tambem. Dizer "enviada agora" aqui seria mentira.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => HttpResponse.json(transacao())),
    );

    montar(null);

    await screen.findByText(/Aceita, ainda não concluída/);
    expect(screen.queryByText("Pedido enviado agora.")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Este pedido já tinha sido enviado. Você está vendo a mesma transação, não uma nova.",
      ),
    ).not.toBeInTheDocument();
  });

  it("o botao de atualizar busca o estado atual, sem timer", async () => {
    let status = "PENDING";
    let buscas = 0;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => {
        buscas += 1;
        return HttpResponse.json(transacao({ status }));
      }),
    );

    montar();
    await screen.findByText(/Aceita, ainda não concluída/);
    const antes = buscas;

    status = "COMPLETED";
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Atualizar situação" }));

    expect(await screen.findByText(/Concluída/)).toBeInTheDocument();
    expect(buscas).toBeGreaterThan(antes);
  });

  it("traduz o motivo da falha POR CODIGO", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () =>
        HttpResponse.json(
          transacao({ status: "FAILED", failure_reason: "DESTINATION_ACCOUNT_UNAVAILABLE" }),
        ),
      ),
    );

    montar();

    expect(
      await screen.findByText(
        i18n.t("DESTINATION_ACCOUNT_UNAVAILABLE", { ns: "errors" }),
      ),
    ).toBeInTheDocument();
  });

  it("motivo desconhecido NAO vaza para a tela", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () =>
        HttpResponse.json(
          transacao({ status: "FAILED", failure_reason: "ALGO_QUE_O_WORKER_INVENTOU" }),
        ),
      ),
    );

    montar();

    await screen.findByText(/Não concluída/);
    expect(screen.queryByText(/ALGO_QUE_O_WORKER_INVENTOU/)).not.toBeInTheDocument();
    expect(screen.getByText(i18n.t("UNKNOWN", { ns: "errors" }))).toBeInTheDocument();
  });

  it("formata o valor em BRL mesmo em ingles", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () => HttpResponse.json(transacao())),
    );

    await i18n.changeLanguage("en");
    montar();

    const valor = await screen.findByText(/150/);
    expect(valor).toHaveTextContent("R$");
    expect(valor.textContent).not.toMatch(/(?<!R)\$/);
  });
});

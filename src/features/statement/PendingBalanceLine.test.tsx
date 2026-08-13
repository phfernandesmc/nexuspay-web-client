import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { criarQueryClient } from "@/app/queryClient";
import { CHAVES } from "@/features/account/queries";
import { useSession } from "@/features/auth/session.store";
import PendingBalanceLine from "@/features/statement/PendingBalanceLine";
import i18n from "@/app/i18n";

const CONTA = "cccccccc-0000-0000-0000-000000000001";

function item(over: Partial<Record<string, unknown>>) {
  return {
    id: crypto.randomUUID(),
    type: "TRANSFER",
    direction: "OUT",
    amount: "10.00",
    status: "PENDING",
    is_between_own_accounts: false,
    counterparty: null,
    created_at: "2026-03-09T14:30:00Z",
    ...over,
  };
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

describe("linha de processamento", () => {
  it("soma apenas saidas pendentes", async () => {
    // Entrada pendente nao reduz o disponivel — o dinheiro esta CHEGANDO.
    // Saida concluida ja saiu do saldo. Somar qualquer um dos dois daria um
    // disponivel menor que o real.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${CONTA}/statement`, () =>
        HttpResponse.json({
          items: [
            item({ direction: "OUT", status: "PENDING", amount: "0.10" }),
            item({ direction: "OUT", status: "PENDING", amount: "0.20" }),
            item({ direction: "IN", status: "PENDING", amount: "999.00" }),
            item({ direction: "OUT", status: "COMPLETED", amount: "999.00" }),
            item({ direction: "OUT", status: "FAILED", amount: "999.00" }),
          ],
          next_cursor: null,
        }),
      ),
    );

    envolverComQuery(<PendingBalanceLine contaId={CONTA} saldo="500.00" />);

    // 0.10 + 0.20 em ponto flutuante daria 0.30000000000000004.
    expect(await screen.findByText(/0,30/)).toBeInTheDocument();
    expect(screen.queryByText(/0000/)).not.toBeInTheDocument();
    expect(screen.getByText(/499,70/)).toBeInTheDocument();
  });

  it("pede exatamente 100 itens, o teto do gateway", async () => {
    let limiteRecebido: string | null = null;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${CONTA}/statement`, ({ request }) => {
        limiteRecebido = new URL(request.url).searchParams.get("limit");
        return HttpResponse.json({ items: [], next_cursor: null });
      }),
    );

    envolverComQuery(<PendingBalanceLine contaId={CONTA} saldo="500.00" />);

    await waitFor(() => expect(limiteRecebido).toBe("100"));
  });

  it("sem saidas pendentes de verdade, a linha nao aparece", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${CONTA}/statement`, () =>
        HttpResponse.json({ items: [], next_cursor: null }),
      ),
    );

    // QueryClient proprio (nao o de envolverComQuery) porque o teste precisa
    // conferir o status REAL da consulta — sucesso vazio — e nao so que a
    // tela ficou em branco. Branco tambem e o que aparece durante o
    // carregamento, e era o que o erro de rede produzia antes do reparo: um
    // teste que so olha a ausencia de elementos passaria nos tres casos.
    const queryClient = criarQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <PendingBalanceLine contaId={CONTA} saldo="500.00" />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(queryClient.getQueryState(CHAVES.extratoPendentes(CONTA))?.status).toBe("success"),
    );

    // So depois de confirmar que a consulta terminou com sucesso (nao que
    // ainda esta carregando, nem que falhou) e que faz sentido afirmar que a
    // ausencia de alerta e de linha de processamento significa "sem
    // pendencias" — e nao "nao sabemos".
    expect(screen.queryByText(/Em processamento/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("falha de rede mostra o alerta traduzido, nunca o estado de sem pendencias", async () => {
    // Reproduz o defeito que a review pegou: antes do reparo, um erro de
    // rede aqui fazia a linha desaparecer exatamente como "esta conta nao
    // tem saida pendente" — o usuario lia "saldo cheio disponivel" quando
    // ninguem sabia. Mesmo padrao de AccountsPage/AccountDetailPage/
    // StatementList: alerta traduzido pelo codigo do erro, nunca silencio.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${CONTA}/statement`, () => HttpResponse.error()),
    );

    envolverComQuery(<PendingBalanceLine contaId={CONTA} saldo="500.00" />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Não conseguimos falar com o servidor. Verifique sua conexão.",
      ),
    );
    // A segunda metade da prova: o estado de "sem pendencias" nao pode
    // aparecer junto, disfarcando o erro de "esta tudo disponivel".
    expect(screen.queryByText(/Em processamento/)).not.toBeInTheDocument();
  });
});

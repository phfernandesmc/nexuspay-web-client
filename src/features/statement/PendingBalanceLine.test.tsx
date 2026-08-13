import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
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

    await screen.findByTestId("sem-pendencias");
    expect(limiteRecebido).toBe("100");
  });

  it("sem saidas pendentes a linha nao aparece", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${CONTA}/statement`, () =>
        HttpResponse.json({ items: [], next_cursor: null }),
      ),
    );

    envolverComQuery(<PendingBalanceLine contaId={CONTA} saldo="500.00" />);

    await screen.findByTestId("sem-pendencias");
    expect(screen.queryByText("Em processamento")).not.toBeInTheDocument();
  });
});

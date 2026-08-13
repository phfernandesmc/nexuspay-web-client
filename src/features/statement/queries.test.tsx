import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http as mswHttp, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { servidor, URL_TESTE } from "@/test/msw";
import { criarQueryClient } from "@/app/queryClient";
import { useSession } from "@/features/auth/session.store";
import { usePendentesDeSaida } from "@/features/statement/queries";

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

function envolver({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={criarQueryClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  useSession.setState({
    accessToken: "tok",
    user: null,
    status: "authenticated",
    motivoEncerramento: null,
  });
});

describe("usePendentesDeSaida", () => {
  it("soma em centavos inteiros, sem residuo de ponto flutuante", async () => {
    // 0.10 + 0.20 em ponto flutuante da 0.30000000000000004. Uma asserção
    // de texto formatado (Intl arredonda em 2 casas) não discrimina isso —
    // o residuo morre no arredondamento antes de virar texto. A igualdade
    // estrita sobre o inteiro em centavos, aqui, discrimina.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${CONTA}/statement`, () =>
        HttpResponse.json({
          items: [
            item({ direction: "OUT", status: "PENDING", amount: "0.10" }),
            item({ direction: "OUT", status: "PENDING", amount: "0.20" }),
          ],
          next_cursor: null,
        }),
      ),
    );

    const { result } = renderHook(() => usePendentesDeSaida(CONTA), { wrapper: envolver });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.centavos).toBe(30);
  });
});

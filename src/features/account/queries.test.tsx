import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http as mswHttp, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { servidor, URL_TESTE } from "@/test/msw";
import { criarQueryClient } from "@/app/queryClient";
import { useSession } from "@/features/auth/session.store";
import { useContas, useConta, useInstituicoes, CHAVES } from "@/features/account/queries";

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
  balance: "500.00",
  pending_outgoing: "0.00",
  status: "ACTIVE" as const,
  institution: instituicao,
  created_at: "2026-03-09T14:30:00Z",
};

function envolver({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={criarQueryClient()}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  useSession.setState({
    accessToken: "tok",
    user: null,
    status: "authenticated",
    motivoEncerramento: null,
  });
});

describe("consultas de conta", () => {
  it("as chaves de cache seguem o padrao acordado", () => {
    // A invalidacao depende delas. Mudar uma chave sem mudar a outra ponta
    // deixa o cache velho na tela sem quebrar nada.
    expect(CHAVES.contas()).toEqual(["contas"]);
    expect(CHAVES.conta("x")).toEqual(["conta", "x"]);
    expect(CHAVES.extrato("x")).toEqual(["extrato", "x"]);
    expect(CHAVES.instituicoes()).toEqual(["instituicoes"]);
  });

  it("useContas lista as contas", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([conta])),
    );

    const { result } = renderHook(() => useContas(), { wrapper: envolver });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].alias).toBe("Salario");
  });

  it("useConta busca uma conta", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${conta.id}`, () => HttpResponse.json(conta)),
    );

    const { result } = renderHook(() => useConta(conta.id), { wrapper: envolver });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.branch).toBe("0001");
  });

  it("useInstituicoes lista o catalogo", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/institutions`, () => HttpResponse.json([instituicao])),
    );

    const { result } = renderHook(() => useInstituicoes(), { wrapper: envolver });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].color_hex).toBe("#112233");
  });

  it("conta de outro usuario chega como erro, nao como dado vazio", async () => {
    // O gateway devolve 404 de proposito para conta alheia — um 403
    // confirmaria que o id existe. A consulta precisa refletir isso como
    // erro, para a tela dizer "nao encontrada".
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${conta.id}`, () =>
        HttpResponse.json(
          { error: { code: "ACCOUNT_NOT_FOUND", message: "x", details: {} } },
          { status: 404 },
        ),
      ),
    );

    const { result } = renderHook(() => useConta(conta.id), { wrapper: envolver });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

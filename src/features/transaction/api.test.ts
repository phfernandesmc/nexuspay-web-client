import { describe, it, expect } from "vitest";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { transferir, depositar } from "@/features/transaction/api";

describe("api de transacao", () => {
  it("transferir com resposta 202 devolve criadaAgora: true", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, () => {
        return HttpResponse.json(
          {
            id: "txn-1",
            type: "TRANSFER",
            status: "COMPLETED",
            amount: "10000",
            source_account_id: "src-1",
            destination_account_id: "dst-1",
            failure_reason: null,
            created_at: "2026-08-13T15:00:00Z",
          },
          { status: 202 },
        );
      }),
    );

    const resposta = await transferir(
      {
        source_account_id: "src-1",
        destination_account_id: "dst-1",
        amount: "10000",
      },
      "chave-idempotencia-1",
    );

    expect(resposta.criadaAgora).toBe(true);
    expect(resposta.transacao.id).toBe("txn-1");
  });

  it("transferir com resposta 200 devolve criadaAgora: false", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, () => {
        return HttpResponse.json(
          {
            id: "txn-2",
            type: "TRANSFER",
            status: "COMPLETED",
            amount: "10000",
            source_account_id: "src-1",
            destination_account_id: "dst-1",
            failure_reason: null,
            created_at: "2026-08-13T14:00:00Z",
          },
          { status: 200 },
        );
      }),
    );

    const resposta = await transferir(
      {
        source_account_id: "src-1",
        destination_account_id: "dst-1",
        amount: "10000",
      },
      "chave-idempotencia-1",
    );

    expect(resposta.criadaAgora).toBe(false);
    expect(resposta.transacao.id).toBe("txn-2");
  });

  it("transferir manda o cabeçalho Idempotency-Key com o valor exato", async () => {
    let chaveRecebida: string | null = null;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/transfer`, ({ request }) => {
        chaveRecebida = request.headers.get("Idempotency-Key");
        return HttpResponse.json(
          {
            id: "txn-3",
            type: "TRANSFER",
            status: "COMPLETED",
            amount: "10000",
            source_account_id: "src-1",
            destination_account_id: "dst-1",
            failure_reason: null,
            created_at: "2026-08-13T15:00:00Z",
          },
          { status: 202 },
        );
      }),
    );

    await transferir(
      {
        source_account_id: "src-1",
        destination_account_id: "dst-1",
        amount: "10000",
      },
      "uuid-1234-5678-9abc",
    );

    expect(chaveRecebida).toBe("uuid-1234-5678-9abc");
  });

  it("depositar com resposta 200 devolve criadaAgora: false", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/transactions/deposit`, () => {
        return HttpResponse.json(
          {
            id: "txn-4",
            type: "DEPOSIT",
            status: "COMPLETED",
            amount: "50000",
            source_account_id: null,
            destination_account_id: "dst-1",
            failure_reason: null,
            created_at: "2026-08-13T14:00:00Z",
          },
          { status: 200 },
        );
      }),
    );

    const resposta = await depositar(
      {
        account_id: "dst-1",
        amount: "50000",
      },
      "chave-idempotencia-2",
    );

    expect(resposta.criadaAgora).toBe(false);
    expect(resposta.transacao.id).toBe("txn-4");
  });
});

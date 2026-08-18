import { describe, it, expect } from "vitest";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { buscarContaPorDados, salvarContato } from "@/features/contact/api";

describe("api de contato", () => {
  it("manda os tres campos da busca no corpo", async () => {
    let corpoRecebido: unknown = null;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/contacts/lookup`, async ({ request }) => {
        corpoRecebido = await request.json();
        return HttpResponse.json({
          account_id: "conta-1",
          holder_name: "M**** S****",
          type: "CHECKING",
          institution: { id: "inst-1", code: "001", name: "Banco Um", color_hex: "#112233" },
        });
      }),
    );

    const achada = await buscarContaPorDados({
      institution_id: "inst-1",
      branch: "0001",
      number: "12345678",
    });

    expect(corpoRecebido).toEqual({
      institution_id: "inst-1",
      branch: "0001",
      number: "12345678",
    });
    expect(achada.holder_name).toBe("M**** S****");
  });

  it("salva o contato com o account_id que a busca devolveu, nao com os dados da busca", async () => {
    // Esta e a razao do fluxo de dois passos existir: o gateway so aceita
    // account_id, e ele so vem do lookup. Mandar branch/number aqui seria
    // 422, e o teste falha se alguem tentar pular o primeiro passo.
    let corpoRecebido: unknown = null;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/contacts`, async ({ request }) => {
        corpoRecebido = await request.json();
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    await salvarContato({ account_id: "conta-1", alias: "Maria", is_favorite: false });

    expect(corpoRecebido).toEqual({
      account_id: "conta-1",
      alias: "Maria",
      is_favorite: false,
    });
  });
});

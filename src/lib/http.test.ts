import { describe, it, expect, beforeEach } from "vitest";
import { http } from "@/lib/http";
import { servidor, URL_TESTE } from "@/test/msw";
import { useSession } from "@/features/auth/session.store";
import { http as mswHttp, HttpResponse } from "msw";

const usuario = {
  id: "11111111-1111-1111-1111-111111111111",
  full_name: "Joao Silva",
  email: "joao@example.com",
  document: "39053344705",
  created_at: "2026-08-12T00:00:00Z",
};

function envelope(code: string) {
  return { error: { code, message: "x", details: {} } };
}

beforeEach(() => {
  useSession.setState({ accessToken: "expirado", user: usuario, status: "authenticated" });
});

describe("cliente http", () => {
  it("anexa o token do store no cabecalho", async () => {
    useSession.getState().definirToken("tok-abc");
    let recebido: string | null = null;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, ({ request }) => {
        recebido = request.headers.get("authorization");
        return HttpResponse.json([]);
      }),
    );

    await http.get("/accounts");

    expect(recebido).toBe("Bearer tok-abc");
  });

  it("renova e repete quando o token expirou", async () => {
    let jaFalhou = false;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ access_token: "tok-novo", token_type: "bearer", expires_in: 900 }),
      ),
      mswHttp.get(`${URL_TESTE}/accounts`, ({ request }) => {
        if (!jaFalhou) {
          jaFalhou = true;
          return HttpResponse.json(envelope("TOKEN_EXPIRED"), { status: 401 });
        }
        return HttpResponse.json([{ ok: request.headers.get("authorization") }]);
      }),
    );

    const resposta = await http.get("/accounts");

    expect(resposta.data[0].ok).toBe("Bearer tok-novo");
    expect(useSession.getState().accessToken).toBe("tok-novo");
  });

  it("VARIAS requisicoes concorrentes disparam UM UNICO refresh", async () => {
    // ESTE E O TESTE MAIS IMPORTANTE DA FATIA.
    //
    // O gateway rotaciona o refresh token e detecta reuso revogando TODAS as
    // sessoes. Dois /auth/refresh concorrentes, disparados pelo proprio
    // cliente, deslogam o usuario de tudo. E duas requisicoes em paralelo
    // tomando 401 ao mesmo tempo e o caso NORMAL de qualquer tela que
    // carregue mais de um recurso.
    let refreshes = 0;
    const expirados = new Set<string>();
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, async () => {
        refreshes += 1;
        await new Promise((r) => setTimeout(r, 20));
        return HttpResponse.json({ access_token: "tok-novo", token_type: "bearer", expires_in: 900 });
      }),
      mswHttp.get(`${URL_TESTE}/r/:id`, ({ params, request }) => {
        const id = String(params.id);
        if (!expirados.has(id)) {
          expirados.add(id);
          return HttpResponse.json(envelope("TOKEN_EXPIRED"), { status: 401 });
        }
        return HttpResponse.json({ id, auth: request.headers.get("authorization") });
      }),
    );

    const respostas = await Promise.all([
      http.get("/r/1"),
      http.get("/r/2"),
      http.get("/r/3"),
      http.get("/r/4"),
    ]);

    expect(refreshes).toBe(1);
    for (const r of respostas) {
      expect(r.data.auth).toBe("Bearer tok-novo");
    }
  });

  it("nao entra em laco quando a repeticao tambem toma 401", async () => {
    let chamadas = 0;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ access_token: "tok-novo", token_type: "bearer", expires_in: 900 }),
      ),
      mswHttp.get(`${URL_TESTE}/accounts`, () => {
        chamadas += 1;
        return HttpResponse.json(envelope("TOKEN_EXPIRED"), { status: 401 });
      }),
    );

    await expect(http.get("/accounts")).rejects.toBeDefined();
    // uma original e uma unica repeticao — nunca mais que isso
    expect(chamadas).toBe(2);
  });

  it("refresh que falha encerra a sessao", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json(envelope("INVALID_TOKEN"), { status: 401 }),
      ),
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json(envelope("TOKEN_EXPIRED"), { status: 401 }),
      ),
    );

    await expect(http.get("/accounts")).rejects.toBeDefined();
    expect(useSession.getState().status).toBe("anonymous");
  });

  it("REFRESH_TOKEN_REUSED encerra a sessao imediatamente, sem tentar renovar", async () => {
    let refreshes = 0;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json({ access_token: "x", token_type: "bearer", expires_in: 900 });
      }),
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json(envelope("REFRESH_TOKEN_REUSED"), { status: 401 }),
      ),
    );

    await expect(http.get("/accounts")).rejects.toBeDefined();
    expect(refreshes).toBe(0);
    expect(useSession.getState().status).toBe("anonymous");
  });

  it("401 que nao e de token nao dispara renovacao", async () => {
    let refreshes = 0;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json({ access_token: "x", token_type: "bearer", expires_in: 900 });
      }),
      mswHttp.post(`${URL_TESTE}/auth/login`, () =>
        HttpResponse.json(envelope("INVALID_CREDENTIALS"), { status: 401 }),
      ),
    );

    await expect(http.post("/auth/login", {})).rejects.toBeDefined();
    // Senha errada nao e sessao expirada. Renovar aqui seria gastar o refresh
    // token a cada tentativa de login malsucedida.
    expect(refreshes).toBe(0);
    // Errar a senha nao pode deslogar quem ja estava autenticado noutra aba.
    expect(useSession.getState().status).toBe("authenticated");
  });

  it("erro na requisicao repetida nao encerra a sessao quando a renovacao deu certo", async () => {
    // Achado 1 da revisao: o catch original envolvia renovar() E a
    // repeticao. Um 500 na repeticao (nada a ver com autenticacao) nao pode
    // derrubar uma sessao que acabou de renovar um token valido, nem
    // mascarar o 500 atras do 401 original.
    let chamadas = 0;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ access_token: "tok-novo", token_type: "bearer", expires_in: 900 }),
      ),
      mswHttp.get(`${URL_TESTE}/accounts`, () => {
        chamadas += 1;
        if (chamadas === 1) {
          return HttpResponse.json(envelope("TOKEN_EXPIRED"), { status: 401 });
        }
        return HttpResponse.json(envelope("INTERNAL_ERROR"), { status: 500 });
      }),
    );

    const erro = await http.get("/accounts").catch((e) => e);

    expect(erro.response.status).toBe(500);
    expect(useSession.getState().status).toBe("authenticated");
    expect(useSession.getState().accessToken).toBe("tok-novo");
  });

  it("limpa a renovacao em voo mesmo quando o refresh falha, permitindo nova tentativa depois", async () => {
    // Achado 2 (1o ponto): se a limpeza so acontecesse no `.then` (sucesso),
    // uma renovacao que falhou deixaria a promessa rejeitada presa em
    // `renovacaoEmVoo` para sempre, e a proxima tentativa nunca chegaria a
    // chamar /auth/refresh de novo.
    let tentativas = 0;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () => {
        tentativas += 1;
        if (tentativas === 1) {
          return HttpResponse.json(envelope("INVALID_TOKEN"), { status: 401 });
        }
        return HttpResponse.json({ access_token: "tok-novo", token_type: "bearer", expires_in: 900 });
      }),
      mswHttp.get(`${URL_TESTE}/accounts`, ({ request }) => {
        const auth = request.headers.get("authorization");
        if (auth === "Bearer tok-novo") {
          return HttpResponse.json([{ ok: auth }]);
        }
        return HttpResponse.json(envelope("TOKEN_EXPIRED"), { status: 401 });
      }),
    );

    await expect(http.get("/accounts")).rejects.toBeDefined();
    expect(useSession.getState().status).toBe("anonymous");
    expect(tentativas).toBe(1);

    useSession.setState({ accessToken: "expirado-de-novo", user: usuario, status: "authenticated" });
    const resposta = await http.get("/accounts");

    expect(tentativas).toBe(2);
    expect(resposta.data[0].ok).toBe("Bearer tok-novo");
  });

  it("refresh que devolve 401 e chamado uma unica vez, sem recursao", async () => {
    let refreshes = 0;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json(envelope("TOKEN_EXPIRED"), { status: 401 });
      }),
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json(envelope("TOKEN_EXPIRED"), { status: 401 }),
      ),
    );

    await expect(http.get("/accounts")).rejects.toBeDefined();
    expect(refreshes).toBe(1);
  });

  it("chama /auth/refresh pela instancia crua, sem o interceptor de requisicao de `http`", async () => {
    // Achado 2 (2o ponto). A contagem de chamadas ao /auth/refresh sozinha
    // nao distingue instancia crua de `http`: o filtro de url em
    // `renovavel` (!requisicao.url?.includes("/auth/refresh")) ja impede
    // que a PROPRIA chamada de refresh dispare uma nova renovacao,
    // independente de qual instancia axios a fez. O sinal observavel real
    // de "instancia crua" e o cabecalho: so a instancia `http` tem o
    // interceptor de requisicao que anexa Authorization a partir do store.
    let authNoRefresh: string | null | undefined;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, ({ request }) => {
        authNoRefresh = request.headers.get("authorization");
        return HttpResponse.json({ access_token: "tok-novo", token_type: "bearer", expires_in: 900 });
      }),
      mswHttp.get(`${URL_TESTE}/accounts`, ({ request }) => {
        if (request.headers.get("authorization") === "Bearer tok-novo") {
          return HttpResponse.json([{ ok: true }]);
        }
        return HttpResponse.json(envelope("TOKEN_EXPIRED"), { status: 401 });
      }),
    );

    await http.get("/accounts");

    expect(authNoRefresh).toBeNull();
  });

  it("withCredentials esta ligado, senao o cookie httpOnly de refresh nao viaja", () => {
    // Achado 2 (3o ponto).
    expect(http.defaults.withCredentials).toBe(true);
  });
});

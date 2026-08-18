import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { useSession } from "@/features/auth/session.store";
import { http as clienteHttp } from "@/lib/http";
import { criarQueryClient } from "@/app/queryClient";
import App from "@/App";
import i18n from "@/app/i18n";

const usuario = {
  id: "11111111-1111-1111-1111-111111111111",
  full_name: "Joao Silva",
  email: "joao@example.com",
  document: "39053344705",
  created_at: "2026-08-12T00:00:00Z",
};

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({
    accessToken: null,
    user: null,
    status: "booting",
    motivoEncerramento: null,
  });
  window.history.pushState({}, "", "/");
});

describe("roteamento", () => {
  it("em booting mostra tela neutra, NUNCA o login", async () => {
    let liberar: (() => void) | null = null;
    const espera = new Promise<void>((r) => (liberar = r));
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, async () => {
        await espera;
        return HttpResponse.json({ access_token: "tok", token_type: "bearer", expires_in: 900 });
      }),
      mswHttp.get(`${URL_TESTE}/auth/me`, () => HttpResponse.json(usuario)),
    );

    render(<App />);

    // Este e o defeito classico da arquitetura: piscar o login para quem
    // esta autenticado. Nao aparece em desenvolvimento, so com rede lenta.
    expect(screen.queryByText("Entrar na sua conta")).not.toBeInTheDocument();
    expect(screen.getByText("Carregando")).toBeInTheDocument();

    liberar!();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Início" })).toBeInTheDocument());
  });

  it("sem sessao leva ao login", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ error: { code: "INVALID_TOKEN", message: "x", details: {} } }, { status: 401 }),
      ),
    );

    render(<App />);

    expect(await screen.findByText("Entrar na sua conta")).toBeInTheDocument();
  });

  it("trocar o idioma troca o texto visivel", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ access_token: "tok", token_type: "bearer", expires_in: 900 }),
      ),
      mswHttp.get(`${URL_TESTE}/auth/me`, () => HttpResponse.json(usuario)),
    );

    render(<App />);
    await screen.findByRole("heading", { name: "Início" });

    await userEvent.selectOptions(screen.getByLabelText("Idioma"), "en");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument());
  });

  it("sair revoga a sessao NO SERVIDOR e volta ao login", async () => {
    // As duas metades importam, e so uma delas era testada. Voltar ao login
    // e o status anonymous vem do encerrar() LOCAL: o teste passava com a
    // chamada ao servidor removida. Sem a chamada, o refresh token continua
    // valido por 7 dias no gateway e a sessao nao foi revogada de verdade —
    // que e o criterio de aceitacao 11.
    let logouts = 0;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ access_token: "tok", token_type: "bearer", expires_in: 900 }),
      ),
      mswHttp.get(`${URL_TESTE}/auth/me`, () => HttpResponse.json(usuario)),
      mswHttp.post(`${URL_TESTE}/auth/logout`, () => {
        logouts += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    render(<App />);
    await screen.findByRole("heading", { name: "Início" });

    await userEvent.click(screen.getByRole("button", { name: "Sair" }));

    expect(await screen.findByText("Entrar na sua conta")).toBeInTheDocument();
    expect(useSession.getState().status).toBe("anonymous");
    expect(logouts).toBe(1);
  });

  it("sair pelo botao nao mostra mensagem de erro no login", async () => {
    // O motivo de encerramento existe para REFRESH_TOKEN_REUSED. Sair por
    // vontade propria nao e um evento a explicar, e um alerta vermelho ali
    // faria o logout normal parecer falha.
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ access_token: "tok", token_type: "bearer", expires_in: 900 }),
      ),
      mswHttp.get(`${URL_TESTE}/auth/me`, () => HttpResponse.json(usuario)),
      mswHttp.post(`${URL_TESTE}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
    );

    render(<App />);
    await screen.findByRole("heading", { name: "Início" });

    await userEvent.click(screen.getByRole("button", { name: "Sair" }));

    expect(await screen.findByText("Entrar na sua conta")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("REFRESH_TOKEN_REUSED desloga MOSTRANDO por que, nao em silencio", async () => {
    // O caminho inteiro, do interceptor ate o pixel: o gateway responde que
    // um refresh token ja rotacionado foi reapresentado (o que pode ser
    // roubo de token), o interceptor encerra a sessao, o router monta a
    // LoginPage do zero — e o usuario precisa ler a explicacao. Sem canal, a
    // tela de erro dela nasce null e o usuario e jogado no login sem nada,
    // o que e indistinguivel de um bug do app.
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ access_token: "tok", token_type: "bearer", expires_in: 900 }),
      ),
      mswHttp.get(`${URL_TESTE}/auth/me`, () => HttpResponse.json(usuario)),
      mswHttp.get(`${URL_TESTE}/accounts`, () =>
        HttpResponse.json(
          { error: { code: "REFRESH_TOKEN_REUSED", message: "x", details: {} } },
          { status: 401 },
        ),
      ),
    );

    render(<App />);
    await screen.findByRole("heading", { name: "Início" });

    // Uma requisicao qualquer da aplicacao autenticada tomando a revogacao.
    await expect(clienteHttp.get("/accounts")).rejects.toBeDefined();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Por segurança, todas as suas sessões foram encerradas. Entre novamente.",
    );
    expect(useSession.getState().status).toBe("anonymous");
  });
});

describe("rotas de conta e dinheiro", () => {
  // Estas duas rotas consomem react-query (useContas/useConta), que o
  // App sozinho nao provisiona — em producao quem envolve e main.tsx. Sem
  // este provider aqui, montar cai no erro "No QueryClient set".
  function montarAutenticado() {
    return render(
      <QueryClientProvider client={criarQueryClient()}>
        <App />
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ access_token: "tok", token_type: "bearer", expires_in: 900 }),
      ),
      mswHttp.get(`${URL_TESTE}/auth/me`, () => HttpResponse.json(usuario)),
    );
  });

  it("navegar para /contas mostra o titulo da lista", async () => {
    window.history.pushState({}, "", "/contas");
    servidor.use(mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([])));

    montarAutenticado();

    expect(await screen.findByRole("heading", { name: "Suas contas" })).toBeInTheDocument();
  });

  it("/contas/:id inexistente mostra a mensagem de nao encontrada", async () => {
    const idInexistente = "00000000-0000-0000-0000-000000000000";
    window.history.pushState({}, "", `/contas/${idInexistente}`);
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts/${idInexistente}`, () =>
        HttpResponse.json(
          { error: { code: "ACCOUNT_NOT_FOUND", message: "x", details: {} } },
          { status: 404 },
        ),
      ),
    );

    montarAutenticado();

    expect(await screen.findByRole("alert")).toHaveTextContent("Conta não encontrada.");
  });

  it("a rota /transferir monta a tela de transferencia", async () => {
    window.history.pushState({}, "", "/transferir");
    servidor.use(
      mswHttp.get(`${URL_TESTE}/accounts`, () => HttpResponse.json([])),
      mswHttp.get(`${URL_TESTE}/contacts`, () => HttpResponse.json([])),
    );

    montarAutenticado();

    expect(await screen.findByRole("heading", { name: "Transferir" })).toBeInTheDocument();
  });

  it("a rota /transacoes/:id monta o comprovante", async () => {
    window.history.pushState({}, "", "/transacoes/tx-1");
    servidor.use(
      mswHttp.get(`${URL_TESTE}/transactions/tx-1`, () =>
        HttpResponse.json({
          id: "tx-1",
          type: "TRANSFER",
          status: "COMPLETED",
          amount: "10.00",
          source_account_id: "conta-1",
          destination_account_id: "conta-2",
          failure_reason: null,
          created_at: "2026-03-09T14:30:00Z",
        }),
      ),
    );

    montarAutenticado();

    expect(await screen.findByRole("heading", { name: "Comprovante" })).toBeInTheDocument();
  });
});

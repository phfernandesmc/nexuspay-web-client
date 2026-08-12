import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { useSession } from "@/features/auth/session.store";
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
  useSession.setState({ accessToken: null, user: null, status: "booting" });
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

  it("sair revoga a sessao e volta ao login", async () => {
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
    expect(useSession.getState().status).toBe("anonymous");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { useSession } from "@/features/auth/session.store";
import LoginPage from "@/features/auth/LoginPage";
import i18n from "@/app/i18n";

const usuario = {
  id: "11111111-1111-1111-1111-111111111111",
  full_name: "Joao Silva",
  email: "joao@example.com",
  document: "39053344705",
  created_at: "2026-08-12T00:00:00Z",
};

function montar() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({ accessToken: null, user: null, status: "anonymous" });
});

describe("tela de login", () => {
  it("credencial correta autentica", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/login`, () =>
        HttpResponse.json({ access_token: "tok", token_type: "bearer", expires_in: 900 }),
      ),
      mswHttp.get(`${URL_TESTE}/auth/me`, () => HttpResponse.json(usuario)),
    );
    montar();

    await userEvent.type(screen.getByLabelText("E-mail"), "joao@example.com");
    await userEvent.type(screen.getByLabelText("Senha"), "senha123");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(useSession.getState().status).toBe("authenticated");
  });

  it("credencial errada mostra a mensagem traduzida, nao a do servidor", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/login`, () =>
        HttpResponse.json(
          { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password", details: {} } },
          { status: 401 },
        ),
      ),
    );
    montar();

    await userEvent.type(screen.getByLabelText("E-mail"), "joao@example.com");
    await userEvent.type(screen.getByLabelText("Senha"), "errada");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("E-mail ou senha incorretos.");
    // A mensagem do servidor esta em ingles e nao e contrato.
    expect(screen.queryByText("Invalid email or password")).not.toBeInTheDocument();
  });

  it("limite de tentativas tem mensagem propria, nao a generica", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/login`, () =>
        HttpResponse.json(
          { error: { code: "RATE_LIMIT_EXCEEDED", message: "x", details: {} } },
          { status: 429 },
        ),
      ),
    );
    montar();

    await userEvent.type(screen.getByLabelText("E-mail"), "joao@example.com");
    await userEvent.type(screen.getByLabelText("Senha"), "senha123");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    // O limite e 5/minuto e e atingido por quem so errou a senha algumas
    // vezes — o caso mais comum de todos.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tentativas demais. Espere um minuto e tente de novo.",
    );
  });
});

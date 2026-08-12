import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { useSession } from "@/features/auth/session.store";
import RegisterPage from "@/features/auth/RegisterPage";
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
      <RegisterPage />
    </MemoryRouter>,
  );
}

async function preencher() {
  await userEvent.type(screen.getByLabelText("Nome completo"), "Joao Silva");
  await userEvent.type(screen.getByLabelText("E-mail"), "joao@example.com");
  await userEvent.type(screen.getByLabelText("CPF"), "39053344705");
  await userEvent.type(screen.getByLabelText("Senha"), "senha123");
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({ accessToken: null, user: null, status: "anonymous" });
});

describe("tela de registro", () => {
  it("registrar autentica direto, sem passar pelo login", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/register`, () =>
        HttpResponse.json(
          { access_token: "tok", token_type: "bearer", expires_in: 900, user: usuario },
          { status: 201 },
        ),
      ),
    );
    montar();
    await preencher();

    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    // A rota ja devolve token e seta o cookie — nao ha segundo passo.
    expect(await screen.findByRole("button", { name: "Criar conta" })).toBeInTheDocument();
    expect(useSession.getState().status).toBe("authenticated");
  });

  it("CPF ja cadastrado mostra a mensagem certa", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/register`, () =>
        HttpResponse.json(
          { error: { code: "DOCUMENT_ALREADY_REGISTERED", message: "x", details: {} } },
          { status: 409 },
        ),
      ),
    );
    montar();
    await preencher();

    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Este CPF já está cadastrado.");
  });

  it("VALIDATION_ERROR marca o campo apontado pelo servidor", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/register`, () =>
        HttpResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "x",
              details: { fields: [{ field: "document", reason: "não é um CPF válido" }] },
            },
          },
          { status: 422 },
        ),
      ),
    );
    montar();
    await preencher();

    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByText("não é um CPF válido")).toBeInTheDocument();
  });
});

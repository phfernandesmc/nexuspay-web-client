import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
  useSession.setState({
    accessToken: null,
    user: null,
    status: "anonymous",
    motivoEncerramento: null,
  });
});

afterEach(() => vi.restoreAllMocks());

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

  it("VALIDATION_ERROR marca o campo apontado pelo servidor, com texto NOSSO", async () => {
    // A `reason` do servidor nao tem idioma e nao e contrato — se o gateway
    // responder "value is not a valid CPF", e isso que o usuario brasileiro
    // leria. Ela vai para o console; a tela recebe a traducao por codigo.
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/register`, () =>
        HttpResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "x",
              details: { fields: [{ field: "document", reason: "value is not a valid CPF" }] },
            },
          },
          { status: 422 },
        ),
      ),
    );
    montar();
    await preencher();

    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    const marcado = await screen.findByText("Confira os campos destacados.");
    expect(marcado).toHaveAttribute("id", "document-erro");
    expect(screen.queryByText("value is not a valid CPF")).not.toBeInTheDocument();
    expect(aviso).toHaveBeenCalledWith(
      expect.stringContaining("value is not a valid CPF"),
    );
  });

  it("VALIDATION_ERROR com campo que o formulario nao tem cai no alerta generico", async () => {
    // "body.document" e o formato comum do FastAPI. Antes, o setError nao
    // marcava nada e o return antecipado pulava o alerta: clicar em Criar
    // conta nao produzia efeito NENHUM, e a tela ficava morta.
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/register`, () =>
        HttpResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "x",
              details: { fields: [{ field: "body.document", reason: "invalid" }] },
            },
          },
          { status: 422 },
        ),
      ),
    );
    montar();
    await preencher();

    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Confira os campos destacados.");
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining("body.document"));
  });

  it("codigo FORA do catalogo mostra a mensagem generica, nunca o codigo cru", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/register`, () =>
        HttpResponse.json(
          { error: { code: "HTTP_502", message: "Bad Gateway", details: {} } },
          { status: 502 },
        ),
      ),
    );
    montar();
    await preencher();

    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Algo deu errado. Tente novamente.",
    );
    expect(screen.queryByText(/HTTP_502/)).not.toBeInTheDocument();
    expect(aviso).toHaveBeenCalledOnce();
  });

  it("mensagem do zod vem traduzida, nao em jargao de biblioteca", async () => {
    montar();
    await userEvent.type(screen.getByLabelText("Nome completo"), "Joao Silva");
    await userEvent.type(screen.getByLabelText("E-mail"), "joao@example.com");
    await userEvent.type(screen.getByLabelText("CPF"), "123");
    await userEvent.type(screen.getByLabelText("Senha"), "senha123");

    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByText("O CPF precisa ter 11 dígitos.")).toBeInTheDocument();
    expect(screen.queryByText(/Too small/i)).not.toBeInTheDocument();
  });
});

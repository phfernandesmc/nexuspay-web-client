import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
  useSession.setState({
    accessToken: null,
    user: null,
    status: "anonymous",
    motivoEncerramento: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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

  it("codigo FORA do catalogo mostra a mensagem generica, nunca o codigo cru", async () => {
    // A familia HTTP_<status> nao e enumeravel — o gateway a emite para
    // qualquer status sem codigo proprio — e o spec a define como o caso
    // legitimo da mensagem generica. Passar o codigo cru para o t() faz o
    // i18next devolver a PROPRIA CHAVE, e o usuario le "HTTP_502" na tela.
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/login`, () =>
        HttpResponse.json(
          { error: { code: "HTTP_502", message: "Bad Gateway", details: {} } },
          { status: 502 },
        ),
      ),
    );
    montar();

    await userEvent.type(screen.getByLabelText("E-mail"), "joao@example.com");
    await userEvent.type(screen.getByLabelText("Senha"), "senha123");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Algo deu errado. Tente novamente.",
    );
    expect(screen.queryByText(/HTTP_502/)).not.toBeInTheDocument();
    // A divergencia com o gateway precisa APARECER para quem desenvolve.
    expect(aviso).toHaveBeenCalledOnce();
  });

  it("e-mail que o zod recusa mostra o erro traduzido, em vez de botao mudo", async () => {
    // Sem renderizar formState.errors o submit nunca acontece e nada muda na
    // tela: o botao fica mudo para sempre, e o usuario nao tem como saber
    // por que. As mensagens tambem nao podem vir do zod cru, que fala
    // ingles e jargao de biblioteca.
    montar();

    await userEvent.type(screen.getByLabelText("E-mail"), "nao-e-email");
    await userEvent.type(screen.getByLabelText("Senha"), "senha123");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Informe um e-mail válido.")).toBeInTheDocument();
    expect(useSession.getState().status).toBe("anonymous");
  });

  it("mostra o motivo do encerramento deixado pelo interceptor", async () => {
    // REFRESH_TOKEN_REUSED encerra a sessao fora de qualquer componente, e o
    // router monta esta tela do zero. Sem o canal do store o usuario e
    // jogado no login sem explicacao — indistinguivel de um bug do app, num
    // evento que pode ser roubo de token.
    useSession.setState({ motivoEncerramento: "REFRESH_TOKEN_REUSED" });

    montar();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Por segurança, todas as suas sessões foram encerradas. Entre novamente.",
    );
    // Consumido uma unica vez: nao pode reaparecer no proximo login.
    expect(useSession.getState().motivoEncerramento).toBeNull();
  });

  it("o botao Mostrar revela e esconde a senha", async () => {
    // A senha nasce mascarada e precisa voltar a ser mascarada: um toggle
    // que so abre deixa a senha exposta na tela depois que o usuario ja
    // conferiu o que digitou.
    montar();
    const usuarioTeclado = userEvent.setup();
    const senha = screen.getByLabelText("Senha");
    expect(senha).toHaveAttribute("type", "password");

    await usuarioTeclado.click(screen.getByRole("button", { name: "Mostrar" }));
    expect(senha).toHaveAttribute("type", "text");

    await usuarioTeclado.click(screen.getByRole("button", { name: "Esconder" }));
    expect(senha).toHaveAttribute("type", "password");
  });

  it("o botao de demo entra com as credenciais da conta semeada", async () => {
    vi.stubEnv("VITE_DEMO_EMAIL", "joao@example.com");
    vi.stubEnv("VITE_DEMO_PASSWORD", "senha123");

    let enviado: unknown = null;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/login`, async ({ request }) => {
        enviado = await request.json();
        return HttpResponse.json({ access_token: "tok", token_type: "bearer", expires_in: 900 });
      }),
      mswHttp.get(`${URL_TESTE}/auth/me`, () => HttpResponse.json(usuario)),
    );
    montar();

    await userEvent.click(screen.getByRole("button", { name: "Entrar com a conta demo" }));

    // Afirma o que foi ENVIADO, nao so que autenticou: um botao que entra
    // com o formulario vazio tambem deixaria o status "authenticated" se o
    // servidor fosse permissivo.
    await waitFor(() => expect(useSession.getState().status).toBe("authenticated"));
    expect(enviado).toEqual({ email: "joao@example.com", password: "senha123" });
  });

  it("sem as variaveis de demo o botao NAO existe", () => {
    // Esta e a metade que protege o resto. O sintoma de uma falha aqui e um
    // botao a MAIS — acesso sem senha a uma conta, aparecendo num ambiente
    // que nunca pediu por ele. Ninguem repara num botao sobrando.
    //
    // As variaveis sao zeradas EXPLICITAMENTE, e nao deixadas por conta do
    // ambiente: o Vite carrega o .env local tambem nos testes, entao um
    // desenvolvedor que ligue a demo na propria maquina fazia este teste
    // quebrar — e, pior, ele passaria no CI escondendo isso. Um teste cujo
    // resultado depende de arquivo nao versionado nao prova nada.
    vi.stubEnv("VITE_DEMO_EMAIL", "");
    vi.stubEnv("VITE_DEMO_PASSWORD", "");

    montar();

    expect(screen.queryByRole("button", { name: "Entrar com a conta demo" })).toBeNull();
  });
});

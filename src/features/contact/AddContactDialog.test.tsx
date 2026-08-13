import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import AddContactDialog from "@/features/contact/AddContactDialog";
import i18n from "@/app/i18n";

const instituicao = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  code: "001",
  name: "Banco Um",
  color_hex: "#112233",
};

const achada = {
  account_id: "cccccccc-0000-0000-0000-000000000001",
  holder_name: "M**** S****",
  type: "CHECKING",
  institution: instituicao,
};

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({
    accessToken: "tok",
    user: null,
    status: "authenticated",
    motivoEncerramento: null,
  });
  servidor.use(
    mswHttp.get(`${URL_TESTE}/institutions`, () => HttpResponse.json([instituicao])),
  );
});

async function preencherBusca() {
  const usuario = userEvent.setup();
  await screen.findByRole("option", { name: instituicao.name });
  await usuario.selectOptions(screen.getByLabelText("Instituição"), instituicao.id);
  await usuario.type(screen.getByLabelText("Agência"), "0001");
  await usuario.type(screen.getByLabelText("Número da conta"), "12345678");
  await usuario.click(screen.getByRole("button", { name: "Buscar" }));
  return usuario;
}

describe("adicionar contato", () => {
  it("mostra o titular ANTES de gravar qualquer coisa", async () => {
    // O passo de confirmacao e a unica protecao do usuario contra mandar
    // dinheiro para a conta errada. Se a gravacao acontecesse junto com a
    // busca, ele nunca veria o nome.
    let gravou = false;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/contacts/lookup`, () => HttpResponse.json(achada)),
      mswHttp.post(`${URL_TESTE}/contacts`, () => {
        gravou = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    envolverComQuery(<AddContactDialog aberto onFechar={() => {}} />);
    await preencherBusca();

    expect(await screen.findByText(/M\*{4} S\*{4}/)).toBeInTheDocument();
    expect(gravou).toBe(false);
  });

  it("salva com o account_id da busca depois da confirmacao", async () => {
    let corpo: unknown = null;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/contacts/lookup`, () => HttpResponse.json(achada)),
      mswHttp.post(`${URL_TESTE}/contacts`, async ({ request }) => {
        corpo = await request.json();
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    envolverComQuery(<AddContactDialog aberto onFechar={() => {}} />);
    const usuario = await preencherBusca();

    await screen.findByText(/M\*{4} S\*{4}/);
    await usuario.type(screen.getByLabelText("Apelido"), "Maria");
    await usuario.click(screen.getByRole("button", { name: "Salvar contato" }));

    await waitFor(() =>
      expect(corpo).toEqual({
        account_id: achada.account_id,
        alias: "Maria",
        is_favorite: false,
      }),
    );
  });

  it("salvar a propria conta mostra a mensagem propria, traduzida", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/contacts/lookup`, () => HttpResponse.json(achada)),
      mswHttp.post(`${URL_TESTE}/contacts`, () =>
        HttpResponse.json(
          { error: { code: "CONTACT_OWN_ACCOUNT", message: "nao use isto", details: {} } },
          { status: 422 },
        ),
      ),
    );

    envolverComQuery(<AddContactDialog aberto onFechar={() => {}} />);
    const usuario = await preencherBusca();

    await screen.findByText(/M\*{4} S\*{4}/);
    await usuario.type(screen.getByLabelText("Apelido"), "Eu mesmo");
    await usuario.click(screen.getByRole("button", { name: "Salvar contato" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(i18n.t("CONTACT_OWN_ACCOUNT", { ns: "errors" }));
    // A mensagem do servidor nunca aparece na tela.
    expect(alerta).not.toHaveTextContent("nao use isto");
  });

  it("contato duplicado mostra mensagem DISTINTA da de conta propria", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/contacts/lookup`, () => HttpResponse.json(achada)),
      mswHttp.post(`${URL_TESTE}/contacts`, () =>
        HttpResponse.json(
          { error: { code: "CONTACT_ALREADY_EXISTS", message: "", details: {} } },
          { status: 409 },
        ),
      ),
    );

    envolverComQuery(<AddContactDialog aberto onFechar={() => {}} />);
    const usuario = await preencherBusca();

    await screen.findByText(/M\*{4} S\*{4}/);
    await usuario.type(screen.getByLabelText("Apelido"), "Maria");
    await usuario.click(screen.getByRole("button", { name: "Salvar contato" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(i18n.t("CONTACT_ALREADY_EXISTS", { ns: "errors" }));
    expect(alerta).not.toHaveTextContent(i18n.t("CONTACT_OWN_ACCOUNT", { ns: "errors" }));
  });

  it("conta inexistente na busca mostra o erro e nao avanca para a confirmacao", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/contacts/lookup`, () =>
        HttpResponse.json(
          { error: { code: "ACCOUNT_NOT_FOUND", message: "", details: {} } },
          { status: 404 },
        ),
      ),
    );

    envolverComQuery(<AddContactDialog aberto onFechar={() => {}} />);
    await preencherBusca();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("ACCOUNT_NOT_FOUND", { ns: "errors" }),
    );
    expect(screen.queryByLabelText("Apelido")).not.toBeInTheDocument();
  });
});

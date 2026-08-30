import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { envolverComQuery } from "@/test/queryWrapper";
import { useSession } from "@/features/auth/session.store";
import ContactsPage from "@/features/contact/ContactsPage";
import i18n from "@/app/i18n";

const instituicao = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  code: "001",
  name: "Banco Um",
  color_hex: "#112233",
};

function contato(id: string, alias: string, favorito: boolean) {
  return {
    id,
    alias,
    is_favorite: favorito,
    target_account: {
      id: `conta-${id}`,
      branch: "0001",
      number: "12345678-9",
      holder_name: "M**** S****",
      type: "CHECKING",
      status: "ACTIVE",
      institution: instituicao,
    },
    created_at: "2026-03-09T14:30:00Z",
  };
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({
    accessToken: "tok",
    user: null,
    status: "authenticated",
    motivoEncerramento: null,
  });
});

describe("lista de contatos", () => {
  it("mostra favoritos PRIMEIRO, mesmo quando o servidor devolve fora de ordem", async () => {
    // O gateway nao promete ordem. Este teste falha se alguem simplesmente
    // renderizar a lista na ordem em que ela chegou.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/contacts`, () =>
        HttpResponse.json([
          contato("1", "Ana", false),
          contato("2", "Bruno", true),
        ]),
      ),
    );

    envolverComQuery(<ContactsPage />);

    await screen.findByText("Bruno");
    const linhas = screen.getAllByRole("listitem");
    expect(within(linhas[0]).getByText("Bruno")).toBeInTheDocument();
    expect(within(linhas[1]).getByText("Ana")).toBeInTheDocument();
  });

  it("mostra o estado vazio proprio", async () => {
    servidor.use(mswHttp.get(`${URL_TESTE}/contacts`, () => HttpResponse.json([])));

    envolverComQuery(<ContactsPage />);

    expect(await screen.findByText("Você ainda não tem contatos.")).toBeInTheDocument();
  });

  it("favoritar REFAZ a lista", async () => {
    // Sem a invalidacao o PATCH acontece no servidor e a tela continua
    // mostrando o estado anterior.
    let favorito = false;
    let listagens = 0;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/contacts`, () => {
        listagens += 1;
        return HttpResponse.json([contato("1", "Ana", favorito)]);
      }),
      mswHttp.patch(`${URL_TESTE}/contacts/1`, async ({ request }) => {
        const corpo = (await request.json()) as { is_favorite?: boolean };
        favorito = corpo.is_favorite ?? false;
        return HttpResponse.json(contato("1", "Ana", favorito));
      }),
    );

    envolverComQuery(<ContactsPage />);
    await screen.findByText("Ana");
    const antes = listagens;

    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Favoritar" }));

    await waitFor(() => expect(listagens).toBeGreaterThan(antes));
    expect(await screen.findByRole("button", { name: "Desfavoritar" })).toBeInTheDocument();
  });

  it("remover pede confirmacao antes de chamar o servidor", async () => {
    let removeu = false;
    servidor.use(
      mswHttp.get(`${URL_TESTE}/contacts`, () =>
        HttpResponse.json(removeu ? [] : [contato("1", "Ana", false)]),
      ),
      mswHttp.delete(`${URL_TESTE}/contacts/1`, () => {
        removeu = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    envolverComQuery(<ContactsPage />);
    await screen.findByText("Ana");

    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Remover" }));
    expect(removeu).toBe(false);

    await usuario.click(await screen.findByRole("button", { name: "Remover" }));
    await waitFor(() => expect(removeu).toBe(true));
    // Criterio 5 do spec: nao basta o DELETE disparar, a linha precisa SUMIR
    // da lista. Sem o onSuccess de useRemoverContato invalidando CHAVES,
    // o DELETE acontece no servidor e a lista em cache continua mostrando
    // "Ana" para sempre.
    await waitFor(() => expect(screen.queryByText("Ana")).not.toBeInTheDocument());
  });

  it("cancelar depois de uma remocao que falhou limpa o alerta", async () => {
    // Sem limpar erro/rascunho no Cancelar, uma remocao que falha deixa o
    // alerta na linha PARA SEMPRE: executar() so limpa erro no INICIO da
    // proxima tentativa, nunca no cancelamento. AccountsPage.tsx e
    // AccountDetailPage.tsx desmontam ao fechar para o estado morrer junto;
    // ContactRow e o unico lugar da fatia que fica montado e precisa limpar
    // na mao.
    servidor.use(
      mswHttp.get(`${URL_TESTE}/contacts`, () => HttpResponse.json([contato("1", "Ana", false)])),
      mswHttp.delete(`${URL_TESTE}/contacts/1`, () => HttpResponse.error()),
    );

    envolverComQuery(<ContactsPage />);
    await screen.findByText("Ana");

    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Remover" }));
    await usuario.click(await screen.findByRole("button", { name: "Remover" }));

    await screen.findByRole("alert");
    await usuario.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("cancelar renomear descarta o rascunho: reabrir mostra o apelido real", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/contacts`, () => HttpResponse.json([contato("1", "Ana", false)])),
    );

    envolverComQuery(<ContactsPage />);
    await screen.findByText("Ana");

    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Renomear" }));
    const campo = await screen.findByLabelText("Apelido");
    await usuario.clear(campo);
    await usuario.type(campo, "Rascunho Abandonado");
    await usuario.click(screen.getByRole("button", { name: "Cancelar" }));

    await usuario.click(await screen.findByRole("button", { name: "Renomear" }));
    expect(await screen.findByLabelText("Apelido")).toHaveValue("Ana");
  });

  it("renomear REFAZ a lista com o apelido novo", async () => {
    let alias = "Ana";
    servidor.use(
      mswHttp.get(`${URL_TESTE}/contacts`, () =>
        HttpResponse.json([contato("1", alias, false)]),
      ),
      mswHttp.patch(`${URL_TESTE}/contacts/1`, async ({ request }) => {
        const corpo = (await request.json()) as { alias?: string };
        alias = corpo.alias ?? alias;
        return HttpResponse.json(contato("1", alias, false));
      }),
    );

    envolverComQuery(<ContactsPage />);
    await screen.findByText("Ana");

    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Renomear" }));
    const campo = await screen.findByLabelText("Apelido");
    await usuario.clear(campo);
    await usuario.type(campo, "Ana Maria");
    await usuario.click(screen.getByRole("button", { name: "Salvar contato" }));

    expect(await screen.findByText("Ana Maria")).toBeInTheDocument();
  });

  it("o titular mascarado aparece como veio, sem remascarar", async () => {
    servidor.use(
      mswHttp.get(`${URL_TESTE}/contacts`, () =>
        HttpResponse.json([contato("1", "Ana", false)]),
      ),
    );

    envolverComQuery(<ContactsPage />);

    expect(await screen.findByText("M**** S****")).toBeInTheDocument();
  });

  it("salvar um contato novo pelo dialogo REFAZ a lista", async () => {
    // A Task 3 entregou useSalvarContato com invalidacao de CHAVES.contatos(),
    // mas nenhum teste ate agora montava uma lista para provar que a
    // invalidacao de fato refaz a listagem. Aqui a ContactsPage monta o
    // AddContactDialog, entao a prova e possivel: conta chamadas a
    // GET /contacts e confirma que uma nova listagem aconteceu apos salvar.
    let listagens = 0;
    let salvo = false;
    const achada = {
      account_id: "cccccccc-0000-0000-0000-000000000001",
      holder_name: "M**** S****",
      type: "CHECKING",
      institution: instituicao,
    };
    servidor.use(
      mswHttp.get(`${URL_TESTE}/contacts`, () => {
        listagens += 1;
        return HttpResponse.json(salvo ? [contato("1", "Ana", false)] : []);
      }),
      mswHttp.get(`${URL_TESTE}/institutions`, () => HttpResponse.json([instituicao])),
      mswHttp.post(`${URL_TESTE}/contacts/lookup`, () => HttpResponse.json(achada)),
      mswHttp.post(`${URL_TESTE}/contacts`, () => {
        salvo = true;
        return HttpResponse.json(contato("1", "Ana", false), { status: 201 });
      }),
    );

    envolverComQuery(<ContactsPage />);
    await screen.findByText("Você ainda não tem contatos.");
    const antes = listagens;

    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Adicionar contato" }));

    await screen.findByTestId(`instituicao-${instituicao.id}`);
    await usuario.click(screen.getByTestId(`instituicao-${instituicao.id}`));
    await usuario.type(screen.getByLabelText("Agência"), "0001");
    await usuario.type(screen.getByLabelText("Número da conta"), "12345678-9");
    await usuario.click(screen.getByRole("button", { name: "Buscar" }));

    await screen.findByText(/M\*{4} S\*{4}/);
    await usuario.type(screen.getByLabelText("Apelido"), "Ana");
    await usuario.click(screen.getByRole("button", { name: "Salvar contato" }));

    await waitFor(() => expect(listagens).toBeGreaterThan(antes));
    expect(await screen.findByText("Ana")).toBeInTheDocument();
  });
});

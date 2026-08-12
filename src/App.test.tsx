import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { useSession } from "@/features/auth/session.store";
import App from "@/App";
import i18n from "@/app/i18n";

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
  useSession.setState({ accessToken: null, user: null, status: "booting" });
});

describe("App", () => {
  it("monta e mostra a tela de carga enquanto decide a sessao", () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ error: { code: "INVALID_TOKEN", message: "x", details: {} } }, { status: 401 }),
      ),
    );

    render(<App />);

    expect(screen.getByText("Carregando")).toBeInTheDocument();
  });
});

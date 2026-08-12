import { StrictMode } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { http as mswHttp, HttpResponse } from "msw";
import { servidor, URL_TESTE } from "@/test/msw";
import { useSession } from "@/features/auth/session.store";
import { useSessionBootstrap } from "@/features/auth/useSessionBootstrap";

const usuario = {
  id: "11111111-1111-1111-1111-111111111111",
  full_name: "Joao Silva",
  email: "joao@example.com",
  document: "39053344705",
  created_at: "2026-08-12T00:00:00Z",
};

beforeEach(() => {
  useSession.setState({ accessToken: null, user: null, status: "booting" });
});

describe("boot da sessao", () => {
  it("cookie valido restaura a sessao", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ access_token: "tok", token_type: "bearer", expires_in: 900 }),
      ),
      mswHttp.get(`${URL_TESTE}/auth/me`, () => HttpResponse.json(usuario)),
    );

    renderHook(() => useSessionBootstrap());

    await waitFor(() => expect(useSession.getState().status).toBe("authenticated"));
    expect(useSession.getState().user?.email).toBe("joao@example.com");
  });

  it("sem cookie vai para anonymous", async () => {
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ error: { code: "INVALID_TOKEN", message: "x", details: {} } }, { status: 401 }),
      ),
    );

    renderHook(() => useSessionBootstrap());

    await waitFor(() => expect(useSession.getState().status).toBe("anonymous"));
  });

  it("permanece em booting ate a resposta chegar", async () => {
    let liberar: (() => void) | null = null;
    const espera = new Promise<void>((r) => (liberar = r));
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, async () => {
        await espera;
        return HttpResponse.json({ access_token: "tok", token_type: "bearer", expires_in: 900 });
      }),
      mswHttp.get(`${URL_TESTE}/auth/me`, () => HttpResponse.json(usuario)),
    );

    renderHook(() => useSessionBootstrap());

    // O intervalo entre a carga e a resposta e exatamente onde a tela de
    // login pisca se o status virar anonymous cedo demais.
    expect(useSession.getState().status).toBe("booting");
    liberar!();
    await waitFor(() => expect(useSession.getState().status).toBe("authenticated"));
  });

  it("StrictMode monta o efeito duas vezes, mas o guarda deixa passar so um /auth/refresh", async () => {
    // Este e o teste que falta a garantia mais importante da task: o
    // StrictMode do React desmonta e remonta os efeitos em desenvolvimento
    // (mount -> cleanup -> mount de novo, na mesma instancia). Sem o guarda
    // de execucao unica em useSessionBootstrap, isso dispara DOIS
    // /auth/refresh concorrentes — e o gateway rotaciona o refresh token a
    // cada uso, revogando TODAS as sessoes do usuario ao detectar reuso.
    let refreshes = 0;
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json({ access_token: "tok", token_type: "bearer", expires_in: 900 });
      }),
      mswHttp.get(`${URL_TESTE}/auth/me`, () => HttpResponse.json(usuario)),
    );

    renderHook(() => useSessionBootstrap(), { wrapper: StrictMode });

    await waitFor(() => expect(useSession.getState().status).toBe("authenticated"));
    expect(refreshes).toBe(1);
  });

  it("cookie ausente (401) vai para anonymous em silencio, sem warn", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ error: { code: "INVALID_TOKEN", message: "x", details: {} } }, { status: 401 }),
      ),
    );

    renderHook(() => useSessionBootstrap());

    await waitFor(() => expect(useSession.getState().status).toBe("anonymous"));
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("falha inesperada do refresh (500) vai para anonymous mas emite warn com o codigo", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ error: { code: "INTERNAL_ERROR", message: "x", details: {} } }, { status: 500 }),
      ),
    );

    renderHook(() => useSessionBootstrap());

    await waitFor(() => expect(useSession.getState().status).toBe("anonymous"));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("INTERNAL_ERROR");
    warnSpy.mockRestore();
  });

  it("/auth/me falhando depois de um refresh bem-sucedido tambem emite warn", async () => {
    // O caso que mais incomoda: a sessao FOI renovada com sucesso, mas
    // /auth/me falhou por instabilidade momentanea. O usuario perde uma
    // sessao que era valida — sem rastro, isso e indistinguivel de "nao
    // havia sessao".
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    servidor.use(
      mswHttp.post(`${URL_TESTE}/auth/refresh`, () =>
        HttpResponse.json({ access_token: "tok", token_type: "bearer", expires_in: 900 }),
      ),
      mswHttp.get(`${URL_TESTE}/auth/me`, () =>
        HttpResponse.json({ error: { code: "INTERNAL_ERROR", message: "x", details: {} } }, { status: 500 }),
      ),
    );

    renderHook(() => useSessionBootstrap());

    await waitFor(() => expect(useSession.getState().status).toBe("anonymous"));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("INTERNAL_ERROR");
    warnSpy.mockRestore();
  });
});

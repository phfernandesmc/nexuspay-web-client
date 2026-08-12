import { describe, it, expect, beforeEach } from "vitest";
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
});

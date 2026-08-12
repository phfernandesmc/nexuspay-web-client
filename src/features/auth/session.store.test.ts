import { describe, it, expect, beforeEach } from "vitest";
import { useSession, lerToken } from "@/features/auth/session.store";

const usuario = {
  id: "11111111-1111-1111-1111-111111111111",
  full_name: "Joao Silva",
  email: "joao@example.com",
  document: "39053344705",
  created_at: "2026-08-12T00:00:00Z",
};

beforeEach(() => {
  useSession.setState({
    accessToken: null,
    user: null,
    status: "booting",
    motivoEncerramento: null,
  });
});

describe("store de sessao", () => {
  it("comeca em booting, nao em anonymous", () => {
    // A diferenca importa: em booting a interface mostra tela neutra; em
    // anonymous ela mostra o login. Comecar em anonymous faz a tela de login
    // piscar para quem esta autenticado.
    expect(useSession.getState().status).toBe("booting");
  });

  it("autenticar guarda token e usuario", () => {
    useSession.getState().autenticar("tok-123", usuario);
    const estado = useSession.getState();
    expect(estado.status).toBe("authenticated");
    expect(estado.accessToken).toBe("tok-123");
    expect(estado.user?.email).toBe("joao@example.com");
  });

  it("definirToken troca o token sem mexer no usuario", () => {
    useSession.getState().autenticar("tok-123", usuario);
    useSession.getState().definirToken("tok-456");
    expect(useSession.getState().accessToken).toBe("tok-456");
    expect(useSession.getState().user?.email).toBe("joao@example.com");
  });

  it("encerrar limpa tudo e vai para anonymous", () => {
    useSession.getState().autenticar("tok-123", usuario);
    useSession.getState().encerrar();
    const estado = useSession.getState();
    expect(estado.accessToken).toBeNull();
    expect(estado.user).toBeNull();
    expect(estado.status).toBe("anonymous");
  });

  it("encerrar carrega o motivo ate a tela de login", () => {
    // O interceptor de resposta vive fora de qualquer componente e o router
    // monta a LoginPage do zero, com o estado de erro dela nascendo null.
    // Este campo e o unico canal entre os dois.
    useSession.getState().autenticar("tok-123", usuario);
    useSession.getState().encerrar("REFRESH_TOKEN_REUSED");
    expect(useSession.getState().motivoEncerramento).toBe("REFRESH_TOKEN_REUSED");
  });

  it("encerrar sem motivo — o botao Sair — nao deixa mensagem nenhuma", () => {
    useSession.getState().autenticar("tok-123", usuario);
    useSession.getState().encerrar();
    expect(useSession.getState().motivoEncerramento).toBeNull();
  });

  it("autenticar limpa um motivo pendente", () => {
    // Senao a mensagem de sessao revogada reapareceria no login seguinte,
    // depois de tudo ja ter dado certo.
    useSession.getState().encerrar("REFRESH_TOKEN_REUSED");
    useSession.getState().autenticar("tok-123", usuario);
    expect(useSession.getState().motivoEncerramento).toBeNull();
  });

  it("lerToken enxerga o token de fora de componente", () => {
    useSession.getState().autenticar("tok-123", usuario);
    expect(lerToken()).toBe("tok-123");
  });

  it("nao persiste o token em storage nenhum", () => {
    useSession.getState().autenticar("tok-secreto", usuario);
    const tudo = JSON.stringify({ ...localStorage, ...sessionStorage });
    expect(tudo).not.toContain("tok-secreto");
  });
});

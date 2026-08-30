import type { ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { useSession } from "@/features/auth/session.store";

/**
 * Moldura comum de login e cadastro: fundo em gradiente suave, wordmark em
 * gradiente e o card com a faixa colorida no topo.
 *
 * Existe para que as duas telas nao divirjam. Elas sao vistas em sequencia
 * — quem nao tem conta vai de uma para a outra — e qualquer diferenca de
 * moldura entre as duas aparece como um solavanco na transicao.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");

  /**
   * Voltar para a landing zera a marca de sessao encerrada.
   *
   * Sem isto o botao pareceria quebrado para quem acabou de sair: a marca
   * faz a raiz redirecionar de volta para /login, e a navegacao daria a
   * volta sem sair do lugar. marcarAnonimo ja significa "trate-me como
   * visitante novo", que e exatamente a intencao de quem clica aqui —
   * inclusive descartar um motivoEncerramento ja lido.
   */
  function aoVoltar() {
    useSession.getState().marcarAnonimo();
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12">
      {/* Duas manchas radiais em vez de um linear-gradient: o mockup tem cor
          nos cantos opostos e branco no meio, o que um gradiente linear so
          alcanca com paradas espremidas. aria-hidden porque e decoracao. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-background"
        style={{
          backgroundImage:
            "radial-gradient(60rem 40rem at 0% 0%, var(--marca-suave), transparent 60%), " +
            "radial-gradient(60rem 40rem at 100% 100%, oklch(0.95 0.05 45), transparent 60%)",
        }}
      />

      <Link
        to="/"
        onClick={aoVoltar}
        className="absolute left-4 top-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("common:back")}
      </Link>

      {/* A marca tambem leva de volta: e convencao, e nao custa ruido. */}
      <Link
        to="/"
        onClick={aoVoltar}
        className="mb-8 bg-gradient-to-r from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)] bg-clip-text text-4xl font-bold text-transparent"
      >
        {t("common:brand")}
      </Link>

      <div className="w-full max-w-sm overflow-hidden rounded-2xl border bg-card shadow-lg">
        <div className="h-1.5 bg-gradient-to-r from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)]" />
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

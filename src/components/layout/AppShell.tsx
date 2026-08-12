import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import LanguageSwitch from "@/components/layout/LanguageSwitch";
import { sair } from "@/features/auth/api";
import { useSession } from "@/features/auth/session.store";

export default function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");

  async function aoSair() {
    try {
      await sair();
    } finally {
      // Encerra localmente mesmo se a chamada falhar: deixar o usuario
      // preso numa sessao que ele pediu para encerrar e pior do que uma
      // revogacao que so acontece quando o refresh token expirar.
      useSession.getState().encerrar();
    }
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r p-4 md:block">
        <p className="mb-6 text-lg font-semibold">{t("common:brand")}</p>
        <nav className="flex flex-col gap-1">
          <NavLink to="/" className="rounded px-2 py-1 hover:bg-muted">
            {t("common:home")}
          </NavLink>
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-4 border-b p-4">
          <LanguageSwitch />
          <Button variant="outline" onClick={() => void aoSair()}>
            {t("common:logout")}
          </Button>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}

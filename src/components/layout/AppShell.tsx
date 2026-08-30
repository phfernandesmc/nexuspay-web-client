import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  Home,
  Menu as MenuIcon,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { ChevronDown } from "lucide-react";
import LanguageSwitch from "@/components/layout/LanguageSwitch";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { sair } from "@/features/auth/api";
import { useSession } from "@/features/auth/session.store";

const DESTINOS = [
  { para: "/", chave: "common:home", Icone: Home },
  { para: "/contas", chave: "common:accounts", Icone: Wallet },
  { para: "/contatos", chave: "common:contacts", Icone: Users },
  { para: "/transferir", chave: "common:transfer", Icone: ArrowLeftRight },
  { para: "/depositar", chave: "common:deposit", Icone: ArrowDownToLine },
] as const;

function Navegacao({ aoNavegar }: { aoNavegar?: () => void }) {
  const { t } = useTranslation("common");

  return (
    <nav className="flex flex-col gap-1">
      {DESTINOS.map(({ para, chave, Icone }) => (
        <NavLink
          key={para}
          to={para}
          end={para === "/"}
          onClick={aoNavegar}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-white/90 ${
              isActive ? "bg-white/20 font-medium text-white" : "hover:bg-white/10"
            }`
          }
        >
          <Icone className="size-4" />
          {t(chave)}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");
  const [menuAberto, setMenuAberto] = useState(false);
  const usuario = useSession((estado) => estado.user);
  const [contaAberta, setContaAberta] = useState(false);
  const refConta = useRef<HTMLDivElement>(null);

  // Escape e clique fora fecham o menu. Sem isso ele fica preso na tela ate
  // o proximo clique no gatilho — e um menu que nao fecha por Escape e
  // inalcancavel para quem navega so por teclado.
  useEffect(() => {
    if (!contaAberta) return;

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setContaAberta(false);
    }
    function aoApontar(evento: PointerEvent) {
      if (!refConta.current?.contains(evento.target as Node)) setContaAberta(false);
    }

    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("pointerdown", aoApontar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("pointerdown", aoApontar);
    };
  }, [contaAberta]);

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

  const gradiente =
    "bg-gradient-to-b from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)]";

  return (
    <div className="flex min-h-screen">
      <aside className={`hidden w-56 shrink-0 p-4 md:block ${gradiente}`}>
        <p className="mb-6 px-3 text-lg font-semibold text-white">{t("common:brand")}</p>
        <Navegacao />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b p-4">
          <button
            type="button"
            className="rounded p-1 hover:bg-muted md:hidden"
            aria-expanded={menuAberto}
            aria-label={t("common:openMenu")}
            onClick={() => setMenuAberto((estava) => !estava)}
          >
            {menuAberto ? <X className="size-5" /> : <MenuIcon className="size-5" />}
          </button>

          <div className="ml-auto flex items-center gap-4">
            <ThemeToggle />
            <LanguageSwitch />

            <div ref={refConta} className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={contaAberta}
                onClick={() => setContaAberta((estava) => !estava)}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm hover:bg-muted"
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)] text-sm font-semibold text-white"
                >
                  {(usuario?.full_name ?? "?").charAt(0).toUpperCase()}
                </span>
                <span className="hidden sm:inline">{usuario?.full_name}</span>
                <ChevronDown className="size-4" />
              </button>

              {contaAberta && (
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-2 min-w-56 rounded-lg border bg-background p-1 shadow-lg"
                >
                  {/* O e-mail nao aparece em nenhum outro lugar do app. E ele
                      que da ao menu uma razao de existir alem de embrulhar um
                      unico botao. */}
                  <div className="px-3 py-2">
                    <span className="block text-sm font-medium">{usuario?.full_name}</span>
                    <span className="block text-xs text-muted-foreground">{usuario?.email}</span>
                  </div>
                  <div className="my-1 h-px bg-border" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void aoSair()}
                    className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    {t("common:logout")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* A barra lateral e `hidden md:block`; sem este painel, o app ficava
            SEM navegacao alguma abaixo de 768px. Fecha ao navegar: um menu
            que continua aberto sobre a tela nova parece que o clique falhou. */}
        {menuAberto && (
          <div className={`p-4 md:hidden ${gradiente}`}>
            <Navegacao aoNavegar={() => setMenuAberto(false)} />
          </div>
        )}

        <main className="min-w-0 p-6">{children}</main>
      </div>
    </div>
  );
}

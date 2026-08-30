import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Menu, X } from "lucide-react";

const SECOES = [
  { id: "arquitetura", chave: "landing:nav.architecture" },
  { id: "seguranca", chave: "landing:nav.security" },
  { id: "stack", chave: "landing:nav.stack" },
] as const;

export default function LandingHeader() {
  const { t } = useTranslation(["landing", "common"]);
  const [aberto, setAberto] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <button
          type="button"
          className="rounded p-1 hover:bg-muted md:hidden"
          aria-expanded={aberto}
          aria-label={t("landing:nav.menu")}
          onClick={() => setAberto((estava) => !estava)}
        >
          {aberto ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        <span className="text-lg font-semibold">{t("common:brand")}</span>

        <nav className="ml-auto hidden items-center gap-6 md:flex">
          {SECOES.map((secao) => (
            <a key={secao.id} href={`#${secao.id}`} className="text-sm hover:text-foreground/70">
              {t(secao.chave)}
            </a>
          ))}
        </nav>

        <Link
          to="/login"
          className="ml-auto rounded-full bg-gradient-to-r from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)] px-4 py-2 text-sm font-medium text-white md:ml-0"
        >
          {t("landing:nav.demo")}
        </Link>
      </div>

      {/* O hamburguer do mockup precisava abrir alguma coisa: sem este bloco
          ele seria um botao decorativo, e a navegacao por secoes ficaria
          inacessivel abaixo de md — o mesmo defeito que o AppShell tem hoje. */}
      {aberto && (
        <nav className="flex flex-col gap-1 border-t px-4 py-2 md:hidden">
          {SECOES.map((secao) => (
            <a
              key={secao.id}
              href={`#${secao.id}`}
              className="rounded px-2 py-2 text-sm hover:bg-muted"
              onClick={() => setAberto(false)}
            >
              {t(secao.chave)}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}

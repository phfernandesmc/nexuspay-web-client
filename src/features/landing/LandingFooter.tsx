import { Link } from "react-router";
import { useTranslation } from "react-i18next";

const REPOSITORIOS = [
  { chave: "landing:footer.frontend", url: "https://github.com/phfernandesmc/nexuspay-web-client" },
  { chave: "landing:footer.gateway", url: "https://github.com/phfernandesmc/nexuspay-api-gateway" },
  { chave: "landing:footer.worker", url: "https://github.com/phfernandesmc/nexuspay-transaction-worker" },
] as const;

export default function LandingFooter() {
  const { t } = useTranslation("landing");

  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-8 sm:flex-row sm:justify-between">
        <nav className="flex flex-wrap justify-center gap-4">
          {REPOSITORIOS.map((repo) => (
            <a
              key={repo.url}
              href={repo.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm underline underline-offset-4"
            >
              {t(repo.chave)}
            </a>
          ))}
        </nav>

        <div className="flex flex-col items-center gap-1 sm:items-end">
          <Link
            to="/login"
            className="rounded-full bg-gradient-to-r from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)] px-5 py-2 text-sm font-medium text-white"
          >
            {t("landing:nav.demo")}
          </Link>
          <p className="text-xs text-muted-foreground">{t("landing:footer.demoHint")}</p>
        </div>
      </div>
    </footer>
  );
}

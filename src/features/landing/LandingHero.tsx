import { useTranslation } from "react-i18next";
import hero from "@/assets/landing/hero.png";

export default function LandingHero() {
  const { t } = useTranslation("landing");

  return (
    <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-16 md:grid-cols-2">
      <div>
        <h1 className="bg-gradient-to-r from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)] bg-clip-text text-5xl font-bold leading-tight text-transparent md:text-6xl">
          {t("landing:hero.title")}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">{t("landing:hero.subtitle")}</p>
      </div>

      {/* max-w-md: o arquivo tem 391px de largura. Esticado alem disso ele
          borra, e em tela retina borra antes. Se um hero maior aparecer,
          este limite e a unica linha a mudar. */}
      <img
        src={hero}
        alt={t("landing:hero.illustrationAlt")}
        className="mx-auto w-full max-w-md rounded-2xl"
      />
    </section>
  );
}

import { useTranslation } from "react-i18next";
import { KeyRound, ShieldCheck, Lock } from "lucide-react";

const ITENS = [
  { Icone: KeyRound, titulo: "landing:security.tokens", texto: "landing:security.tokensDesc" },
  { Icone: ShieldCheck, titulo: "landing:security.reuse", texto: "landing:security.reuseDesc" },
  { Icone: Lock, titulo: "landing:security.hashing", texto: "landing:security.hashingDesc" },
] as const;

export default function LandingSecurity() {
  const { t } = useTranslation("landing");

  return (
    <section id="seguranca" className="scroll-mt-20 bg-[var(--marca-suave)] py-16">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-center text-3xl font-bold">{t("landing:security.title")}</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {ITENS.map(({ Icone, titulo, texto }) => (
            <article key={titulo} className="rounded-xl border bg-background p-5">
              <Icone className="size-6 text-[var(--marca-1)]" />
              <h3 className="mt-3 font-semibold">{t(titulo)}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t(texto)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

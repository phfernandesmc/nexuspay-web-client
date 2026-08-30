import { useTranslation } from "react-i18next";
import { ArrowRight, Database, RefreshCw } from "lucide-react";

function Caixa({ nome, papel }: { nome: string; papel: string }) {
  return (
    <div className="flex-1 rounded-xl border p-4 text-center">
      <p className="font-semibold">{nome}</p>
      <p className="text-sm text-muted-foreground">{papel}</p>
    </div>
  );
}

export default function LandingArchitecture() {
  const { t } = useTranslation("landing");

  return (
    <section id="arquitetura" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
      <h2 className="text-center text-3xl font-bold">{t("landing:architecture.title")}</h2>

      {/* Empilha no mobile e vira linha a partir de sm: tres caixas com setas
          lado a lado abaixo de 640px espremem o texto ate quebrar palavra. */}
      <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <Caixa nome={t("landing:architecture.gateway")} papel={t("landing:architecture.gatewayRole")} />
        <ArrowRight className="mx-auto size-5 rotate-90 text-[var(--marca-2)] sm:rotate-0" />
        <Caixa nome={t("landing:architecture.queue")} papel={t("landing:architecture.queueRole")} />
        <ArrowRight className="mx-auto size-5 rotate-90 text-[var(--marca-2)] sm:rotate-0" />
        <Caixa nome={t("landing:architecture.worker")} papel={t("landing:architecture.workerRole")} />
      </div>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        {t("landing:architecture.note")}
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border p-5">
          <h3 className="flex items-center gap-2 font-semibold">
            <RefreshCw className="size-5 text-[var(--marca-1)]" />
            {t("landing:guarantees.idempotency")}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("landing:guarantees.idempotencyDesc")}
          </p>
        </article>
        <article className="rounded-xl border p-5">
          <h3 className="flex items-center gap-2 font-semibold">
            <Database className="size-5 text-[var(--marca-3)]" />
            {t("landing:guarantees.durability")}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("landing:guarantees.durabilityDesc")}
          </p>
        </article>
      </div>
    </section>
  );
}

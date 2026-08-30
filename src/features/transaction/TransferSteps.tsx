import { useTranslation } from "react-i18next";

/**
 * Indicador de progresso do preenchimento. Derivado, sem estado proprio.
 *
 * A pagina continua unica: isto NAO e um assistente, e nenhuma etapa
 * bloqueia a seguinte. Quem ja sabe o que quer preenche na ordem que
 * preferir e o indicador acompanha.
 *
 * Recebe a lista de etapas em vez de campos fixos: transferencia tem tres
 * (conta, destino, valor) e deposito tem duas (conta, valor).
 */
export type Etapa = { id: string; rotulo: string; feita: boolean };

export default function TransferSteps({ etapas }: { etapas: Etapa[] }) {
  const { t } = useTranslation("transaction");
  const feitas = etapas.filter((etapa) => etapa.feita).length;

  return (
    <div
      role="group"
      // O traco colorido nao diz nada a quem nao ve. O progresso vai no nome
      // do grupo para existir sem depender da cor.
      aria-label={t("transaction:stepsProgress", { feitas, total: etapas.length })}
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${etapas.length}, minmax(0, 1fr))` }}
    >
      {etapas.map((etapa, indice) => (
        <div key={etapa.id} data-testid={`etapa-${etapa.id}`} data-concluida={etapa.feita}>
          <p className={`text-sm ${etapa.feita ? "font-medium" : "text-muted-foreground"}`}>
            {indice + 1}. {etapa.rotulo}
          </p>
          <div
            className={`mt-1 h-1 rounded-full ${
              etapa.feita
                ? "bg-gradient-to-r from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)]"
                : "bg-muted"
            }`}
          />
        </div>
      ))}
    </div>
  );
}

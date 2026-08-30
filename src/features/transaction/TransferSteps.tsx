import { useTranslation } from "react-i18next";

/**
 * Indicador de progresso do preenchimento. Derivado, sem estado proprio.
 *
 * A pagina continua unica: isto NAO e um assistente, e nenhuma etapa
 * bloqueia a seguinte. Quem ja sabe o que quer preenche na ordem que
 * preferir e o indicador acompanha.
 */
export default function TransferSteps({
  origem,
  destino,
  valor,
}: {
  origem: boolean;
  destino: boolean;
  valor: boolean;
}) {
  const { t } = useTranslation("transaction");
  const etapas = [
    { id: "origem", rotulo: t("transaction:stepAccount"), feita: origem },
    { id: "destino", rotulo: t("transaction:stepDestination"), feita: destino },
    { id: "valor", rotulo: t("transaction:stepAmount"), feita: valor },
  ];
  const feitas = etapas.filter((etapa) => etapa.feita).length;

  return (
    <div
      role="group"
      // O traco colorido nao diz nada a quem nao ve. O progresso vai no nome
      // do grupo para existir sem depender da cor.
      aria-label={t("transaction:stepsProgress", { feitas, total: etapas.length })}
      className="grid grid-cols-3 gap-3"
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

import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { Conta } from "@/features/account/types";
import InstitutionLogo from "@/features/institution/InstitutionLogo";
import { corLegivel } from "@/lib/cor";
import { formatarDinheiro, paraCentavos } from "@/lib/money";

const ROTULO_TIPO = { CHECKING: "account:checking", SAVINGS: "account:savings" } as const;

export default function AccountCard({ conta }: { conta: Conta }) {
  const { t, i18n } = useTranslation(["account", "common"]);
  const locale = i18n.resolvedLanguage ?? "pt-BR";
  const saldo = paraCentavos(conta.balance);
  const disponivel = saldo - paraCentavos(conta.pending_outgoing);

  return (
    <Link
      to={`/contas/${conta.id}`}
      data-testid={`conta-${conta.id}`}
      className="block overflow-hidden rounded-2xl shadow-sm transition hover:shadow-md"
    >
      {/* corLegivel, e nao o color_hex cru: o laranja do Itau da 3,05:1 com
          branco e reprovaria no AA justamente nos rotulos pequenos daqui. */}
      <div className="p-5 text-white" style={{ backgroundColor: corLegivel(conta.institution.color_hex) }}>
        <div className="flex items-start gap-3">
          <InstitutionLogo instituicao={conta.institution} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-bold">{conta.institution.name}</p>
            {/* O apelido em elemento proprio: e o que distingue duas contas
                no mesmo banco, e precisa ser localizavel sozinho. */}
            <p className="truncate text-sm text-white/80">
              {conta.alias ?? t("account:noAlias")}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-white/20 px-2 py-1 text-xs">
            {conta.status === "CLOSED" ? t("account:closed") : t(ROTULO_TIPO[conta.type])}
          </span>
        </div>

        <p className="mt-4 text-sm text-white/80">{t("account:totalBalance")}</p>
        <p className="text-2xl font-bold">{formatarDinheiro(saldo, locale)}</p>

        {/* So quando difere do total. Sem pendencia os dois numeros sao
            iguais e repetir o mesmo valor e ruido — decisao que ja existia
            e que a grade nao obriga a mudar: itens de uma mesma linha ja
            esticam para a altura do mais alto. */}
        {disponivel !== saldo && (
          <>
            <p className="mt-2 text-sm text-white/80">{t("account:available")}</p>
            <p className="text-xl font-semibold">{formatarDinheiro(disponivel, locale)}</p>
          </>
        )}

        <div className="mt-4 flex gap-8">
          <div>
            <p className="text-xs text-white/70">{t("account:branch")}</p>
            <p className="font-semibold">{conta.branch}</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-white/70">{t("account:number")}</p>
            <p className="truncate font-semibold">{conta.number}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}

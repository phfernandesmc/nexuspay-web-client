import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowDownToLine, ArrowLeftRight, UserPlus, Wallet } from "lucide-react";
import { useSession } from "@/features/auth/session.store";
import { useContas } from "@/features/account/queries";
import { useAtividadeRecente } from "@/features/statement/queries";
import InstitutionLogo from "@/features/institution/InstitutionLogo";
import StatementRow from "@/features/statement/StatementRow";
import { formatarDinheiro, paraCentavos } from "@/lib/money";

const ATALHOS = [
  { para: "/transferir", chave: "common:transfer", Icone: ArrowLeftRight },
  { para: "/depositar", chave: "common:deposit", Icone: ArrowDownToLine },
  { para: "/contas", chave: "account:open", Icone: Wallet },
  { para: "/contatos", chave: "contact:add", Icone: UserPlus },
] as const;

export default function HomePage() {
  const { t, i18n } = useTranslation(["home", "common", "account", "contact", "statement"]);
  const usuario = useSession((estado) => estado.user);
  const { data: contas } = useContas();
  const { data: atividade } = useAtividadeRecente();
  const locale = i18n.resolvedLanguage ?? "pt-BR";

  const total = (contas ?? []).reduce((soma, conta) => soma + paraCentavos(conta.balance), 0);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-2xl font-semibold">
          {t("home:greeting", { nome: usuario?.full_name ?? "" })}
        </h1>
        <p className="sr-only">{t("home:totalBalance")}</p>
        <p className="bg-gradient-to-r from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)] bg-clip-text text-4xl font-bold text-transparent">
          {formatarDinheiro(total, locale)}
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("home:myAccounts")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(contas ?? []).map((conta) => (
            <Link
              key={conta.id}
              to={`/contas/${conta.id}`}
              className="flex items-center gap-3 rounded-xl border border-l-4 p-4 hover:bg-muted"
              style={{ borderLeftColor: conta.institution.color_hex }}
            >
              <InstitutionLogo instituicao={conta.institution} />
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {conta.alias ?? conta.institution.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatarDinheiro(paraCentavos(conta.balance), locale)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">{t("home:recentActivity")}</h2>
          {/* StatementRow em vez da tabela do mockup: ele ja resolve status
              nos dois idiomas, contraparte, transferencia entre contas
              proprias e o sinal do valor. Uma tabela paralela duplicaria
              tudo isso e as duas divergiriam na primeira mudanca. */}
          {atividade !== undefined && atividade.length === 0 ? (
            <p className="text-muted-foreground">{t("home:noActivity")}</p>
          ) : (
            <ul>
              {(atividade ?? []).map((item) => (
                <StatementRow key={item.id} item={item} conta={item.conta} />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">{t("home:shortcuts")}</h2>
          <div className="flex flex-col gap-2">
            {ATALHOS.map(({ para, chave, Icone }) => (
              <Link
                key={para}
                to={para}
                className="flex items-center gap-3 rounded-full bg-gradient-to-r from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)] px-4 py-3 text-sm font-medium text-white"
              >
                <Icone className="size-4" />
                {t(chave)}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

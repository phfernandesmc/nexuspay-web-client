import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useInstituicoes } from "@/features/account/queries";
import InstitutionLogo from "@/features/institution/InstitutionLogo";
import { useBuscarConta } from "@/features/contact/queries";
import type { ResultadoBusca } from "@/features/contact/types";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";

/**
 * O primeiro passo do fluxo de dois passos, isolado de quem o usa.
 *
 * Contatos usa para adicionar; transferencia usa para mandar dinheiro sem
 * salvar. Ele nao sabe qual dos dois o chamou — so avisa quem encontrou.
 */
export default function AccountLookup({
  onEncontrada,
  aoCancelar,
}: {
  onEncontrada: (achada: ResultadoBusca) => void;
  /**
   * Quando informado, um "Cancelar" aparece ao lado de "Buscar".
   *
   * Fica aqui, e nao no componente que usa o lookup, para os dois botoes
   * dividirem a mesma linha — desistir e uma acao par de buscar, e
   * empilha-los em containers diferentes os fazia parecer de niveis
   * distintos. Opcional porque o AddContactDialog ja tem o proprio cancelar
   * no rodape do modal.
   */
  aoCancelar?: () => void;
}) {
  const { t } = useTranslation(["contact", "errors"]);
  const { data: instituicoes } = useInstituicoes();
  const buscar = useBuscarConta();
  const [instituicaoId, setInstituicaoId] = useState("");
  const [agencia, setAgencia] = useState("");
  const [numero, setNumero] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [formato, setFormato] = useState<{ agencia?: string; numero?: string }>({});

  /**
   * O contrato do gateway, espelhado aqui: ContactLookupIn exige
   * ^\d{4}$ na agencia e ^\d{8}-\d$ no numero. Sem esta checagem o
   * formulario manda o que for e volta 422 com VALIDATION_ERROR, que nao
   * diz qual campo nem qual formato — o usuario fica sem saber o que
   * corrigir depois de uma viagem ao servidor.
   */
  function conferirFormato(): boolean {
    const problemas: { agencia?: string; numero?: string } = {};
    if (!/^\d{4}$/.test(agencia.trim())) problemas.agencia = t("contact:branchFormat");
    if (!/^\d{8}-\d$/.test(numero.trim())) problemas.numero = t("contact:numberFormat");
    setFormato(problemas);
    return Object.keys(problemas).length === 0;
  }

  async function aoBuscar() {
    setErro(null);
    if (!conferirFormato()) return;
    try {
      const achada = await buscar.mutateAsync({
        institution_id: instituicaoId,
        branch: agencia.trim(),
        number: numero.trim(),
      });
      onEncontrada(achada);
    } catch (falha) {
      setErro(t(codigoTraduzivel(extrairErro(falha).code), { ns: "errors" }));
    }
  }

  const incompleto = instituicaoId === "" || agencia.trim() === "" || numero.trim() === "";

  return (
    <div className="flex flex-col gap-3">
      {/* Banco por LOGO, e nao um <select> de texto: o resto da pagina
          identifica instituicao por logo — no carrossel de origem e na lista
          de destino — e uma lista suspensa aqui era o unico lugar que
          obrigava a ler nome de banco. radiogroup pelo mesmo motivo dos
          outros: escolha unica, com estado anunciado. */}
      <div className="flex flex-col gap-2">
        <span id="rotulo-instituicao" className="text-sm font-medium">
          {t("contact:institution")}
        </span>
        <div
          role="radiogroup"
          aria-labelledby="rotulo-instituicao"
          className="flex flex-wrap gap-2 p-1"
        >
          {(instituicoes ?? []).map((inst) => {
            const marcada = inst.id === instituicaoId;
            return (
              <div
                key={inst.id}
                data-testid={`instituicao-${inst.id}`}
                role="radio"
                aria-checked={marcada}
                aria-label={inst.name}
                tabIndex={marcada ? 0 : -1}
                onClick={() => setInstituicaoId(inst.id)}
                onKeyDown={(evento) => {
                  if (evento.key === " " || evento.key === "Enter") {
                    evento.preventDefault();
                    setInstituicaoId(inst.id);
                  }
                }}
                className={`flex cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm hover:bg-muted ${
                  marcada ? "ring-2 ring-[var(--marca-2)]" : ""
                }`}
              >
                {/* Sem override de tamanho: InstitutionLogo concatena
                    classes sem tailwind-merge, entao size-7 e size-10
                    colidiriam e o vencedor dependeria da ordem no CSS. */}
                <InstitutionLogo instituicao={inst} />
                <span className="truncate">{inst.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
      <div className="flex w-28 flex-col gap-2">
        <Label htmlFor="busca-agencia">{t("contact:branch")}</Label>
        <Input
          id="busca-agencia"
          inputMode="numeric"
          maxLength={4}
          placeholder={t("contact:branchPlaceholder")}
          aria-describedby="busca-agencia-erro"
          value={agencia}
          onChange={(evento) => setAgencia(evento.target.value)}
        />
        <p id="busca-agencia-erro" className="text-sm text-destructive">
          {formato.agencia}
        </p>
      </div>

      <div className="flex min-w-44 flex-1 flex-col gap-2">
        <Label htmlFor="busca-numero">{t("contact:number")}</Label>
        <Input
          id="busca-numero"
          inputMode="numeric"
          maxLength={10}
          placeholder={t("contact:numberPlaceholder")}
          aria-describedby="busca-numero-erro"
          value={numero}
          onChange={(evento) => setNumero(evento.target.value)}
        />
        <p id="busca-numero-erro" className="text-sm text-destructive">
          {formato.numero}
        </p>
      </div>
      </div>

      {erro && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button
          // Sem flex-1: esticado na largura do formulario ele parecia a
          // acao principal da pagina, quando e a acao de uma etapa. px-8 da
          // o peso sem o exagero.
          className="rounded-full bg-gradient-to-r from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)] px-8 text-white"
          onClick={() => void aoBuscar()}
          disabled={incompleto || buscar.isPending}
        >
          {buscar.isPending ? t("contact:searching") : t("contact:search")}
        </Button>
        {aoCancelar !== undefined && (
          // Vermelho so no hover: desistir e reversivel e nao merece peso
          // destrutivo permanente, mas a cor confirma a intencao na hora do
          // clique.
          <Button
            variant="ghost"
            onClick={aoCancelar}
            className="rounded-full hover:bg-destructive/10 hover:text-destructive"
          >
            {t("contact:cancel")}
          </Button>
        )}
      </div>
    </div>
  );
}

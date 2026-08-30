import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useInstituicoes } from "@/features/account/queries";
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
}: {
  onEncontrada: (achada: ResultadoBusca) => void;
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
      <div className="flex flex-col gap-2">
        <Label htmlFor="busca-instituicao">{t("contact:institution")}</Label>
        <select
          id="busca-instituicao"
          className="rounded border px-2 py-1"
          value={instituicaoId}
          onChange={(evento) => setInstituicaoId(evento.target.value)}
        >
          <option value="" />
          {(instituicoes ?? []).map((inst) => (
            <option key={inst.id} value={inst.id}>
              {inst.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
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

      <div className="flex flex-col gap-2">
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

      {erro && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <Button onClick={() => void aoBuscar()} disabled={incompleto || buscar.isPending}>
        {buscar.isPending ? t("contact:searching") : t("contact:search")}
      </Button>
    </div>
  );
}

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

  async function aoBuscar() {
    setErro(null);
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
          value={agencia}
          onChange={(evento) => setAgencia(evento.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="busca-numero">{t("contact:number")}</Label>
        <Input
          id="busca-numero"
          value={numero}
          onChange={(evento) => setNumero(evento.target.value)}
        />
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

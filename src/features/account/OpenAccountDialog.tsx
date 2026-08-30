import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Modal from "@/components/layout/Modal";
import InstitutionPicker from "@/features/institution/InstitutionPicker";
import { useAbrirConta, useInstituicoes } from "@/features/account/queries";
import type { TipoConta } from "@/features/account/types";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";

export default function OpenAccountDialog({
  aberto,
  onFechar,
}: {
  aberto: boolean;
  onFechar: () => void;
}) {
  const { t } = useTranslation(["account", "errors"]);
  const { data: instituicoes } = useInstituicoes();
  const abrir = useAbrirConta();
  const [instituicaoId, setInstituicaoId] = useState("");
  const [tipo, setTipo] = useState<TipoConta>("CHECKING");
  const [alias, setAlias] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  if (!aberto) return null;


  async function aoConfirmar() {
    setErro(null);
    try {
      await abrir.mutateAsync({
        institution_id: instituicaoId,
        type: tipo,
        alias: alias.trim() === "" ? null : alias.trim(),
      });
      onFechar();
    } catch (falha) {
      setErro(t(codigoTraduzivel(extrairErro(falha).code), { ns: "errors" }));
    }
  }

  return (
    <Modal titulo={t("account:openTitle")} aoFechar={onFechar}>
      {/* Mesma escolha por logo do formulario de contato. Eram os dois
          unicos lugares onde se escolhe instituicao, e manter um <select> de
          texto aqui fazia a mesma pergunta ter duas respostas visuais no
          mesmo app. */}
      <div className="flex flex-col gap-2">
        <span id="rotulo-instituicao-conta" className="text-sm font-medium">
          {t("account:institution")}
        </span>
        <InstitutionPicker
          instituicoes={instituicoes ?? []}
          escolhida={instituicaoId}
          aoEscolher={setInstituicaoId}
          rotuloId="rotulo-instituicao-conta"
        />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Label htmlFor="tipo">{t("account:type")}</Label>
        <select
          id="tipo"
          className="rounded border px-2 py-1"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoConta)}
        >
          <option value="CHECKING">{t("account:checking")}</option>
          <option value="SAVINGS">{t("account:savings")}</option>
        </select>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Label htmlFor="alias">{t("account:alias")}</Label>
        <Input id="alias" maxLength={50} value={alias} onChange={(e) => setAlias(e.target.value)} />
      </div>

      {erro !== null && (
        <Alert variant="destructive" role="alert" className="mt-4">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <div className="mt-6 flex gap-2">
        <Button
          onClick={() => void aoConfirmar()}
          disabled={abrir.isPending || instituicaoId === ""}
          className="flex-1 rounded-full bg-gradient-to-r from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)] text-white"
        >
          {t("account:confirm")}
        </Button>
        <Button variant="outline" className="rounded-full" onClick={onFechar}>
          {t("account:cancel")}
        </Button>
      </div>
    </Modal>
  );
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Modal from "@/components/layout/Modal";
import InstitutionLogo from "@/features/institution/InstitutionLogo";
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

  const escolhida = instituicoes?.find((i) => i.id === instituicaoId);

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
      <div className="flex flex-col gap-2">
        <Label htmlFor="instituicao">{t("account:institution")}</Label>
        <select
          id="instituicao"
          className="rounded border px-2 py-1"
          value={instituicaoId}
          onChange={(e) => setInstituicaoId(e.target.value)}
        >
          <option value="" />
          {instituicoes?.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
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

      {/* Previa da instituicao escolhida: o mesmo logo que aparecera no
          cartao, para a escolha no <select> ter consequencia visivel antes
          de confirmar. */}
      {escolhida !== undefined && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border p-3">
          <InstitutionLogo instituicao={escolhida} />
          <span className="text-sm font-medium">{escolhida.name}</span>
        </div>
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

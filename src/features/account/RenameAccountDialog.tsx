import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Modal from "@/components/layout/Modal";
import { useRenomearConta } from "@/features/account/queries";
import type { Conta } from "@/features/account/types";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";

export default function RenameAccountDialog({
  conta,
  aberto,
  onFechar,
}: {
  conta: Conta;
  aberto: boolean;
  onFechar: () => void;
}) {
  const { t } = useTranslation(["account", "errors"]);
  const renomear = useRenomearConta(conta.id);
  const [alias, setAlias] = useState(conta.alias ?? "");
  const [erro, setErro] = useState<string | null>(null);

  if (!aberto) return null;

  async function aoSalvar() {
    setErro(null);
    try {
      await renomear.mutateAsync(alias.trim() === "" ? null : alias.trim());
      onFechar();
    } catch (falha) {
      setErro(t(codigoTraduzivel(extrairErro(falha).code), { ns: "errors" }));
    }
  }

  return (
    <Modal titulo={t("account:rename")} aoFechar={onFechar}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="alias-renomear">{t("account:alias")}</Label>
        <Input
          id="alias-renomear"
          maxLength={50}
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
        />
      </div>

      {erro !== null && (
        <Alert variant="destructive" role="alert" className="mt-4">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <div className="mt-4 flex gap-2">
        <Button onClick={() => void aoSalvar()} disabled={renomear.isPending}>
          {t("account:save")}
        </Button>
        <Button variant="outline" onClick={onFechar}>
          {t("account:cancel")}
        </Button>
      </div>
    </Modal>
  );
}

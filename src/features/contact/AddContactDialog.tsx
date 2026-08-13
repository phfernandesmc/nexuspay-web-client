import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AccountLookup from "@/features/contact/AccountLookup";
import { useSalvarContato } from "@/features/contact/queries";
import type { ResultadoBusca } from "@/features/contact/types";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";

export default function AddContactDialog({
  aberto,
  onFechar,
}: {
  aberto: boolean;
  onFechar: () => void;
}) {
  const { t } = useTranslation(["contact", "errors"]);
  const salvar = useSalvarContato();
  const [achada, setAchada] = useState<ResultadoBusca | null>(null);
  const [alias, setAlias] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  if (!aberto) return null;

  async function aoSalvar() {
    if (!achada) return;
    setErro(null);
    try {
      await salvar.mutateAsync({
        account_id: achada.account_id,
        alias: alias.trim(),
        is_favorite: false,
      });
      onFechar();
    } catch (falha) {
      setErro(t(codigoTraduzivel(extrairErro(falha).code), { ns: "errors" }));
    }
  }

  return (
    <div role="dialog" aria-label={t("contact:addTitle")} className="rounded border p-4">
      <h2 className="text-lg font-semibold">{t("contact:addTitle")}</h2>

      {achada === null ? (
        <div className="mt-4">
          <AccountLookup onEncontrada={setAchada} />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm font-medium">{t("contact:found")}</p>
          <p className="text-sm">
            {t("contact:holder")}: {achada.holder_name}
          </p>
          <p className="text-sm">{achada.institution.name}</p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contato-alias">{t("contact:alias")}</Label>
            <Input
              id="contato-alias"
              maxLength={50}
              value={alias}
              onChange={(evento) => setAlias(evento.target.value)}
            />
          </div>

          {erro && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button
              onClick={() => void aoSalvar()}
              disabled={alias.trim() === "" || salvar.isPending}
            >
              {salvar.isPending ? t("contact:saving") : t("contact:save")}
            </Button>
            <Button variant="outline" onClick={() => setAchada(null)}>
              {t("contact:searchAgain")}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4">
        <Button variant="ghost" onClick={onFechar}>
          {t("contact:cancel")}
        </Button>
      </div>
    </div>
  );
}

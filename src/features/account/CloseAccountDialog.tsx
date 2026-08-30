import { useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Modal from "@/components/layout/Modal";
import { useEncerrarConta } from "@/features/account/queries";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";

export default function CloseAccountDialog({
  contaId,
  aberto,
  onFechar,
}: {
  contaId: string;
  aberto: boolean;
  onFechar: () => void;
}) {
  const { t } = useTranslation(["account", "errors"]);
  const encerrar = useEncerrarConta(contaId);
  const navegar = useNavigate();
  const [erro, setErro] = useState<string | null>(null);

  if (!aberto) return null;

  async function aoConfirmar() {
    setErro(null);
    try {
      await encerrar.mutateAsync();
      onFechar();
      navegar("/contas");
    } catch (falha) {
      // O erro fica NO DIALOGO, nao na pagina: fechar aqui esconderia o
      // motivo, e os dois erros possiveis pedem acoes diferentes do usuario
      // — zerar o saldo, ou esperar a transacao pendente resolver.
      setErro(t(codigoTraduzivel(extrairErro(falha).code), { ns: "errors" }));
    }
  }

  return (
    <Modal titulo={t("account:close")} aoFechar={onFechar}>
      <p>{t("account:closeConfirm")}</p>

      {erro !== null && (
        <Alert variant="destructive" role="alert" className="mt-4">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <div className="mt-4 flex gap-2">
        <Button
          variant="destructive"
          onClick={() => void aoConfirmar()}
          disabled={encerrar.isPending}
        >
          {t("account:closeConfirmButton")}
        </Button>
        <Button variant="outline" onClick={onFechar}>
          {t("account:cancel")}
        </Button>
      </div>
    </Modal>
  );
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAtualizarContato, useRemoverContato } from "@/features/contact/queries";
import type { Contato } from "@/features/contact/types";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";

export default function ContactRow({ contato }: { contato: Contato }) {
  const { t } = useTranslation(["contact", "errors"]);
  const atualizar = useAtualizarContato();
  const remover = useRemoverContato();
  const [renomeando, setRenomeando] = useState(false);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  const [alias, setAlias] = useState(contato.alias);
  const [erro, setErro] = useState<string | null>(null);

  async function executar(acao: () => Promise<unknown>) {
    setErro(null);
    try {
      await acao();
      setRenomeando(false);
      setConfirmandoRemocao(false);
    } catch (falha) {
      setErro(t(codigoTraduzivel(extrairErro(falha).code), { ns: "errors" }));
    }
  }

  const conta = contato.target_account;
  // Enquanto uma confirmacao esta aberta (renomear ou remover), a fileira de
  // acoes fica escondida. Nao e so estetico: com ela visivel, "Remover" abre
  // a confirmacao E o botao que a executa ficam na tela ao mesmo tempo, com
  // o MESMO nome acessivel — um clique no lugar errado apaga o contato sem
  // ter confirmado nada.
  const emConfirmacao = renomeando || confirmandoRemocao;

  return (
    <li className="flex flex-col gap-2 rounded border p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{contato.alias}</p>
          <p className="text-sm text-muted-foreground">{conta.holder_name}</p>
          <p className="text-sm text-muted-foreground">
            {conta.institution.name} · {conta.branch} · {conta.number}
          </p>
        </div>
        {!emConfirmacao && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                void executar(() =>
                  atualizar.mutateAsync({
                    id: contato.id,
                    mudanca: { is_favorite: !contato.is_favorite },
                  }),
                )
              }
            >
              {contato.is_favorite ? t("contact:unfavorite") : t("contact:favorite")}
            </Button>
            <Button variant="outline" onClick={() => setRenomeando(true)}>
              {t("contact:rename")}
            </Button>
            <Button variant="outline" onClick={() => setConfirmandoRemocao(true)}>
              {t("contact:remove")}
            </Button>
          </div>
        )}
      </div>

      {renomeando && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`alias-${contato.id}`}>{t("contact:alias")}</Label>
          <Input
            id={`alias-${contato.id}`}
            maxLength={50}
            value={alias}
            onChange={(evento) => setAlias(evento.target.value)}
          />
          <div className="flex gap-2">
            <Button
              onClick={() =>
                void executar(() =>
                  atualizar.mutateAsync({ id: contato.id, mudanca: { alias: alias.trim() } }),
                )
              }
              disabled={alias.trim() === ""}
            >
              {t("contact:save")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setRenomeando(false);
                setErro(null);
                setAlias(contato.alias);
              }}
            >
              {t("contact:cancel")}
            </Button>
          </div>
        </div>
      )}

      {confirmandoRemocao && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">{t("contact:removeConfirm")}</p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              onClick={() => void executar(() => remover.mutateAsync(contato.id))}
            >
              {t("contact:removeConfirmButton")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirmandoRemocao(false);
                setErro(null);
                setAlias(contato.alias);
              }}
            >
              {t("contact:cancel")}
            </Button>
          </div>
        </div>
      )}

      {erro && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
    </li>
  );
}

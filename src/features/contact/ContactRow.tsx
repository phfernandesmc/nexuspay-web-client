import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Modal from "@/components/layout/Modal";
import BankCard from "@/features/institution/BankCard";
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

  function cancelar() {
    setRenomeando(false);
    setConfirmandoRemocao(false);
    setErro(null);
    // Descarta o rascunho: reabrir precisa mostrar o apelido real, nao o
    // que foi digitado e abandonado.
    setAlias(contato.alias);
  }

  const conta = contato.target_account;
  const emModal = renomeando || confirmandoRemocao;

  const alerta = erro !== null && (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{erro}</AlertDescription>
    </Alert>
  );

  return (
    <li className="overflow-hidden rounded-2xl">
      <BankCard
        instituicao={conta.institution}
        titulo={contato.alias}
        subtitulo={conta.holder_name}
        acoes={
          /* Nao renderizados enquanto um modal esta aberto — e nao apenas
             escondidos por classe. "Remover" e o rotulo do gatilho E o do
             botao de confirmacao, entao os dois no DOM criam ambiguidade; e
             um botao atras da sobreposicao continua alcancavel pelo teclado,
             o que nao deveria acontecer. */
          !emModal ? (
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                aria-label={contato.is_favorite ? t("contact:unfavorite") : t("contact:favorite")}
                className="rounded-full p-2 hover:bg-white/20"
                onClick={() =>
                  void executar(() =>
                    atualizar.mutateAsync({
                      id: contato.id,
                      mudanca: { is_favorite: !contato.is_favorite },
                    }),
                  )
                }
              >
                {/* fill so quando favorito: cheia e vazia se distinguem sem
                    depender de cor. */}
                <Star className={`size-4 ${contato.is_favorite ? "fill-current" : ""}`} />
              </button>
              <button
                type="button"
                aria-label={t("contact:rename")}
                className="rounded-full p-2 hover:bg-white/20"
                onClick={() => setRenomeando(true)}
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                aria-label={t("contact:remove")}
                className="rounded-full p-2 hover:bg-white/20"
                onClick={() => setConfirmandoRemocao(true)}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ) : undefined
        }
      >
        {/* Sem nenhum numero grande com cara de saldo: e a ausencia de
            dinheiro que distingue a conta de outra pessoa das suas, agora
            que os dois cartoes compartilham a mesma casca. */}
        <div className="mt-4 flex gap-8">
          <div>
            <p className="text-xs text-white/70">{t("contact:branch")}</p>
            <p className="font-semibold">{conta.branch}</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-white/70">{t("contact:number")}</p>
            <p className="truncate font-semibold">{conta.number}</p>
          </div>
        </div>
      </BankCard>

      {/* Fora de modal o alerta pertence ao cartao — favoritar falha sem
          abrir dialogo nenhum. Fora do bloco colorido, porque as cores do
          Alert sao feitas para fundo claro. */}
      {!emModal && alerta !== false && <div className="border-x border-b p-3">{alerta}</div>}

      {renomeando && (
        <Modal titulo={t("contact:rename")} aoFechar={cancelar}>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`alias-${contato.id}`}>{t("contact:alias")}</Label>
            <Input
              id={`alias-${contato.id}`}
              maxLength={50}
              value={alias}
              onChange={(evento) => setAlias(evento.target.value)}
            />
          </div>

          {alerta}

          <div className="mt-4 flex gap-2">
            <Button
              className="flex-1 rounded-full bg-gradient-to-r from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)] text-white"
              onClick={() =>
                void executar(() =>
                  atualizar.mutateAsync({ id: contato.id, mudanca: { alias: alias.trim() } }),
                )
              }
              disabled={alias.trim() === ""}
            >
              {t("contact:save")}
            </Button>
            <Button variant="ghost" className="rounded-full" onClick={cancelar}>
              {t("contact:cancel")}
            </Button>
          </div>
        </Modal>
      )}

      {confirmandoRemocao && (
        <Modal titulo={t("contact:remove")} aoFechar={cancelar}>
          <p className="text-sm">{t("contact:removeConfirm")}</p>

          {alerta}

          <div className="mt-4 flex gap-2">
            <Button
              variant="destructive"
              className="flex-1 rounded-full"
              onClick={() => void executar(() => remover.mutateAsync(contato.id))}
            >
              {t("contact:removeConfirmButton")}
            </Button>
            <Button variant="ghost" className="rounded-full" onClick={cancelar}>
              {t("contact:cancel")}
            </Button>
          </div>
        </Modal>
      )}
    </li>
  );
}

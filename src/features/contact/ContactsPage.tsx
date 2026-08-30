import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AddContactDialog from "@/features/contact/AddContactDialog";
import ContactRow from "@/features/contact/ContactRow";
import { useContatos } from "@/features/contact/queries";
import type { Contato } from "@/features/contact/types";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";

/**
 * Favoritos primeiro, depois por apelido. A ordenacao e do CLIENTE: o
 * gateway nao promete ordem nenhuma em GET /contacts, e depender de uma que
 * ele nao garante e o defeito que so aparece quando o servidor muda.
 */
function ordenar(contatos: Contato[]): Contato[] {
  return [...contatos].sort((a, b) => {
    if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
    return a.alias.localeCompare(b.alias);
  });
}

export default function ContactsPage() {
  const { t } = useTranslation(["contact", "errors"]);
  const { data: contatos, isPending, isError, error } = useContatos();
  const [adicionando, setAdicionando] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("contact:title")}</h1>

      {adicionando && (
        <AddContactDialog aberto onFechar={() => setAdicionando(false)} />
      )}

      {isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {t(codigoTraduzivel(extrairErro(error).code), { ns: "errors" })}
          </AlertDescription>
        </Alert>
      )}

      {!isPending && !isError && contatos.length === 0 && (
        <p className="text-muted-foreground">{t("contact:empty")}</p>
      )}

      {!isPending && !isError && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ordenar(contatos).map((contato) => (
            <ContactRow key={contato.id} contato={contato} />
          ))}

          {/* Mesmo convite da tela de contas: rotulo visivel alem do icone, e
              ele proprio faz as vezes de estado vazio. */}
          <li>
            <button
              type="button"
              onClick={() => setAdicionando(true)}
              className="flex h-full min-h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-muted-foreground transition hover:border-[var(--marca-2)] hover:text-[var(--marca-2)]"
            >
              <Plus className="size-8" />
              <span className="font-medium">{t("contact:add")}</span>
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

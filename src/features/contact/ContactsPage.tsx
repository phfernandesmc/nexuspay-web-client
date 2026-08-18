import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("contact:title")}</h1>
        <Button onClick={() => setAdicionando(true)}>{t("contact:add")}</Button>
      </div>

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

      {!isPending && !isError && contatos.length === 0 && <p>{t("contact:empty")}</p>}

      {!isPending && !isError && contatos.length > 0 && (
        <ul className="flex flex-col gap-2">
          {ordenar(contatos).map((contato) => (
            <ContactRow key={contato.id} contato={contato} />
          ))}
        </ul>
      )}
    </div>
  );
}

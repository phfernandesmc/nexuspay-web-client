/**
 * Data no idioma da interface.
 *
 * Data invalida devolve um traco em vez de lancar: um unico item de extrato
 * com data corrompida nao pode derrubar a lista inteira.
 */
export function formatarDataHora(iso: string, locale: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

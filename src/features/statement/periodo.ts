export type Periodo = { date_from: string; date_to: string };

/**
 * Data no formato que o gateway espera, sempre a partir dos componentes
 * LOCAIS.
 *
 * toISOString() converteria para UTC antes de cortar, e no fuso do Brasil
 * isso muda o dia para quem abre o app depois das 21h — o extrato "de hoje"
 * comecaria amanha.
 */
function comoData(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * O mes de referencia. `deslocamento` -1 e o mes passado.
 *
 * No mes corrente o fim e HOJE, nao o ultimo dia do mes: um extrato que
 * termina no futuro sugere que faltam dados que ainda nem existem.
 */
export function periodoDoMes(hoje: Date, deslocamento = 0): Periodo {
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() + deslocamento, 1);
  const fim =
    deslocamento === 0
      ? hoje
      : new Date(hoje.getFullYear(), hoje.getMonth() + deslocamento + 1, 0);
  return { date_from: comoData(inicio), date_to: comoData(fim) };
}

/** Os ultimos N dias, com hoje incluido — N dias de extrato, nao N+1. */
export function periodoDosUltimosDias(dias: number, hoje: Date): Periodo {
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - (dias - 1));
  return { date_from: comoData(inicio), date_to: comoData(hoje) };
}

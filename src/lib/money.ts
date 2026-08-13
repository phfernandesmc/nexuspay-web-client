/**
 * Dinheiro em centavos inteiros, nunca em ponto flutuante.
 *
 * 0.1 + 0.2 em JavaScript da 0.30000000000000004. Num total somado de
 * varias transacoes e exibido na tela, esse residuo aparece.
 */

const FORMATO = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Converte o valor monetario da API em centavos.
 *
 * O Decimal do Pydantic chega como string ou como numero conforme a versao
 * — os testes da fatia 3a ja tratavam dos dois. Quando chega como numero, a
 * precisao ja foi decidida pelo servidor e o toFixed(2) so o normaliza.
 */
export function paraCentavos(valor: string | number): number {
  const texto = typeof valor === "number" ? valor.toFixed(2) : valor.trim();
  const casado = FORMATO.exec(texto);
  if (casado === null) {
    throw new Error(`valor monetario invalido: ${JSON.stringify(valor)}`);
  }
  const [, sinal, inteiros, decimais = ""] = casado;
  const centavos = Number(inteiros) * 100 + Number(decimais.padEnd(2, "0"));
  return sinal === "-" ? -centavos : centavos;
}

export function somarCentavos(valores: number[]): number {
  return valores.reduce((total, atual) => total + atual, 0);
}

/**
 * A moeda nao segue o idioma. Em ingles sai "R$ 1,234.56", nao "$1,234.56":
 * o separador acompanha o locale, o simbolo continua sendo o do real.
 */
export function formatarDinheiro(centavos: number, locale: string): string {
  // Dividir por 100 aqui e seguro: a divisao acontece uma unica vez, no fim,
  // sobre um inteiro exato. O erro de ponto flutuante que importa e o
  // acumulado em somas sucessivas, e essas ja aconteceram em centavos.
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

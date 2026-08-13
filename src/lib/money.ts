/**
 * Dinheiro em centavos inteiros, nunca em ponto flutuante.
 *
 * 0.1 + 0.2 em JavaScript da 0.30000000000000004. Num total somado de
 * varias transacoes e exibido na tela, esse residuo aparece.
 */

const FORMATO = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Descreve o valor invalido para a mensagem de erro, sem mentir.
 *
 * JSON.stringify(NaN) devolve "null", o que enganaria quem for depurar um
 * NaN vindo do numero. JSON.stringify(undefined) devolve undefined (nao
 * uma string), o que quebraria a interpolacao. Os dois casos sao tratados
 * explicitamente para a mensagem sempre dizer a verdade.
 */
function descreverValor(valor: unknown): string {
  if (typeof valor === "number" && Number.isNaN(valor)) return "NaN";
  const texto = JSON.stringify(valor);
  return texto === undefined ? String(valor) : texto;
}

/**
 * Converte o valor monetario da API em centavos.
 *
 * O Decimal do Pydantic chega como string ou como numero conforme a versao
 * — os testes da fatia 3a ja tratavam dos dois. Os dois caminhos passam
 * pela mesma expressao regular: um numero e convertido para string sem
 * arredondar (String(valor), nunca toFixed) antes de ser validado, entao
 * "1.234" como string e 1.234 como numero sao rejeitados do mesmo jeito —
 * nao existe um segundo caminho que arredonde em silencio. Isso tambem
 * cobre o caso classico de fronteira: (1.005).toFixed(2) devolve "1.00"
 * por causa da representacao binaria, perdendo um centavo sem nenhum
 * sinal; String(1.005) preserva os tres decimais e a regex rejeita.
 */
export function paraCentavos(valor: string | number): number {
  if (valor === null || valor === undefined) {
    throw new Error(`valor monetario invalido: ${descreverValor(valor)}`);
  }
  if (typeof valor === "number" && !Number.isFinite(valor)) {
    throw new Error(`valor monetario invalido: ${descreverValor(valor)}`);
  }

  const texto = typeof valor === "number" ? String(valor) : valor.trim();
  const casado = FORMATO.exec(texto);
  if (casado === null) {
    throw new Error(`valor monetario invalido: ${descreverValor(valor)}`);
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

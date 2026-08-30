const ALVO_AA = 4.5;
const BRANCO = 1; // luminancia relativa do branco

function canais(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function paraHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function luminancia([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const n = c / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrasteComBranco(rgb: [number, number, number]): number {
  return (BRANCO + 0.05) / (luminancia(rgb) + 0.05);
}

/**
 * A cor de marca escurecida so o quanto for preciso para texto branco
 * atingir o AA (4,5:1).
 *
 * Existe por causa do laranja do Itau: #EC7000 da 3,05:1 com branco e
 * reprova para texto normal, enquanto os outros cinco bancos do catalogo
 * passam sem ajuste. Escurecer no ponto de uso resolveria hoje e quebraria
 * na proxima instituicao que entrar por migration — aqui, qualquer cor nova
 * chega legivel sem ninguem lembrar de conferir.
 *
 * Devolve a cor intacta quando ela ja passa: escurecer o que esta bom
 * afastaria o card da marca sem ganho.
 */
export function corLegivel(hex: string): string {
  let rgb = canais(hex);
  // Passos de 2%: o suficiente para nao ultrapassar o alvo de forma visivel
  // e limitado para nao girar sem fim numa cor que jamais alcance o alvo
  // (preto puro ja da 21:1, entao o limite nunca deveria ser atingido).
  for (let passo = 0; passo < 100 && contrasteComBranco(rgb) < ALVO_AA; passo += 1) {
    rgb = rgb.map((c) => c * 0.98) as [number, number, number];
  }
  return contrasteComBranco(canais(hex)) >= ALVO_AA ? hex : paraHex(rgb);
}

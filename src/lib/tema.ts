export type Tema = "light" | "dark";

export const CHAVE_TEMA = "nexuspay.tema";

/**
 * O tema a usar ao abrir o app.
 *
 * Precedencia: a escolha salva vence a preferencia do dispositivo. Quem
 * trocou no app disse o que quer; o sistema so decide enquanto ninguem
 * decidiu.
 *
 * Toda leitura e guardada. localStorage lanca no modo privativo de alguns
 * navegadores, e matchMedia nao existe no jsdom nem em navegadores antigos —
 * sem as guardas, a primeira renderizacao do app quebraria inteira por causa
 * de uma preferencia VISUAL, que e a coisa menos essencial da tela.
 */
export function temaInicial(): Tema {
  try {
    const salvo = localStorage.getItem(CHAVE_TEMA);
    if (salvo === "light" || salvo === "dark") return salvo;
  } catch {
    // segue para a preferencia do dispositivo
  }

  try {
    if (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
  } catch {
    // segue para o padrao
  }

  return "light";
}

/**
 * Liga a classe que o CSS espera, sem persistir.
 *
 * E o que o boot usa. Persistir ali gravaria a preferencia do DISPOSITIVO
 * como se fosse escolha do usuario — e a partir dai trocar o tema do sistema
 * operacional nao teria mais efeito, porque temaInicial passaria a encontrar
 * uma escolha salva que ninguem fez.
 */
export function ligarTema(tema: Tema): void {
  document.documentElement.classList.toggle("dark", tema === "dark");
}

/** A escolha explicita do usuario: liga a classe E persiste. */
export function escolherTema(tema: Tema): void {
  ligarTema(tema);
  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    // Perder a persistencia e aceitavel; derrubar a tela por causa dela nao.
  }
}

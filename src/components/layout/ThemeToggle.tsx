import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Moon, Sun } from "lucide-react";
import { escolherTema, temaInicial, type Tema } from "@/lib/tema";

/**
 * Alterna claro e escuro.
 *
 * O estado nasce de temaInicial() — a classe ja foi ligada no boot, entao
 * aqui ele so precisa refletir o que ja esta na tela. Nao ha efeito de
 * sincronizacao: o unico jeito de o tema mudar e alguem clicar.
 */
export default function ThemeToggle() {
  const { t } = useTranslation("common");
  const [tema, setTema] = useState<Tema>(temaInicial);

  function alternar() {
    const proximo: Tema = tema === "dark" ? "light" : "dark";
    escolherTema(proximo);
    setTema(proximo);
  }

  return (
    <button
      type="button"
      onClick={alternar}
      // O nome diz o que VAI ACONTECER, nao o estado atual: "tema escuro"
      // num botao ja escuro deixaria quem usa leitor de tela sem saber se
      // esta ligando ou desligando.
      aria-label={tema === "dark" ? t("common:themeLight") : t("common:themeDark")}
      className="rounded-full p-2 hover:bg-muted"
    >
      {tema === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}

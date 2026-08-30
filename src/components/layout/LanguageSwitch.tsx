import { useTranslation } from "react-i18next";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { IDIOMAS } from "@/app/i18n";

const ROTULOS: Record<string, string> = { "pt-BR": "PT", en: "EN" };

/**
 * ToggleGroup do base-ui, e nao dois <button> soltos: ele ja entrega a
 * navegacao por setas e o estado pressionado anunciado por leitor de tela,
 * que eu teria de reimplementar a mao — e provavelmente pior.
 */
export default function LanguageSwitch() {
  const { i18n, t } = useTranslation("common");
  const atual = i18n.resolvedLanguage ?? "pt-BR";

  return (
    <ToggleGroup
      aria-label={t("common:language")}
      value={[atual]}
      onValueChange={(valores) => {
        // Vazio quando o usuario clica no idioma ja ativo. Trocar para
        // undefined deixaria a interface sem idioma nenhum.
        const escolhido = valores[0];
        if (escolhido !== undefined) void i18n.changeLanguage(escolhido);
      }}
      className="flex items-center gap-1 text-sm"
    >
      {IDIOMAS.map((idioma) => (
        <Toggle
          key={idioma}
          value={idioma}
          className={`rounded px-2 py-1 ${
            idioma === atual ? "font-semibold text-foreground" : "text-muted-foreground"
          }`}
        >
          {ROTULOS[idioma]}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

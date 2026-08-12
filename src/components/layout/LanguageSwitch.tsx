import { useTranslation } from "react-i18next";
import { IDIOMAS } from "@/app/i18n";

const NOMES: Record<string, string> = { "pt-BR": "Português", en: "English" };

export default function LanguageSwitch() {
  const { i18n, t } = useTranslation("common");

  return (
    <label className="flex items-center gap-2 text-sm">
      {t("common:language")}
      <select
        aria-label={t("common:language")}
        value={i18n.resolvedLanguage}
        onChange={(evento) => void i18n.changeLanguage(evento.target.value)}
        className="rounded border px-2 py-1"
      >
        {IDIOMAS.map((idioma) => (
          <option key={idioma} value={idioma}>
            {NOMES[idioma]}
          </option>
        ))}
      </select>
    </label>
  );
}

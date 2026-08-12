import { useTranslation } from "react-i18next";
import { useSession } from "@/features/auth/session.store";

export default function HomePage() {
  const { t } = useTranslation("common");
  const usuario = useSession((estado) => estado.user);

  return (
    <section>
      <h1 className="text-2xl font-semibold">{t("common:home")}</h1>
      <p className="mt-2 text-muted-foreground">{usuario?.full_name}</p>
    </section>
  );
}

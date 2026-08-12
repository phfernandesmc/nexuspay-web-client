import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { entrar, buscarUsuario } from "@/features/auth/api";
import { useSession } from "@/features/auth/session.store";
import { chaveDeTraducao, extrairErro } from "@/lib/errors";

const esquema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type Campos = z.infer<typeof esquema>;

export default function LoginPage() {
  const { t } = useTranslation(["auth", "errors", "common"]);
  const [erro, setErro] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Campos>({
    resolver: zodResolver(esquema),
  });

  async function aoEnviar(campos: Campos) {
    setErro(null);
    try {
      const { access_token } = await entrar(campos);
      useSession.getState().definirToken(access_token);
      const usuario = await buscarUsuario();
      useSession.getState().autenticar(access_token, usuario);
    } catch (falha) {
      const { code } = extrairErro(falha);
      // chaveDeTraducao faz console.warn para codigos desconhecidos — o
      // efeito colateral importa, mesmo que a gente nao use a string devolvida
      // como chave do t(), porque o nsSeparator do i18next e ':' e nao '.'.
      chaveDeTraducao(code);
      setErro(t(code, { ns: "errors" }));
    }
  }

  return (
    <Card className="mx-auto mt-16 w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("auth:login.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(aoEnviar)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("auth:login.email")}</Label>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t("auth:login.password")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register("password")}
            />
          </div>

          {erro !== null && (
            <Alert variant="destructive">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={formState.isSubmitting}>
            {t("auth:login.submit")}
          </Button>
          <Link to="/register" className="text-sm underline">
            {t("auth:login.toRegister")}
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}

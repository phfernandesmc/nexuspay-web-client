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
import { registrar } from "@/features/auth/api";
import { useSession } from "@/features/auth/session.store";
import { camposInvalidos, chaveDeTraducao, extrairErro } from "@/lib/errors";

const esquema = z.object({
  full_name: z.string().min(1),
  email: z.string().email(),
  document: z.string().min(11),
  password: z.string().min(8),
});

type Campos = z.infer<typeof esquema>;

export default function RegisterPage() {
  const { t } = useTranslation(["auth", "errors"]);
  const [erro, setErro] = useState<string | null>(null);
  const { register, handleSubmit, formState, setError } = useForm<Campos>({
    resolver: zodResolver(esquema),
  });

  async function aoEnviar(campos: Campos) {
    setErro(null);
    try {
      const { access_token, user } = await registrar(campos);
      // A rota de registro ja devolve token e seta o cookie: entra direto.
      useSession.getState().autenticar(access_token, user);
    } catch (falha) {
      const problema = extrairErro(falha);
      const campos_ = camposInvalidos(problema);
      if (campos_.length > 0) {
        for (const c of campos_) {
          setError(c.field as keyof Campos, { message: c.reason });
        }
        return;
      }
      chaveDeTraducao(problema.code);
      setErro(t(problema.code, { ns: "errors" }));
    }
  }

  const campos: Array<{ nome: keyof Campos; rotulo: string; tipo: string; auto: string }> = [
    { nome: "full_name", rotulo: t("auth:register.fullName"), tipo: "text", auto: "name" },
    { nome: "email", rotulo: t("auth:register.email"), tipo: "email", auto: "email" },
    { nome: "document", rotulo: t("auth:register.document"), tipo: "text", auto: "off" },
    { nome: "password", rotulo: t("auth:register.password"), tipo: "password", auto: "new-password" },
  ];

  return (
    <Card className="mx-auto mt-16 w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("auth:register.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(aoEnviar)} className="flex flex-col gap-4" noValidate>
          {campos.map((campo) => (
            <div key={campo.nome} className="flex flex-col gap-2">
              <Label htmlFor={campo.nome}>{campo.rotulo}</Label>
              <Input
                id={campo.nome}
                type={campo.tipo}
                autoComplete={campo.auto}
                aria-describedby={`${campo.nome}-erro`}
                {...register(campo.nome)}
              />
              <p id={`${campo.nome}-erro`} className="text-sm text-destructive">
                {formState.errors[campo.nome]?.message}
              </p>
            </div>
          ))}

          {erro !== null && (
            <Alert variant="destructive">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={formState.isSubmitting}>
            {t("auth:register.submit")}
          </Button>
          <Link to="/login" className="text-sm underline">
            {t("auth:register.toLogin")}
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}

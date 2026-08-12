import { useMemo, useState } from "react";
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
import { camposInvalidos, codigoTraduzivel, extrairErro } from "@/lib/errors";

const NOMES_DE_CAMPO = ["full_name", "email", "document", "password"] as const;

type Campos = Record<(typeof NOMES_DE_CAMPO)[number], string>;

const doFormulario = new Set<string>(NOMES_DE_CAMPO);

export default function RegisterPage() {
  const { t } = useTranslation(["auth", "errors"]);
  const [erro, setErro] = useState<string | null>(null);

  // Mensagens do zod pelo i18next: no padrao da biblioteca elas chegam ao
  // usuario brasileiro em ingles e em jargao ("Too small: expected string to
  // have >=11 characters").
  const esquema = useMemo(
    () =>
      z.object({
        full_name: z.string().min(1, { message: t("auth:validation.required") }),
        email: z.string().email({ message: t("auth:validation.email") }),
        document: z.string().min(11, { message: t("auth:validation.document") }),
        password: z.string().min(8, { message: t("auth:validation.password") }),
      }),
    [t],
  );

  const { register, handleSubmit, formState, setError } = useForm<Campos>({
    resolver: zodResolver(esquema),
  });

  async function aoEnviar(valores: Campos) {
    setErro(null);
    try {
      const { access_token, user } = await registrar(valores);
      // A rota de registro ja devolve token e seta o cookie: entra direto.
      useSession.getState().autenticar(access_token, user);
    } catch (falha) {
      const problema = extrairErro(falha);
      const mensagem = t(codigoTraduzivel(problema.code), { ns: "errors" });

      // `field` vem do SERVIDOR: um `as keyof Campos` aqui e uma mentira
      // para o compilador. O gateway pode mandar um nome que o formulario
      // nao tem — "body.document" e o formato comum do FastAPI —, e nesse
      // caso o setError nao marca nada. Voltar cedo ali deixava a tela
      // inteiramente morta: clicar em Criar conta nao produzia efeito nenhum.
      let marcouAlgum = false;
      const naoReconhecidos: string[] = [];
      for (const c of camposInvalidos(problema)) {
        if (doFormulario.has(c.field)) {
          // A `reason` do servidor nao tem idioma e nao e contrato: vai para
          // o console de quem desenvolve, nunca para a tela de quem usa.
          console.warn(`[nexuspay] VALIDATION_ERROR em ${c.field}: ${c.reason}`);
          setError(c.field as keyof Campos, { message: mensagem });
          marcouAlgum = true;
        } else {
          naoReconhecidos.push(`${c.field}: ${c.reason}`);
        }
      }
      if (naoReconhecidos.length > 0) {
        console.warn(
          `[nexuspay] VALIDATION_ERROR com campo(s) que o formulario nao tem: ` +
            `${naoReconhecidos.join("; ")}. Nada foi marcado na tela.`,
        );
      }
      if (marcouAlgum) return;

      setErro(mensagem);
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

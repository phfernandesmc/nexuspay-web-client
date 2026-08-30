import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { IdCard, Lock, Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AuthLayout from "@/features/auth/AuthLayout";
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

  const campos = [
    { nome: "full_name", rotulo: t("auth:register.fullName"), tipo: "text", auto: "name", Icone: User, dica: t("auth:register.namePlaceholder") },
    { nome: "email", rotulo: t("auth:register.email"), tipo: "email", auto: "email", Icone: Mail, dica: t("auth:register.emailPlaceholder") },
    // Placeholder formatado, campo sem mascara: o gateway recebe os 11
    // digitos como sempre recebeu. A pontuacao aqui e dica visual, nao
    // formato de envio.
    { nome: "document", rotulo: t("auth:register.document"), tipo: "text", auto: "off", Icone: IdCard, dica: t("auth:register.documentPlaceholder") },
    { nome: "password", rotulo: t("auth:register.password"), tipo: "password", auto: "new-password", Icone: Lock, dica: t("auth:register.passwordPlaceholder") },
  ] as const satisfies ReadonlyArray<{
    nome: keyof Campos;
    rotulo: string;
    tipo: string;
    auto: string;
    Icone: typeof User;
    dica: string;
  }>;

  return (
    <AuthLayout>
      <h1 className="mb-6 text-center text-xl font-semibold">{t("auth:register.title")}</h1>

      <form onSubmit={handleSubmit(aoEnviar)} className="flex flex-col gap-4" noValidate>
        {campos.map(({ nome, rotulo, tipo, auto, Icone, dica }) => (
          <div key={nome} className="flex flex-col gap-2">
            <Label htmlFor={nome}>{rotulo}</Label>
            <div className="relative">
              <Icone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={nome}
                type={tipo}
                autoComplete={auto}
                placeholder={dica}
                aria-describedby={`${nome}-erro`}
                className="pl-9"
                {...register(nome)}
              />
            </div>
            <p id={`${nome}-erro`} className="text-sm text-destructive">
              {formState.errors[nome]?.message}
            </p>
          </div>
        ))}

        {erro !== null && (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          disabled={formState.isSubmitting}
          className="rounded-full bg-gradient-to-r from-[var(--marca-1)] via-[var(--marca-2)] to-[var(--marca-3)] text-white"
        >
          {t("auth:register.submit")}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-[var(--marca-1)]">
          {t("auth:register.toLogin")}
        </Link>
      </p>
    </AuthLayout>
  );
}

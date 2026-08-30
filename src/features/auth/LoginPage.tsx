import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ArrowRight, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AuthLayout from "@/features/auth/AuthLayout";
import { entrar, buscarUsuario } from "@/features/auth/api";
import { useSession } from "@/features/auth/session.store";
import { codigoTraduzivel, extrairErro } from "@/lib/errors";

type Campos = { email: string; password: string };

export default function LoginPage() {
  const { t } = useTranslation(["auth", "errors", "common"]);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  // Lido no corpo do componente, e nao numa constante de modulo: assim o
  // botao pode ser exercitado nos dois estados (presente e ausente) sem
  // recarregar o modulo. Um botao que entra sem senha precisa de teste nos
  // DOIS estados, e o mais importante deles e o ausente.
  const demoEmail = import.meta.env.VITE_DEMO_EMAIL;
  const demoSenha = import.meta.env.VITE_DEMO_PASSWORD;
  const temDemo = Boolean(demoEmail) && Boolean(demoSenha);
  const motivoEncerramento = useSession((estado) => estado.motivoEncerramento);

  // As mensagens do zod sao string de INTERFACE, e por isso passam pelo
  // i18next como qualquer outra. Deixadas no padrao, elas chegam ao usuario
  // em pt-BR em ingles e em jargao de biblioteca ("Invalid email"), sem que
  // nenhuma busca por literal no componente acuse.
  const esquema = useMemo(
    () =>
      z.object({
        email: z.string().email({ message: t("auth:validation.email") }),
        password: z.string().min(1, { message: t("auth:validation.required") }),
      }),
    [t],
  );

  const { register, handleSubmit, formState } = useForm<Campos>({
    resolver: zodResolver(esquema),
  });

  // Unico canal pelo qual um encerramento de sessao decidido fora de
  // qualquer componente — REFRESH_TOKEN_REUSED no interceptor — chega a
  // tela. O motivo e consumido uma vez e limpo, senao reaparece no proximo
  // login.
  useEffect(() => {
    if (motivoEncerramento === null) return;
    setErro(t(codigoTraduzivel(motivoEncerramento), { ns: "errors" }));
    useSession.getState().limparMotivoEncerramento();
  }, [motivoEncerramento, t]);

  async function aoEnviar(campos: Campos) {
    setErro(null);
    try {
      const { access_token } = await entrar(campos);
      useSession.getState().definirToken(access_token);
      const usuario = await buscarUsuario();
      useSession.getState().autenticar(access_token, usuario);
    } catch (falha) {
      const { code } = extrairErro(falha);
      // codigoTraduzivel, e nao o codigo cru: o i18next devolve a propria
      // chave quando ela nao existe, entao um HTTP_502 do gateway chegaria
      // cru na tela do usuario.
      setErro(t(codigoTraduzivel(code), { ns: "errors" }));
    }
  }

  return (
    <AuthLayout>
      <h1 className="mb-6 text-center text-xl font-semibold">{t("auth:login.title")}</h1>

      <form onSubmit={handleSubmit(aoEnviar)} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">{t("auth:login.email")}</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder={t("auth:login.emailPlaceholder")}
              aria-describedby="email-erro"
              className="pl-9"
              {...register("email")}
            />
          </div>
          {/* Sem isto o formulario fica MUDO: o zod recusa, o submit
              nunca acontece, e o botao parece quebrado. */}
          <p id="email-erro" className="text-sm text-destructive">
            {formState.errors.email?.message}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">{t("auth:login.password")}</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type={mostrarSenha ? "text" : "password"}
              autoComplete="current-password"
              aria-describedby="password-erro"
              className="pl-9 pr-20"
              {...register("password")}
            />
            {/* type="button" e obrigatorio: dentro de um <form>, um <button>
                sem type e submit por padrao, e revelar a senha enviaria o
                formulario. */}
            <button
              type="button"
              onClick={() => setMostrarSenha((estava) => !estava)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-[var(--marca-1)]"
            >
              {mostrarSenha ? t("auth:login.hidePassword") : t("auth:login.showPassword")}
            </button>
          </div>
          <p id="password-erro" className="text-sm text-destructive">
            {formState.errors.password?.message}
          </p>
        </div>

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
          {t("auth:login.submit")}
          <ArrowRight className="size-4" />
        </Button>
      </form>

      {/* Ausente por padrao: sem VITE_DEMO_EMAIL e VITE_DEMO_PASSWORD este
          bloco nao existe. Um acesso sem senha a uma conta so aparece onde
          alguem ligou de proposito — nao acompanha o bundle para qualquer
          ambiente onde o app venha a ser publicado. */}
      {temDemo && (
        <div className="mt-4 flex flex-col items-center gap-1">
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-full"
            disabled={formState.isSubmitting}
            onClick={() => void aoEnviar({ email: demoEmail, password: demoSenha })}
          >
            {t("auth:login.demo")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t("auth:login.demoHint", { email: demoEmail })}
          </p>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/register" className="font-medium text-[var(--marca-1)]">
          {t("auth:login.toRegister")}
        </Link>
      </p>
    </AuthLayout>
  );
}

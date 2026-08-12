import { useEffect, useMemo, useState } from "react";
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
import { codigoTraduzivel, extrairErro } from "@/lib/errors";

type Campos = { email: string; password: string };

export default function LoginPage() {
  const { t } = useTranslation(["auth", "errors", "common"]);
  const [erro, setErro] = useState<string | null>(null);
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

  const campos: Array<{ nome: keyof Campos; rotulo: string; tipo: string; auto: string }> = [
    { nome: "email", rotulo: t("auth:login.email"), tipo: "email", auto: "email" },
    { nome: "password", rotulo: t("auth:login.password"), tipo: "password", auto: "current-password" },
  ];

  return (
    <Card className="mx-auto mt-16 w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("auth:login.title")}</CardTitle>
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
              {/* Sem isto o formulario fica MUDO: o zod recusa, o submit
                  nunca acontece, e o botao parece quebrado. */}
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

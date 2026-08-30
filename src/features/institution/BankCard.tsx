import type { ReactNode } from "react";
import type { Instituicao } from "@/features/account/types";
import InstitutionLogo from "@/features/institution/InstitutionLogo";
import { corLegivel } from "@/lib/cor";

/**
 * A casca visual dos cartoes com identidade de banco: fundo na cor da
 * instituicao, logo, titulo e um canto para acoes.
 *
 * Puramente de apresentacao. Contas e contatos tem dados e acoes que nao se
 * parecem — uma navega para o detalhe, o outro tem tres botoes — e servir os
 * dois com um componente de DADOS produziria um componente cheio de modos.
 * O que eles compartilham de fato e a aparencia.
 *
 * A cor passa por corLegivel: o laranja do Itau reprovaria o contraste com
 * o texto branco daqui.
 */
export default function BankCard({
  instituicao,
  titulo,
  subtitulo,
  acoes,
  children,
}: {
  instituicao: Instituicao;
  titulo: string;
  subtitulo?: string;
  acoes?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      className="h-full p-5 text-white"
      style={{ backgroundColor: corLegivel(instituicao.color_hex) }}
    >
      <div className="flex items-start gap-3">
        <InstitutionLogo instituicao={instituicao} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-bold">{titulo}</p>
          {subtitulo !== undefined && (
            <p className="truncate text-sm text-white/80">{subtitulo}</p>
          )}
        </div>
        {acoes}
      </div>
      {children}
    </div>
  );
}

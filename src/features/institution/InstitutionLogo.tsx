import type { Instituicao } from "@/features/account/types";
import bb from "@/assets/institutions/bb.svg";
import bradesco from "@/assets/institutions/bradesco.svg";
import caixa from "@/assets/institutions/caixa.svg";
import itau from "@/assets/institutions/itau.svg";
import nubank from "@/assets/institutions/nubank.svg";
import santander from "@/assets/institutions/santander.svg";

/**
 * Mapa explicito em vez de import.meta.glob: sao seis bancos fixos, e uma
 * chave escrita errada aqui quebra no build em vez de virar um monograma
 * silencioso em producao.
 */
const LOGOS: Record<string, string> = {
  BB: bb,
  BRADESCO: bradesco,
  CAIXA: caixa,
  ITAU: itau,
  NUBANK: nubank,
  SANTANDER: santander,
};

export default function InstitutionLogo({
  instituicao,
  className = "",
}: {
  instituicao: Instituicao;
  className?: string;
}) {
  const logo = LOGOS[instituicao.code];
  const base = `flex size-10 shrink-0 items-center justify-center rounded-full ${className}`;

  if (logo) {
    return (
      <span className={`${base} overflow-hidden bg-white ring-1 ring-black/5`}>
        <img src={logo} alt={instituicao.name} className="size-7 object-contain" />
      </span>
    );
  }

  // Sem arquivo para o codigo: monograma sobre a cor da propria instituicao,
  // que e o que color_hex existe para fazer.
  return (
    <span
      className={`${base} font-semibold text-white`}
      style={{ backgroundColor: instituicao.color_hex }}
      aria-hidden="true"
    >
      {instituicao.name.charAt(0).toUpperCase()}
    </span>
  );
}

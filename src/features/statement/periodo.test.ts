import { describe, it, expect } from "vitest";
import { periodoDoMes, periodoDosUltimosDias } from "@/features/statement/periodo";

describe("presets de periodo", () => {
  it("este mes vai do dia 1 ao dia de hoje", () => {
    const { date_from, date_to } = periodoDoMes(new Date("2026-05-17T15:00:00Z"));

    expect(date_from).toBe("2026-05-01");
    // Ate HOJE, nao ate o fim do mes: um extrato que termina no futuro
    // sugere que faltam dados que ainda nao existem.
    expect(date_to).toBe("2026-05-17");
  });

  it("mes passado vai do primeiro ao ultimo dia daquele mes", () => {
    const { date_from, date_to } = periodoDoMes(new Date("2026-05-17T15:00:00Z"), -1);

    expect(date_from).toBe("2026-04-01");
    expect(date_to).toBe("2026-04-30");
  });

  it("mes passado em janeiro volta para dezembro do ano anterior", () => {
    // A virada de ano e onde aritmetica de mes costuma errar.
    const { date_from, date_to } = periodoDoMes(new Date("2026-01-10T15:00:00Z"), -1);

    expect(date_from).toBe("2025-12-01");
    expect(date_to).toBe("2025-12-31");
  });

  it("ultimos N dias inclui hoje", () => {
    // 90 dias contados para tras a partir de hoje, com hoje dentro: sao 90
    // dias de extrato, nao 91.
    const { date_from, date_to } = periodoDosUltimosDias(90, new Date("2026-05-17T15:00:00Z"));

    expect(date_to).toBe("2026-05-17");
    expect(date_from).toBe("2026-02-17");
  });
});

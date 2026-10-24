export interface Reserva {
  dia: string;
  nome: string;
  telefone: string;
  observacao: string | null;
  pago: boolean;
}

export type DadosReserva = Omit<Reserva, "dia">;

/** "YYYY-MM-DD" de uma data que existe no calendário (recusa 2026-02-30). */
export function isDia(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function isMes(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function texto(value: unknown, campo: string, max: number, obrigatorio: boolean): string | null {
  if (value === undefined || value === null) {
    if (obrigatorio) throw new Error(`${campo} é obrigatório`);
    return null;
  }
  if (typeof value !== "string") throw new Error(`${campo} deve ser texto`);
  const trimmed = value.trim();
  if (!trimmed) {
    if (obrigatorio) throw new Error(`${campo} é obrigatório`);
    return null;
  }
  if (trimmed.length > max) throw new Error(`${campo} passa de ${max} caracteres`);
  return trimmed;
}

/** Valida o corpo do PUT. Lança Error com a mensagem que vai para o app. */
export function parseDados(body: unknown): DadosReserva {
  if (!body || typeof body !== "object") throw new Error("corpo deve ser um objeto JSON");
  const b = body as Record<string, unknown>;
  if (b.pago !== undefined && typeof b.pago !== "boolean") throw new Error("pago deve ser true ou false");
  return {
    nome: texto(b.nome, "nome", 120, true)!,
    telefone: texto(b.telefone, "telefone", 30, true)!,
    observacao: texto(b.observacao, "observacao", 1000, false),
    pago: b.pago === true,
  };
}

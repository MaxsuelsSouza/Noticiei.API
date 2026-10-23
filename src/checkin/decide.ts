/** Regras puras do check-in automático (sem banco nem rede, para dar para testar). */

/** Notificações mais velhas que isso são ignoradas (ex.: o celular ficou sem internet e reenviou horas depois). */
export const MAX_DELAY_MS = 2 * 60 * 60 * 1000;
/** Tolerância para relógio do celular adiantado. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export type Decision = { action: "checkin" } | { action: "ignorar"; reason: string };

export function decideCheckin(notifiedAt: Date, now: Date = new Date()): Decision {
  if (Number.isNaN(notifiedAt.getTime())) return { action: "ignorar", reason: "notifiedAt inválido" };
  const age = now.getTime() - notifiedAt.getTime();
  if (age < -MAX_CLOCK_SKEW_MS) return { action: "ignorar", reason: "notificação com horário no futuro" };
  if (age > MAX_DELAY_MS) return { action: "ignorar", reason: "notificação velha demais (mais de 2h)" };
  return { action: "checkin" };
}

export type CheckinRequest = { source: string; notifiedAt: Date };

/** Valida o corpo do POST /api/checkin. */
export function parseCheckinBody(body: unknown): CheckinRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { source, notifiedAt } = body as Record<string, unknown>;
  if (typeof source !== "string" || !/^[a-z0-9_-]{1,32}$/.test(source)) return null;
  if (typeof notifiedAt !== "string") return null;
  const date = new Date(notifiedAt);
  return Number.isNaN(date.getTime()) ? null : { source, notifiedAt: date };
}

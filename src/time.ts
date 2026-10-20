export const TIME_ZONE = "America/Sao_Paulo";

/** Data local (YYYY-MM-DD) no fuso do usuário. */
export function localDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(at);
}

/** Regras puras do check-in (sem banco nem rede, para dar para testar). */
import { TIME_ZONE } from "../time.js";

/** Aula como o site da academia devolve em GET /api/checkin?date=. */
export interface Slot {
  horario_aula: string; // 'HH:MM:SS'
  horario_fim: string;
  unidade_borracha: string;
  turma_horario_id: string | null;
  aula_id: string | null;
}

export interface LocalNow {
  /** YYYY-MM-DD no fuso do usuário. */
  date: string;
  /** Minutos desde 00:00 no fuso do usuário. */
  minutes: number;
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localNow(at: Date = new Date()): LocalNow {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday!]!,
  };
}

const toMinutes = (hhmmss: string) => {
  const [h, m] = hhmmss.split(":");
  return Number(h) * 60 + Number(m);
};

/**
 * Escolhe a aula pelo horário do check-in: de `leadMin` minutos antes do início até o fim.
 * Com mais de uma candidata, vence a de início mais próximo do momento atual.
 */
export function pickSlot(slots: Slot[], nowMinutes: number, leadMin = 30): Slot | null {
  const candidates = slots
    .map((slot) => ({ slot, start: toMinutes(slot.horario_aula), end: toMinutes(slot.horario_fim) }))
    .filter(({ start, end }) => nowMinutes >= start - leadMin && nowMinutes <= end)
    .sort((a, b) => Math.abs(nowMinutes - a.start) - Math.abs(nowMinutes - b.start));
  return candidates[0]?.slot ?? null;
}

/** Disparo automático (geofence): só em terça, quinta e sexta, entre 19h e 21h. */
export function autoAllowed(now: LocalNow, days = [2, 4, 5], fromMin = 19 * 60, toMin = 21 * 60): boolean {
  return days.includes(now.weekday) && now.minutes >= fromMin && now.minutes <= toMin;
}

/** '19:30–21:00 Espinheiro' */
export function slotLabel(slot: Slot): string {
  return `${slot.horario_aula.slice(0, 5)}–${slot.horario_fim.slice(0, 5)} ${slot.unidade_borracha}`;
}

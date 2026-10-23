import { sql } from "../db.js";
import { localDate } from "../time.js";
import { decideCheckin, type CheckinRequest } from "./decide.js";
import type { GymSite } from "./borracha.js";

export type CheckinResult =
  | { status: "ok"; date: string; detail: string }
  | { status: "ignorado"; date: string; reason: string }
  | { status: "falhou"; date: string; error: string };

/**
 * Faz no máximo um check-in por dia.
 * A linha do dia é "reservada" no banco antes de chamar o site, então duas notificações quase simultâneas
 * não geram dois check-ins. Uma tentativa que falhou (ou travou há mais de 2 min) pode ser refeita.
 */
export async function runCheckin(request: CheckinRequest, site: GymSite, now = new Date()): Promise<CheckinResult> {
  const date = localDate(request.notifiedAt);
  const decision = decideCheckin(request.notifiedAt, now);
  if (decision.action === "ignorar") return { status: "ignorado", date, reason: decision.reason };

  const db = sql();
  const reserved = await db`
    insert into checkins (checkin_date, status, source, notified_at)
    values (${date}, 'em_andamento', ${request.source}, ${request.notifiedAt.toISOString()})
    on conflict (checkin_date) do update
      set status = 'em_andamento', source = excluded.source, notified_at = excluded.notified_at,
          attempts = checkins.attempts + 1, detail = null, updated_at = now()
      where checkins.status = 'falhou'
         or (checkins.status = 'em_andamento' and checkins.updated_at < now() - interval '2 minutes')
    returning checkin_date`;
  if (reserved.length === 0) return { status: "ignorado", date, reason: "check-in do dia já feito (ou em andamento)" };

  try {
    const { detail } = await site.checkIn();
    await db`update checkins set status = 'ok', detail = ${detail}, updated_at = now() where checkin_date = ${date}`;
    return { status: "ok", date, detail };
  } catch (error) {
    const message = (error as Error).message;
    await db`update checkins set status = 'falhou', detail = ${message}, updated_at = now() where checkin_date = ${date}`;
    return { status: "falhou", date, error: message };
  }
}

export async function recentCheckins(limit = 14) {
  return sql()`
    select checkin_date::text as date, status, source, notified_at, attempts, detail, updated_at
    from checkins order by checkin_date desc limit ${limit}`;
}

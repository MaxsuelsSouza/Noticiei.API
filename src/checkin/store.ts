import { sql } from "../db.js";
import type { Attempt, Source, Status, Store } from "./run.js";
import type { Step } from "./borracha.js";

interface Row {
  id: string;
  at: Date;
  source: Source;
  status: Status;
  message: string;
  data_aula: string;
  aula: string | null;
  unidade: string;
  step: Step | null;
  http_status: number | null;
}

export interface AttemptView extends Attempt {
  id: number;
  /** ISO 8601 */
  at: string;
}

const toView = (r: Row): AttemptView => ({
  id: Number(r.id),
  at: new Date(r.at).toISOString(),
  source: r.source,
  status: r.status,
  message: r.message,
  date: r.data_aula,
  aula: r.aula,
  unidade: r.unidade,
  step: r.step,
  httpStatus: r.http_status,
});

export const dbStore: Store = {
  async alreadyDone(date) {
    const rows = await sql().query("select 1 from checkin_attempts where data_aula = $1 and status in ('ok', 'duplicate') limit 1", [date]);
    return rows.length > 0;
  },

  async record(a) {
    await sql().query(
      `insert into checkin_attempts (source, status, message, data_aula, aula, unidade, step, http_status)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [a.source, a.status, a.message, a.date, a.aula, a.unidade, a.step, a.httpStatus],
    );
  },
};

// data_aula sai como texto: o driver converteria date em Date no fuso do servidor.
export async function listAttempts(limit = 50): Promise<AttemptView[]> {
  const rows = (await sql().query(
    `select id, at, source, status, message, to_char(data_aula, 'YYYY-MM-DD') as data_aula, aula, unidade, step, http_status
     from checkin_attempts order by at desc, id desc limit $1`,
    [limit],
  )) as Row[];
  return rows.map(toView);
}

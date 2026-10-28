import { sql } from "../db.js";
import type { Attempt, Source, Status, Store } from "./run.js";

/** "principal" = BORRACHA_EMAIL; "segunda" = BORRACHA_EMAIL_2, que acompanha a principal. */
export type Conta = "principal" | "segunda";
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
  conta: Conta;
}

export interface AttemptView extends Attempt {
  id: number;
  conta: Conta;
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
  conta: r.conta,
});

/** Banco de uma conta: "já fez hoje" e o histórico valem por conta. */
export const dbStore = (conta: Conta): Store => ({
  async alreadyDone(date) {
    const rows = await sql().query(
      "select 1 from checkin_attempts where conta = $1 and data_aula = $2 and status in ('ok', 'duplicate') limit 1",
      [conta, date],
    );
    return rows.length > 0;
  },

  async record(a) {
    await sql().query(
      `insert into checkin_attempts (source, status, message, data_aula, aula, unidade, step, http_status, conta)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [a.source, a.status, a.message, a.date, a.aula, a.unidade, a.step, a.httpStatus, conta],
    );
  },
});

// data_aula sai como texto: o driver converteria date em Date no fuso do servidor.
// conta nula = todas as contas.
export async function listAttempts(limit = 50, conta: Conta | null = "principal"): Promise<AttemptView[]> {
  const rows = (await sql().query(
    `select id, at, source, status, message, to_char(data_aula, 'YYYY-MM-DD') as data_aula, aula, unidade, step, http_status, conta
     from checkin_attempts where $2::text is null or conta = $2 order by at desc, id desc limit $1`,
    [limit, conta],
  )) as Row[];
  return rows.map(toView);
}

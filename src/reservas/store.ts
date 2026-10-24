import { sql } from "../db.js";
import type { DadosReserva, Reserva } from "./parse.js";

// dia sai como texto: o driver converteria date em Date no fuso do servidor.
export async function listReservas(mes: string): Promise<Reserva[]> {
  return (await sql()`
    select to_char(dia, 'YYYY-MM-DD') as dia, nome, telefone, observacao, pago
    from reservas
    where dia >= ${`${mes}-01`}::date and dia < ${`${mes}-01`}::date + interval '1 month'
    order by dia`) as Reserva[];
}

export async function saveReserva(dia: string, dados: DadosReserva): Promise<Reserva> {
  const [row] = (await sql()`
    insert into reservas (dia, nome, telefone, observacao, pago)
    values (${dia}, ${dados.nome}, ${dados.telefone}, ${dados.observacao}, ${dados.pago})
    on conflict (dia) do update
      set nome = excluded.nome, telefone = excluded.telefone, observacao = excluded.observacao,
          pago = excluded.pago, updated_at = now()
    returning to_char(dia, 'YYYY-MM-DD') as dia, nome, telefone, observacao, pago`) as Reserva[];
  return row!;
}

export async function deleteReserva(dia: string): Promise<boolean> {
  const rows = await sql()`delete from reservas where dia = ${dia} returning dia`;
  return rows.length > 0;
}

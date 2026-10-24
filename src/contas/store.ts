import { sql } from "../db.js";
import { proxima, type Conta, type DadosConta } from "./parse.js";

interface Row {
  id: string;
  nome: string;
  valor_centavos: number;
  vencimento: string;
  repeticao: Conta["repeticao"];
  parcela_atual: number | null;
  parcelas_total: number | null;
  codigo: string | null;
  lembrete_vespera: boolean;
  lembrete_dia: boolean;
  lembrete_insistir: boolean;
  pago_em: Date | null;
  origem_id: string | null;
}

const toConta = (r: Row): Conta => ({
  id: Number(r.id),
  nome: r.nome,
  valorCentavos: r.valor_centavos,
  vencimento: r.vencimento,
  repeticao: r.repeticao,
  parcelaAtual: r.parcela_atual,
  parcelasTotal: r.parcelas_total,
  codigo: r.codigo,
  lembreteVespera: r.lembrete_vespera,
  lembreteDia: r.lembrete_dia,
  lembreteInsistir: r.lembrete_insistir,
  pagoEm: r.pago_em ? new Date(r.pago_em).toISOString() : null,
  origemId: r.origem_id === null ? null : Number(r.origem_id),
});

// vencimento sai como texto: o driver converteria date em Date no fuso do servidor.
const COLUNAS = `id, nome, valor_centavos, to_char(vencimento, 'YYYY-MM-DD') as vencimento, repeticao, parcela_atual,
  parcelas_total, codigo, lembrete_vespera, lembrete_dia, lembrete_insistir, pago_em, origem_id`;

/** Todas em aberto e as pagas nos últimos 45 dias (o app mostra só as do mês corrente no fuso dele). */
export async function listContas(): Promise<Conta[]> {
  const rows = (await sql().query(
    `select ${COLUNAS} from contas
     where pago_em is null or pago_em > now() - interval '45 days'
     order by vencimento, id`,
  )) as Row[];
  return rows.map(toConta);
}

async function insert(dados: DadosConta, origemId: number | null = null): Promise<Conta> {
  const rows = (await sql().query(
    `insert into contas (nome, valor_centavos, vencimento, repeticao, parcela_atual, parcelas_total, codigo,
       lembrete_vespera, lembrete_dia, lembrete_insistir, origem_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning ${COLUNAS}`,
    [dados.nome, dados.valorCentavos, dados.vencimento, dados.repeticao, dados.parcelaAtual, dados.parcelasTotal,
      dados.codigo, dados.lembreteVespera, dados.lembreteDia, dados.lembreteInsistir, origemId],
  )) as Row[];
  return toConta(rows[0]!);
}

export const createConta = (dados: DadosConta) => insert(dados);

export async function updateConta(id: number, dados: DadosConta): Promise<Conta | null> {
  const rows = (await sql().query(
    `update contas set nome = $2, valor_centavos = $3, vencimento = $4, repeticao = $5, parcela_atual = $6,
       parcelas_total = $7, codigo = $8, lembrete_vespera = $9, lembrete_dia = $10, lembrete_insistir = $11,
       updated_at = now()
     where id = $1
     returning ${COLUNAS}`,
    [id, dados.nome, dados.valorCentavos, dados.vencimento, dados.repeticao, dados.parcelaAtual, dados.parcelasTotal,
      dados.codigo, dados.lembreteVespera, dados.lembreteDia, dados.lembreteInsistir],
  )) as Row[];
  return rows[0] ? toConta(rows[0]) : null;
}

export async function deleteConta(id: number): Promise<boolean> {
  const rows = await sql()`delete from contas where id = ${id} returning id`;
  return rows.length > 0;
}

async function getConta(id: number): Promise<Conta | null> {
  const rows = (await sql().query(`select ${COLUNAS} from contas where id = $1`, [id])) as Row[];
  return rows[0] ? toConta(rows[0]) : null;
}

/**
 * Marca como paga e cria a próxima (mensal/parcelas). Idempotente: tocar duas vezes em "Pago"
 * (widget + notificação) não cria duas próximas.
 */
export async function pagarConta(id: number): Promise<{ conta: Conta; proxima: Conta | null } | null> {
  const rows = (await sql().query(
    `update contas set pago_em = now(), updated_at = now() where id = $1 and pago_em is null returning ${COLUNAS}`,
    [id],
  )) as Row[];
  if (!rows[0]) {
    const atual = await getConta(id);
    return atual && { conta: atual, proxima: null };
  }
  const conta = toConta(rows[0]);
  const dados = proxima(conta);
  return { conta, proxima: dados ? await insert(dados, conta.id) : null };
}

/** Volta para em aberto e apaga a próxima criada pelo pagamento, se ela ainda não foi paga. */
export async function desfazerPagamento(id: number): Promise<Conta | null> {
  const rows = (await sql().query(
    `update contas set pago_em = null, updated_at = now() where id = $1 returning ${COLUNAS}`,
    [id],
  )) as Row[];
  if (!rows[0]) return null;
  await sql()`delete from contas where origem_id = ${id} and pago_em is null`;
  return toConta(rows[0]);
}

import { isDia } from "../reservas/parse.js";

export type Repeticao = "uma_vez" | "mensal" | "parcelas";

export interface DadosConta {
  nome: string;
  valorCentavos: number;
  vencimento: string; // YYYY-MM-DD
  repeticao: Repeticao;
  parcelaAtual: number | null;
  parcelasTotal: number | null;
  codigo: string | null;
  lembreteVespera: boolean;
  lembreteDia: boolean;
  lembreteInsistir: boolean;
}

export interface Conta extends DadosConta {
  id: number;
  pagoEm: string | null;
  origemId: number | null;
}

const REPETICOES: Repeticao[] = ["uma_vez", "mensal", "parcelas"];

function inteiro(value: unknown, campo: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${campo} deve ser um inteiro entre ${min} e ${max}`);
  }
  return value;
}

function booleano(value: unknown, campo: string): boolean {
  if (value === undefined) return true;
  if (typeof value !== "boolean") throw new Error(`${campo} deve ser true ou false`);
  return value;
}

/** Valida o corpo do POST/PUT. Lança Error com a mensagem que vai para o app. */
export function parseConta(body: unknown): DadosConta {
  if (!body || typeof body !== "object") throw new Error("corpo deve ser um objeto JSON");
  const b = body as Record<string, unknown>;

  const nome = typeof b.nome === "string" ? b.nome.trim() : "";
  if (!nome) throw new Error("nome é obrigatório");
  if (nome.length > 80) throw new Error("nome passa de 80 caracteres");

  const valorCentavos = inteiro(b.valorCentavos, "valorCentavos", 1, 100_000_000);

  if (typeof b.vencimento !== "string" || !isDia(b.vencimento)) throw new Error("vencimento deve ser YYYY-MM-DD");

  const repeticao = (b.repeticao ?? "uma_vez") as Repeticao;
  if (!REPETICOES.includes(repeticao)) throw new Error("repeticao deve ser uma_vez, mensal ou parcelas");

  let parcelaAtual: number | null = null;
  let parcelasTotal: number | null = null;
  if (repeticao === "parcelas") {
    parcelasTotal = inteiro(b.parcelasTotal, "parcelasTotal", 2, 120);
    parcelaAtual = inteiro(b.parcelaAtual ?? 1, "parcelaAtual", 1, parcelasTotal);
  }

  let codigo: string | null = null;
  if (b.codigo !== undefined && b.codigo !== null) {
    if (typeof b.codigo !== "string") throw new Error("codigo deve ser texto");
    codigo = b.codigo.trim() || null;
    if (codigo && codigo.length > 300) throw new Error("codigo passa de 300 caracteres");
  }

  return {
    nome,
    valorCentavos,
    vencimento: b.vencimento,
    repeticao,
    parcelaAtual,
    parcelasTotal,
    codigo,
    lembreteVespera: booleano(b.lembreteVespera, "lembreteVespera"),
    lembreteDia: booleano(b.lembreteDia, "lembreteDia"),
    lembreteInsistir: booleano(b.lembreteInsistir, "lembreteInsistir"),
  };
}

/** Mesmo dia no mês seguinte; vira o último dia quando o mês é mais curto (31/01 → 28/02). */
export function nextMonth(dia: string): string {
  const [y, m, d] = dia.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const next = new Date(Date.UTC(y, m, Math.min(d, last)));
  return next.toISOString().slice(0, 10);
}

/** A conta que vem depois desta ser paga, ou null se não repete (ou era a última parcela). */
export function proxima(conta: DadosConta): DadosConta | null {
  if (conta.repeticao === "uma_vez") return null;
  if (conta.repeticao === "parcelas" && conta.parcelaAtual! >= conta.parcelasTotal!) return null;
  return {
    ...conta,
    vencimento: nextMonth(conta.vencimento),
    parcelaAtual: conta.repeticao === "parcelas" ? conta.parcelaAtual! + 1 : null,
  };
}

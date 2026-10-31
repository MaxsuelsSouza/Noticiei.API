/** "1.234,56" / "36,9" / "14.99" → número. Vírgula é sempre decimal; ponto antes de vírgula é milhar. */
export function numeroBr(texto: string): number {
  let t = texto.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`número inválido: ${texto}`);
  return n;
}

// O 1e-6 corrige a imprecisão do ponto flutuante (8,285 × 100 = 828,4999…) antes de arredondar.
export const centavos = (reais: number) => Math.round(reais * 100 + 1e-6);

/** Valor da linha: quantidade × preço, arredondado em centavos só no final. */
export const valorLinha = (quantidade: number, precoUnitario: number) => centavos(quantidade * precoUnitario);

/** Unidade da nota (UND9, KG9, BDJ5, PCT9) → UN ou KG. */
export function unidadeBase(unidade: string): "UN" | "KG" {
  return /^KG/i.test(unidade.trim()) ? "KG" : "UN";
}

/** Sem acento, maiúsculas, só letras/números/espaço. */
export function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
}

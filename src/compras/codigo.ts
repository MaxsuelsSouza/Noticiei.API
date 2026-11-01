/**
 * Código lido pela câmera do app.
 *   - EAN-8, UPC-A (12), EAN-13 ou GTIN-14 com dígito verificador certo → código da embalagem.
 *   - EAN-13 começando com 2 → etiqueta de balança do próprio mercado: traz o código do produto na balança e o
 *     valor daquele pacote, e muda a cada pesagem. Não é salvo como código fixo; o produto é ligado pelo prefixo.
 */

export type CodigoLido =
  | { tipo: "ean"; codigo: string }
  | { tipo: "balanca"; codigo: string; prefixo: string; valorCentavos: number }
  | { tipo: "invalido"; motivo: string };

export function digitoGtin(semDv: string): number {
  let soma = 0;
  for (let i = semDv.length - 1, peso = 3; i >= 0; i--, peso = peso === 3 ? 1 : 3) soma += Number(semDv[i]) * peso;
  return (10 - (soma % 10)) % 10;
}

export const gtinValido = (codigo: string) =>
  /^(\d{8}|\d{12,14})$/.test(codigo) && digitoGtin(codigo.slice(0, -1)) === Number(codigo.at(-1));

/**
 * Formato da etiqueta de balança: 2 + código do produto (5 dígitos) + valor em centavos (6 dígitos) + DV.
 * É o formato mais comum; balanças configuradas com valor de 5 dígitos usam um 0 de enchimento na 7ª posição,
 * que cai certo do mesmo jeito. O app sempre mostra o valor lido para conferir com a etiqueta.
 */
export function lerCodigo(entrada: string): CodigoLido {
  const codigo = entrada.replace(/\D/g, "");
  if (!gtinValido(codigo)) return { tipo: "invalido", motivo: "código de barras inválido (dígito verificador não confere)" };
  // UPC-A de 12 dígitos é o mesmo produto que o EAN-13 com 0 na frente: guarda sempre com 13.
  const normal = codigo.length === 12 ? `0${codigo}` : codigo;
  if (normal.length === 13 && normal.startsWith("2")) {
    return { tipo: "balanca", codigo: normal, prefixo: normal.slice(0, 6), valorCentavos: Number(normal.slice(6, 12)) };
  }
  return { tipo: "ean", codigo: normal };
}

export interface SugestaoProduto {
  nome: string;
  marca: string | null;
  quantidade: string | null;
  fonte: "openfoodfacts";
}

/**
 * Open Food Facts: base aberta e colaborativa. A cobertura de produtos brasileiros é irregular, então é só sugestão
 * para preencher o nome na primeira leitura; qualquer falha (sem rede, lento, não achou) devolve null.
 */
export async function sugerirOpenFoodFacts(ean: string, timeoutMs = 4_000): Promise<SugestaoProduto | null> {
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=product_name,product_name_pt,brands,quantity`;
    const r = await fetch(url, {
      headers: { "user-agent": "Noticiei/1.0 (app pessoal de lista de compras)" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return null;
    const body = (await r.json()) as {
      status?: number;
      product?: { product_name?: string; product_name_pt?: string; brands?: string; quantity?: string };
    };
    const p = body.product;
    const nome = (p?.product_name_pt || p?.product_name || "").trim();
    if (body.status !== 1 || !nome) return null;
    const marca = p?.brands?.split(",")[0]?.trim() || null;
    const quantidade = p?.quantity?.trim() || null;
    const completo = [nome, marca && !nome.toLowerCase().includes(marca.toLowerCase()) ? marca : null, quantidade]
      .filter(Boolean)
      .join(" ");
    return { nome: completo.slice(0, 120), marca, quantidade, fonte: "openfoodfacts" };
  } catch {
    return null;
  }
}

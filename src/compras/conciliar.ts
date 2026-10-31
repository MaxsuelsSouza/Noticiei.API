import { semAcento } from "./numeros.js";

/**
 * Conferência do que foi anotado no mercado com a nota. Função pura: o store resolve o produto de cada linha
 * da nota (pelo código de barras ou pelo código da loja já vinculados) e passa tudo pronto.
 *
 * Pareamento, do mais seguro ao menos seguro:
 *   1. mesmo produto do catálogo (código de barras escaneado ou código da loja já vinculado)  → "codigo"
 *   2. nome parecido (abreviações do PDV expandidas), desempate pelo valor mais próximo      → "nome" ou "provavel"
 *   3. só o valor bate, e é o único valor igual que sobrou dos dois lados                    → "provavel"
 * "provavel" pede confirmação no app; confirmar vincula o código da loja ao produto e na próxima compra vira "codigo".
 * Anotações iguais (duas calabresas) e linhas iguais da nota (sabonete em dois códigos) são somadas antes.
 */

export interface Anotado {
  id: number;
  descricao: string;
  produtoId: number | null;
  quantidade: number;
  unidade: "UN" | "KG";
  precoUnitario: number;
  valorCentavos: number;
  emPromocao: boolean;
}

export interface LinhaNota {
  id: number;
  descricao: string;
  produtoId: number | null;
  codigoLoja: string | null;
  ean: string | null;
  quantidade: number;
  unidade: "UN" | "KG";
  precoUnitario: number;
  valorCentavos: number;
  descontoCentavos: number;
}

export type Tipo = "OK" | "ARREDONDAMENTO" | "PRECO" | "QUANTIDADE" | "PESO" | "NAO_ANOTADO" | "NAO_ENCONTRADO";
export type Confianca = "codigo" | "nome" | "provavel";

export interface Par {
  anotados: Anotado[];
  linhas: LinhaNota[];
  confianca: Confianca;
  tipos: Tipo[];
  valorAnotadoCentavos: number;
  valorNotaCentavos: number;
  diferencaCentavos: number;
  /** Só quando alguma anotação foi marcada como promoção. */
  promocao: "aplicada" | "nao_aplicada" | null;
}

export interface Alerta {
  tipo: Tipo | "PROMOCAO_NAO_APLICADA" | "CONFIRMAR";
  texto: string;
  impactoCentavos: number;
}

export interface Conciliacao {
  pares: Par[];
  naoAnotados: LinhaNota[];
  naoEncontrados: (Anotado & { sugestoes: LinhaNota[] })[];
  resumo: {
    totalAnotadoCentavos: number;
    divergenciasCentavos: number;
    naoAnotadosCentavos: number;
    naoEncontradosCentavos: number;
    subtotalNotaCentavos: number;
    descontosCentavos: number;
    descontosFonte: "nota" | "manual" | "nenhum";
    totalPagoCentavos: number;
    lancamentos: number;
    paresOk: number;
    paresDivergentes: number;
    paraConfirmar: number;
    fechaConta: boolean;
  };
  /** Divergências grandes, da maior para a menor: é o que o app mostra primeiro. */
  alertas: Alerta[];
}

// ───────── nomes ─────────

/** Abreviações do PDV → palavras. Aplicadas na descrição da nota antes de comparar. */
const ABREVIACOES: [RegExp, string][] = [
  [/\bRF\.?\s*LING\.?\s*(T\.?\s*)?CALAB\.?/g, " LINGUICA CALABRESA "],
  [/\bLING\.?/g, " LINGUICA "],
  [/\bCALAB\.?/g, " CALABRESA "],
  [/\bESC\.?\s*DENTAL\b/g, " ESCOVA DENTE DENTAL "],
  [/\bCR\.?\s*DENTAL\b/g, " CREME DENTAL "],
  [/\bAP\.?\s*BARB\.?/g, " APARELHO BARBEAR BARBEADOR "],
  [/\bDET\.?\s*PO\b/g, " SABAO EM PO DETERGENTE "],
  [/\bDET\.?\s*LIQ\.?/g, " DETERGENTE LIQUIDO "],
  [/\bBEB\.?\s*LAC\.?/g, " BEBIDA LACTEA "],
  [/\bSAC\.?\s*INST\.?/g, " SACOLA "],
  [/\bBOV\./g, " BOVINO CARNE "],
  [/\bFGO\b/g, " FRANGO "],
  [/\bMAC\./g, " MACARRAO "],
  [/\bSAB\./g, " SABONETE "],
  [/\bDES\./g, " DESODORANTE "],
  [/\bABS\./g, " ABSORVENTE "],
  [/\bACHOC\./g, " ACHOCOLATADO "],
  [/\bBISC\./g, " BISCOITO "],
  [/\bMAION\./g, " MAIONESE "],
  [/\bMARG\./g, " MARGARINA "],
  [/\bMUSS\./g, " MUCARELA QUEIJO "],
  [/\bMORTAD\./g, " MORTADELA "],
  [/\bSARD\./g, " SARDINHA "],
  [/\bIOG\b/g, " IOGURTE "],
  [/\bJERKEED\b/g, " CHARQUE "],
  [/\bHIG\./g, " HIGIENICO "],
  [/\bCOND\./g, " CONDICIONADOR CABELO "],
  [/\bTEMP\./g, " TEMPERO "],
  [/\bHF\./g, " "],
  [/\bPARB\./g, " PARBOILIZADO "],
  [/\bTRAD\.?/g, " TRADICIONAL "],
  [/\bINTEG\./g, " INTEGRAL "],
];

const VAZIAS = new Set(["DE", "DA", "DO", "DAS", "DOS", "EM", "COM", "E", "O", "A", "UN", "KG"]);

export function tokens(texto: string, daNota = false): string[] {
  let t = semAcento(texto);
  if (daNota) for (const [re, troca] of ABREVIACOES) t = t.replace(re, troca);
  return t.split(/[^A-Z0-9]+/).filter((p) => p.length >= 2 && !VAZIAS.has(p) && !/^\d+$/.test(p));
}

/**
 * Coisas diferentes que a gente costuma chamar pelo mesmo nome no mercado. Valem 0,7: o par sai como "provavel"
 * e pede confirmação (é assim que a margarina anotada como manteiga aparece para conferir).
 */
const PARECIDOS: [string, string][] = [
  ["MANTEIGA", "MARGARINA"],
  ["CUSCUZ", "FLOCAO"],
  ["BUCHA", "ESPONJA"],
  ["QUEIJO", "MUCARELA"],
  ["MUSSARELA", "MUCARELA"],
  ["DETERGENTE", "LAVA"],
  ["REFRIGERANTE", "REFRI"],
];
const parecidos = new Set(PARECIDOS.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));

function trigramas(p: string): Set<string> {
  const s = new Set<string>();
  const x = ` ${p} `;
  for (let i = 0; i + 3 <= x.length; i++) s.add(x.slice(i, i + 3));
  return s;
}

function parecida(a: string, b: string): number {
  if (a === b) return 1;
  if (parecidos.has(`${a}|${b}`)) return 0.7;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.95;
  const ta = trigramas(a);
  const tb = trigramas(b);
  let comum = 0;
  for (const t of ta) if (tb.has(t)) comum++;
  const dice = (2 * comum) / (ta.size + tb.size);
  return dice >= 0.5 ? dice : 0;
}

/** Quanto das palavras anotadas aparece na descrição da nota (0 a 1), mais um pouco pela cobertura da nota. */
export function similaridade(anotado: string, nota: string): { anotado: number; nota: number } {
  const a = tokens(anotado);
  const n = tokens(nota, true);
  if (!a.length || !n.length) return { anotado: 0, nota: 0 };
  const melhor = (p: string, lista: string[]) => Math.max(0, ...lista.map((q) => parecida(p, q)));
  return {
    anotado: a.reduce((s, p) => s + melhor(p, n), 0) / a.length,
    nota: n.reduce((s, p) => s + melhor(p, a), 0) / n.length,
  };
}

// ───────── grupos ─────────

interface Grupo<T> {
  chave: string;
  produtoId: number | null;
  itens: T[];
  descricao: string;
  valor: number;
  quantidade: number;
  unidade: "UN" | "KG";
}

function agrupar<T extends { descricao: string; produtoId: number | null; valorCentavos: number; quantidade: number; unidade: "UN" | "KG" }>(
  lista: T[],
  daNota: boolean,
): Grupo<T>[] {
  const mapa = new Map<string, Grupo<T>>();
  for (const item of lista) {
    const chave = item.produtoId !== null ? `p${item.produtoId}` : `t${tokens(item.descricao, daNota).join(" ")}`;
    let g = mapa.get(chave);
    if (!g) {
      g = { chave, produtoId: item.produtoId, itens: [], descricao: item.descricao, valor: 0, quantidade: 0, unidade: item.unidade };
      mapa.set(chave, g);
    }
    g.itens.push(item);
    g.valor += item.valorCentavos;
    g.quantidade += item.quantidade;
  }
  return [...mapa.values()];
}

const precoMedio = (g: Grupo<{ precoUnitario: number; quantidade: number }>) =>
  g.quantidade > 0 ? g.itens.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0) / g.quantidade : 0;

function tiposDe(a: Grupo<Anotado>, n: Grupo<LinhaNota>): Tipo[] {
  const diff = n.valor - a.valor;
  if (diff === 0) return ["OK"];
  if (Math.abs(diff) <= 2) return ["ARREDONDAMENTO"];
  if (a.unidade !== n.unidade) return ["PRECO"];
  const tipos: Tipo[] = [];
  if (Math.abs(a.quantidade - n.quantidade) > 0.0005) tipos.push(a.unidade === "KG" ? "PESO" : "QUANTIDADE");
  if (Math.abs(precoMedio(a) - precoMedio(n)) > 0.005) tipos.push("PRECO");
  return tipos.length ? tipos : ["PRECO"];
}

function promocaoDe(a: Grupo<Anotado>, n: Grupo<LinhaNota>): Par["promocao"] {
  if (!a.itens.some((i) => i.emPromocao)) return null;
  if (n.itens.some((l) => l.descontoCentavos > 0)) return "aplicada";
  return precoMedio(n) <= precoMedio(a) + 0.005 ? "aplicada" : "nao_aplicada";
}

const reais = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
const comSinal = (c: number) => `${c > 0 ? "+" : c < 0 ? "−" : ""}${reais(Math.abs(c))}`;

export interface Opcoes {
  descontosNotaCentavos: number | null;
  descontoManualCentavos: number | null;
  totalNotaCentavos: number | null;
  /** A partir de quanto uma diferença é "grande" (padrão R$ 1,00). */
  limiteCentavos?: number;
}

export function conciliar(anotados: Anotado[], linhas: LinhaNota[], opcoes: Opcoes): Conciliacao {
  const ga = agrupar(anotados, false);
  const gn = agrupar(linhas, true);
  const usadosA = new Set<Grupo<Anotado>>();
  const usadosN = new Set<Grupo<LinhaNota>>();
  const ligados: { a: Grupo<Anotado>; n: Grupo<LinhaNota>; confianca: Confianca }[] = [];
  const ligar = (a: Grupo<Anotado>, n: Grupo<LinhaNota>, confianca: Confianca) => {
    usadosA.add(a);
    usadosN.add(n);
    ligados.push({ a, n, confianca });
  };

  // 1. Mesmo produto do catálogo.
  for (const a of ga) {
    if (a.produtoId === null) continue;
    const n = gn.find((x) => x.produtoId === a.produtoId && !usadosN.has(x));
    if (n) ligar(a, n, "codigo");
  }

  // 2. Nome parecido, do par mais forte para o mais fraco.
  const candidatos: { a: Grupo<Anotado>; n: Grupo<LinhaNota>; score: number; nome: number }[] = [];
  for (const a of ga) {
    if (usadosA.has(a)) continue;
    for (const n of gn) {
      // Linha já vinculada a outro produto do catálogo não vai para uma anotação de outro produto.
      if (usadosN.has(n) || (a.produtoId !== null && n.produtoId !== null)) continue;
      const sim = similaridade(a.descricao, n.descricao);
      if (sim.anotado < 0.45) continue;
      const maior = Math.max(a.valor, n.valor, 1);
      const score = sim.anotado + 0.1 * sim.nota - 0.3 * (Math.abs(a.valor - n.valor) / maior)
        + (a.valor === n.valor ? 0.5 : 0) + (a.unidade === "KG" && n.unidade === "KG" ? 0.1 : 0);
      candidatos.push({ a, n, score, nome: sim.anotado });
    }
  }
  candidatos.sort((x, y) => y.score - x.score);
  for (const c of candidatos) {
    if (usadosA.has(c.a) || usadosN.has(c.n)) continue;
    const forte = c.nome >= 0.75 || (c.nome >= 0.45 && c.a.valor === c.n.valor);
    ligar(c.a, c.n, forte ? "nome" : "provavel");
  }

  // 3. Só o valor: vale quando aquele valor é único dos dois lados entre o que sobrou.
  const sobraA = ga.filter((a) => !usadosA.has(a));
  const sobraN = gn.filter((n) => !usadosN.has(n));
  for (const a of sobraA) {
    const mesmos = sobraN.filter((n) => n.valor === a.valor && !usadosN.has(n));
    const rivais = sobraA.filter((x) => x.valor === a.valor);
    if (mesmos.length === 1 && rivais.length === 1) ligar(a, mesmos[0]!, "provavel");
  }

  const pares: Par[] = ligados.map(({ a, n, confianca }) => ({
    anotados: a.itens,
    linhas: n.itens,
    confianca,
    tipos: tiposDe(a, n),
    valorAnotadoCentavos: a.valor,
    valorNotaCentavos: n.valor,
    diferencaCentavos: n.valor - a.valor,
    promocao: promocaoDe(a, n),
  }));
  const ordem = new Map(anotados.map((x, i) => [x.id, i]));
  pares.sort((x, y) => ordem.get(x.anotados[0]!.id)! - ordem.get(y.anotados[0]!.id)!);

  const naoAnotados = gn.filter((n) => !usadosN.has(n)).flatMap((n) => n.itens);
  // Para o que não achou par, até 5 linhas que sobraram da nota, pelo nome e depois pelo valor mais perto:
  // é a lista que o app mostra para você escolher (Manteiga → MARG.QUALY).
  const sugestoes = (a: Grupo<Anotado>) =>
    gn
      .filter((n) => !usadosN.has(n))
      .map((n) => ({ n, s: similaridade(a.descricao, n.descricao).anotado - Math.abs(a.valor - n.valor) / Math.max(a.valor, n.valor, 1) }))
      .sort((x, y) => y.s - x.s)
      .slice(0, 5)
      .flatMap((x) => x.n.itens);
  const naoEncontrados = ga.filter((a) => !usadosA.has(a)).flatMap((a) => {
    const lista = sugestoes(a);
    return a.itens.map((i) => ({ ...i, sugestoes: lista }));
  });

  const soma = <T extends { valorCentavos: number }>(l: T[]) => l.reduce((s, x) => s + x.valorCentavos, 0);
  const totalAnotado = soma(anotados);
  const subtotal = soma(linhas);
  const divergencias = pares.reduce((s, p) => s + p.diferencaCentavos, 0);
  const naoAnotadosCentavos = soma(naoAnotados);
  const naoEncontradosCentavos = soma(naoEncontrados);

  let descontos = 0;
  let descontosFonte: Conciliacao["resumo"]["descontosFonte"] = "nenhum";
  if (opcoes.descontosNotaCentavos !== null && opcoes.descontosNotaCentavos > 0) {
    descontos = opcoes.descontosNotaCentavos;
    descontosFonte = "nota";
  } else if (opcoes.descontoManualCentavos !== null) {
    descontos = opcoes.descontoManualCentavos;
    descontosFonte = "manual";
  }

  const limite = opcoes.limiteCentavos ?? 100;
  const alertas: Alerta[] = [];
  for (const p of pares) {
    const nome = p.anotados[0]!.descricao;
    const nota = p.linhas[0]!.descricao;
    if (p.promocao === "nao_aplicada") {
      alertas.push({ tipo: "PROMOCAO_NAO_APLICADA", texto: `${nome}: estava em promoção, mas a nota cobrou ${comSinal(p.diferencaCentavos)} a mais`, impactoCentavos: Math.abs(p.diferencaCentavos) });
    } else if (Math.abs(p.diferencaCentavos) >= limite) {
      alertas.push({ tipo: p.tipos[0]!, texto: `${nome} → ${nota}: ${comSinal(p.diferencaCentavos)} (${p.tipos.join(" e ").toLowerCase()})`, impactoCentavos: Math.abs(p.diferencaCentavos) });
    }
    if (p.confianca === "provavel") {
      alertas.push({ tipo: "CONFIRMAR", texto: `Confirme: "${nome}" é ${nota}?`, impactoCentavos: 0 });
    }
  }
  for (const l of naoAnotados) {
    if (l.valorCentavos >= limite) alertas.push({ tipo: "NAO_ANOTADO", texto: `Na nota e não anotado: ${l.descricao} (${reais(l.valorCentavos)})`, impactoCentavos: l.valorCentavos });
  }
  for (const a of naoEncontrados) {
    alertas.push({ tipo: "NAO_ENCONTRADO", texto: `Anotado e não achei na nota: ${a.descricao} (${reais(a.valorCentavos)})`, impactoCentavos: a.valorCentavos });
  }
  // Promoção não aplicada vem primeiro (é dinheiro a reclamar no caixa), depois pelo tamanho da diferença.
  const prioridade = (a: Alerta) => (a.tipo === "PROMOCAO_NAO_APLICADA" ? 1 : 0);
  alertas.sort((x, y) => prioridade(y) - prioridade(x) || y.impactoCentavos - x.impactoCentavos);

  return {
    pares,
    naoAnotados,
    naoEncontrados,
    resumo: {
      totalAnotadoCentavos: totalAnotado,
      divergenciasCentavos: divergencias,
      naoAnotadosCentavos,
      naoEncontradosCentavos,
      subtotalNotaCentavos: subtotal,
      descontosCentavos: descontos,
      descontosFonte,
      totalPagoCentavos: opcoes.totalNotaCentavos ?? subtotal - descontos,
      lancamentos: anotados.length,
      paresOk: pares.filter((p) => p.tipos[0] === "OK").length,
      paresDivergentes: pares.filter((p) => p.tipos[0] !== "OK").length,
      paraConfirmar: pares.filter((p) => p.confianca === "provavel").length,
      fechaConta: totalAnotado + divergencias + naoAnotadosCentavos - naoEncontradosCentavos === subtotal,
    },
    alertas,
  };
}

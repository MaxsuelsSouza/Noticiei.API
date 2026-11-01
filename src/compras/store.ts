import { sql } from "../db.js";
import { lerAnotacao } from "./anotacao.js";
import { lerCodigo, sugerirOpenFoodFacts, type SugestaoProduto } from "./codigo.js";
import { conciliar, similaridade, type Anotado, type Conciliacao, type LinhaNota } from "./conciliar.js";
import type { NotaLida } from "./nota.js";
import { nomeLegivel } from "./nomes.js";
import { valorLinha } from "./numeros.js";

export class ErroCompras extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
type Unidade = "UN" | "KG";

/** Linha da nota → produto, pelo código da loja (no CNPJ da nota) ou pelo código de barras. */
const CODIGO_DA_LINHA = `((c.tipo = 'loja' and c.escopo = n.cnpj and c.codigo = i.codigo_loja) or (c.tipo = 'ean' and c.escopo = '' and c.codigo = i.ean))`;

const escopoBalanca = (mercadoId: number | null) => (mercadoId ? `m${mercadoId}` : "");

// ───────── mercados ─────────

export interface Mercado {
  id: number;
  nome: string;
  cnpj: string | null;
}

interface MercadoRow {
  id: string;
  nome: string;
  cnpj: string | null;
}

const toMercado = (r: MercadoRow): Mercado => ({ id: Number(r.id), nome: r.nome, cnpj: r.cnpj });

async function getMercado(id: number): Promise<Mercado | null> {
  const rows = (await sql().query(`select id, nome, cnpj from compras_mercados where id = $1`, [id])) as MercadoRow[];
  return rows[0] ? toMercado(rows[0]) : null;
}

/** Mercados já usados, do mais recente para o mais antigo: é a lista de "onde você está comprando?". */
export async function listarMercados() {
  const rows = (await sql().query(
    `select m.id, m.nome, m.cnpj, count(s.id)::int as compras, max(s.created_at) as ultima
       from compras_mercados m left join compras_sessoes s on s.mercado_id = m.id
      group by m.id order by max(s.created_at) desc nulls last, m.nome`,
  )) as (MercadoRow & { compras: number; ultima: Date | null })[];
  return rows.map((r) => ({ ...toMercado(r), compras: r.compras, ultimaCompra: r.ultima ? new Date(r.ultima).toISOString() : null }));
}

/** "Outro supermercado": nasce só com o nome; o CNPJ chega com a primeira nota de lá. */
export async function criarMercado(nome: string): Promise<Mercado> {
  const n = nome.trim();
  if (!n || n.length > 80) throw new ErroCompras("nome do mercado é obrigatório (até 80 letras)");
  const rows = (await sql().query(`insert into compras_mercados (nome) values ($1) returning id, nome, cnpj`, [n])) as MercadoRow[];
  return toMercado(rows[0]!);
}

export async function renomearMercado(id: number, nome: string): Promise<Mercado> {
  const n = nome.trim();
  if (!n || n.length > 80) throw new ErroCompras("nome do mercado é obrigatório (até 80 letras)");
  const rows = (await sql().query(`update compras_mercados set nome = $2 where id = $1 returning id, nome, cnpj`, [id, n])) as MercadoRow[];
  if (!rows[0]) throw new ErroCompras("mercado não encontrado", 404);
  return toMercado(rows[0]);
}

// ───────── catálogo ─────────

export interface PrecoNota {
  precoUnitario: number;
  unidade: Unidade;
  data: string;
  mercadoId: number | null;
  mercado: string | null;
  chave: string;
}

export interface Produto {
  id: number;
  nome: string;
  unidade: Unidade;
  codigos: { tipo: "ean" | "loja" | "balanca"; codigo: string; cnpj: string | null; mercadoId: number | null }[];
  /** Último preço pago (nota) ou anotado. Com mercado escolhido, só o daquele mercado. */
  ultimoPreco: { precoUnitario: number; data: string; origem: "nota" | "anotado"; mercadoId: number | null } | null;
}

interface ProdutoRow {
  id: string;
  nome: string;
  unidade: Unidade;
}

/** Preços de nota dos produtos, do mais novo para o mais antigo. */
async function precosDeNota(ids: number[]): Promise<(PrecoNota & { produtoId: number; itemNotaId: number })[]> {
  if (!ids.length) return [];
  const rows = (await sql().query(
    `select distinct on (i.id) c.produto_id, i.id as item_id, i.preco_unitario, i.unidade, n.chave,
            coalesce(n.emitida_em, n.created_at) as data, m.id as mercado_id, coalesce(m.nome, n.estabelecimento) as mercado
       from compras_itens_nota i
       join compras_notas n on n.chave = i.chave
       join compras_codigos c on ${CODIGO_DA_LINHA}
       left join compras_mercados m on m.cnpj = n.cnpj
      where c.produto_id = any($1::bigint[])
      order by i.id`,
    [ids],
  )) as { produto_id: string; item_id: string; preco_unitario: string; unidade: Unidade; chave: string; data: Date; mercado_id: string | null; mercado: string | null }[];
  return rows
    .map((r) => ({
      produtoId: Number(r.produto_id),
      itemNotaId: Number(r.item_id),
      precoUnitario: Number(r.preco_unitario),
      unidade: r.unidade,
      data: new Date(r.data).toISOString(),
      mercadoId: num(r.mercado_id),
      mercado: r.mercado,
      chave: r.chave,
    }))
    .sort((a, b) => b.data.localeCompare(a.data) || b.itemNotaId - a.itemNotaId);
}

async function montarProdutos(rows: ProdutoRow[], mercadoId: number | null = null): Promise<Produto[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => Number(r.id));
  const codigos = (await sql().query(
    `select produto_id, tipo, escopo, codigo from compras_codigos where produto_id = any($1::bigint[]) order by created_at`,
    [ids],
  )) as { produto_id: string; tipo: "ean" | "loja" | "balanca"; escopo: string; codigo: string }[];
  const notas = await precosDeNota(ids);
  const anotados = (await sql().query(
    `select distinct on (i.produto_id) i.produto_id, i.preco_unitario, i.created_at, s.mercado_id
       from compras_itens i join compras_sessoes s on s.id = i.sessao_id
      where i.produto_id = any($1::bigint[]) and ($2::bigint is null or s.mercado_id = $2)
      order by i.produto_id, i.created_at desc`,
    [ids, mercadoId],
  )) as { produto_id: string; preco_unitario: string; created_at: Date; mercado_id: string | null }[];

  return rows.map((r) => {
    const id = Number(r.id);
    const nota = notas.find((p) => p.produtoId === id && (mercadoId === null || p.mercadoId === mercadoId));
    const anotado = anotados.find((a) => Number(a.produto_id) === id);
    const ultimoPreco = nota
      ? { precoUnitario: nota.precoUnitario, data: nota.data, origem: "nota" as const, mercadoId: nota.mercadoId }
      : anotado
        ? { precoUnitario: Number(anotado.preco_unitario), data: new Date(anotado.created_at).toISOString(), origem: "anotado" as const, mercadoId: num(anotado.mercado_id) }
        : null;
    return {
      id,
      nome: r.nome,
      unidade: r.unidade,
      codigos: codigos
        .filter((c) => Number(c.produto_id) === id)
        .map((c) => ({
          tipo: c.tipo,
          codigo: c.codigo,
          cnpj: c.tipo === "loja" ? c.escopo : null,
          mercadoId: c.tipo === "balanca" && c.escopo ? Number(c.escopo.slice(1)) : null,
        })),
      ultimoPreco,
    };
  });
}

export async function getProduto(id: number, mercadoId: number | null = null): Promise<Produto | null> {
  const rows = (await sql().query(`select id, nome, unidade from compras_produtos where id = $1`, [id])) as ProdutoRow[];
  return (await montarProdutos(rows, mercadoId))[0] ?? null;
}

async function produtoDoCodigo(tipo: "ean" | "loja" | "balanca", codigo: string, escopo = "", mercadoId: number | null = null): Promise<Produto | null> {
  const rows = (await sql().query(
    `select p.id, p.nome, p.unidade from compras_codigos c join compras_produtos p on p.id = c.produto_id
      where c.tipo = $1 and c.escopo = $2 and c.codigo = $3`,
    [tipo, escopo, codigo],
  )) as ProdutoRow[];
  return (await montarProdutos(rows, mercadoId))[0] ?? null;
}

async function mercadoDaSessao(sessaoId: number | null | undefined): Promise<number | null> {
  if (!sessaoId) return null;
  const rows = (await sql().query(`select mercado_id from compras_sessoes where id = $1`, [sessaoId])) as { mercado_id: string | null }[];
  if (!rows[0]) throw new ErroCompras("sessão não encontrada", 404);
  return num(rows[0].mercado_id);
}

export type Leitura =
  | { status: "conhecido"; codigo: string; balanca: { valorCentavos: number } | null; produto: Produto }
  | { status: "novo"; codigo: string; balanca: { valorCentavos: number } | null; sugestao: SugestaoProduto | null };

/**
 * O app leu um código de barras. Conhecido → o produto e o último preço naquele mercado, para adicionar com um
 * toque (a comparação com outros mercados só aparece no relatório, depois da nota). Novo → sugestão de nome do
 * Open Food Facts; o app pergunta "esse produto já foi comprado?" e mostra a busca.
 */
export async function lerCodigoDeBarras(entrada: string, opcoes: { sugerir?: boolean; sessaoId?: number } = {}): Promise<Leitura> {
  const lido = lerCodigo(entrada);
  if (lido.tipo === "invalido") throw new ErroCompras(lido.motivo);
  const mercadoId = await mercadoDaSessao(opcoes.sessaoId);
  if (lido.tipo === "balanca") {
    const balanca = { valorCentavos: lido.valorCentavos };
    const produto = await produtoDoCodigo("balanca", lido.prefixo, escopoBalanca(mercadoId), mercadoId);
    return produto ? { status: "conhecido", codigo: lido.prefixo, balanca, produto } : { status: "novo", codigo: lido.prefixo, balanca, sugestao: null };
  }
  const produto = await produtoDoCodigo("ean", lido.codigo, "", mercadoId);
  if (produto) return { status: "conhecido", codigo: lido.codigo, balanca: null, produto };
  return { status: "novo", codigo: lido.codigo, balanca: null, sugestao: opcoes.sugerir === false ? null : await sugerirOpenFoodFacts(lido.codigo) };
}

export interface ItemDaNotaSemProduto {
  itemNotaId: number;
  descricao: string;
  cnpj: string;
  estabelecimento: string | null;
  codigoLoja: string | null;
  ean: string | null;
  unidade: Unidade;
  precoUnitario: number;
  compradoEm: string;
}

/**
 * "Esse produto já foi comprado?": procura no catálogo (que inclui tudo que já veio em nota, com o nome legível e a
 * descrição original da nota). O catálogo é pessoal e pequeno, então o filtro por nome parecido roda aqui.
 */
export async function buscarProdutos(busca: string, sessaoId?: number): Promise<{ produtos: (Produto & { descricaoNota: string | null })[]; daNota: ItemDaNotaSemProduto[] }> {
  const termo = busca.trim();
  if (termo.length < 2) throw new ErroCompras("busca deve ter pelo menos 2 letras");
  const mercadoId = await mercadoDaSessao(sessaoId);

  const todos = (await sql().query(
    `select p.id, p.nome, p.unidade,
            (select i.descricao from compras_itens_nota i join compras_notas n on n.chave = i.chave
               join compras_codigos c on ${CODIGO_DA_LINHA} where c.produto_id = p.id order by i.id desc limit 1) as descricao_nota
       from compras_produtos p order by p.updated_at desc limit 3000`,
  )) as (ProdutoRow & { descricao_nota: string | null })[];
  const achados = todos
    .map((p) => ({ p, s: Math.max(similaridade(termo, p.nome).anotado, p.descricao_nota ? similaridade(termo, p.descricao_nota).anotado : 0) }))
    .filter((x) => x.s >= 0.45)
    .sort((a, b) => b.s - a.s)
    .slice(0, 20)
    .map((x) => x.p);
  const produtos = await montarProdutos(achados, mercadoId);

  // Linhas de nota sem produto (só existem se vieram sem código nenhum).
  const linhas = (await sql().query(
    `select i.id, i.descricao, n.cnpj, n.estabelecimento, i.codigo_loja, i.ean, i.unidade, i.preco_unitario, coalesce(n.emitida_em, n.created_at) as data
       from compras_itens_nota i join compras_notas n on n.chave = i.chave
      where not exists (select 1 from compras_codigos c where ${CODIGO_DA_LINHA})
      order by i.id desc limit 2000`,
  )) as { id: string; descricao: string; cnpj: string; estabelecimento: string | null; codigo_loja: string | null; ean: string | null; unidade: Unidade; preco_unitario: string; data: Date }[];
  const daNota = linhas
    .filter((l) => similaridade(termo, l.descricao).anotado >= 0.45)
    .slice(0, 20)
    .map((l) => ({
      itemNotaId: Number(l.id), descricao: l.descricao, cnpj: l.cnpj, estabelecimento: l.estabelecimento, codigoLoja: l.codigo_loja,
      ean: l.ean, unidade: l.unidade, precoUnitario: Number(l.preco_unitario), compradoEm: new Date(l.data).toISOString(),
    }));

  return { produtos: produtos.map((p, i) => ({ ...p, descricaoNota: achados[i]!.descricao_nota })), daNota };
}

async function vincular(produtoId: number, tipo: "ean" | "loja" | "balanca", codigo: string, escopo = ""): Promise<void> {
  // Um código aponta para um produto só; vincular de novo move o código (corrige um vínculo errado).
  await sql().query(
    `insert into compras_codigos (tipo, escopo, codigo, produto_id) values ($1, $2, $3, $4)
     on conflict (tipo, escopo, codigo) do update set produto_id = excluded.produto_id, created_at = now()`,
    [tipo, escopo, codigo, produtoId],
  );
  await sql().query(`update compras_produtos set updated_at = now() where id = $1`, [produtoId]);
}

/** Código lido pela câmera → como fica salvo (UPC-A vira EAN-13; etiqueta de balança vira prefixo daquele mercado). */
async function vincularLido(produtoId: number, entrada: string, mercadoId: number | null): Promise<void> {
  const lido = lerCodigo(entrada);
  if (lido.tipo === "invalido") throw new ErroCompras(lido.motivo);
  if (lido.tipo === "balanca") await vincular(produtoId, "balanca", lido.prefixo, escopoBalanca(mercadoId));
  else await vincular(produtoId, "ean", lido.codigo);
}

/** Junta produtos que são o mesmo: códigos, anotações e histórico passam para o destino. */
async function mesclar(destino: number, origens: number[]): Promise<void> {
  await mesclarVarios(origens.map((o) => [destino, o]));
}

/** Várias junções de uma vez (3 consultas no total), para a importação da nota não ficar lenta no caixa. */
async function mesclarVarios(pares: [destino: number, origem: number][]): Promise<void> {
  const validos = pares.filter(([d, o]) => d !== o);
  if (!validos.length) return;
  const destinos = validos.map(([d]) => d);
  const origens = validos.map(([, o]) => o);
  await sql().query(
    `update compras_codigos c set produto_id = v.d from unnest($1::bigint[], $2::bigint[]) as v(o, d) where c.produto_id = v.o`,
    [origens, destinos],
  );
  await sql().query(
    `update compras_itens i set produto_id = v.d from unnest($1::bigint[], $2::bigint[]) as v(o, d) where i.produto_id = v.o`,
    [origens, destinos],
  );
  await sql().query(`delete from compras_produtos where id = any($1::bigint[])`, [origens]);
}

async function produtoDaLinhaNota(itemNotaId: number): Promise<number | null> {
  const rows = (await sql().query(
    `select c.produto_id from compras_itens_nota i join compras_notas n on n.chave = i.chave
       join compras_codigos c on ${CODIGO_DA_LINHA} where i.id = $1 order by (c.tipo = 'ean') desc limit 1`,
    [itemNotaId],
  )) as { produto_id: string }[];
  return rows[0] ? Number(rows[0].produto_id) : null;
}

/** Liga os códigos de uma linha de nota (código da loja e, se veio, código de barras) a um produto. */
async function vincularLinhaNota(produtoId: number, itemNotaId: number): Promise<void> {
  const rows = (await sql().query(
    `select i.codigo_loja, i.ean, n.cnpj from compras_itens_nota i join compras_notas n on n.chave = i.chave where i.id = $1`,
    [itemNotaId],
  )) as { codigo_loja: string | null; ean: string | null; cnpj: string }[];
  const l = rows[0];
  if (!l) throw new ErroCompras("item da nota não encontrado", 404);
  const atual = await produtoDaLinhaNota(itemNotaId);
  if (atual !== null && atual !== produtoId) await mesclar(produtoId, [atual]);
  if (l.codigo_loja) await vincular(produtoId, "loja", l.codigo_loja, l.cnpj);
  if (l.ean) await vincular(produtoId, "ean", l.ean);
}

export interface NovoProduto {
  nome?: string;
  unidade?: Unidade;
  /** Código de barras lido agora. */
  codigo?: string;
  /** Linha de uma nota antiga (o produto dela já existe: o código lido é ligado a ele). */
  itemNotaId?: number;
  /** Compra em andamento: diz o mercado da etiqueta de balança. */
  sessaoId?: number;
}

/** Cadastra o produto do código novo. Com itemNotaId, liga o código ao produto que veio daquela nota. */
export async function criarProduto(dados: NovoProduto): Promise<Produto> {
  const mercadoId = await mercadoDaSessao(dados.sessaoId);
  if (dados.unidade && dados.unidade !== "UN" && dados.unidade !== "KG") throw new ErroCompras("unidade deve ser UN ou KG");
  if (dados.itemNotaId) {
    const existente = await produtoDaLinhaNota(dados.itemNotaId);
    if (existente !== null) {
      if (dados.codigo) await vincularLido(existente, dados.codigo, mercadoId);
      if (dados.nome?.trim() || dados.unidade) await renomearProduto(existente, { nome: dados.nome, unidade: dados.unidade });
      return (await getProduto(existente, mercadoId))!;
    }
  }
  let nome = dados.nome?.trim() ?? "";
  let unidade = dados.unidade;
  if (dados.itemNotaId) {
    const rows = (await sql().query(`select descricao, unidade from compras_itens_nota where id = $1`, [dados.itemNotaId])) as { descricao: string; unidade: Unidade }[];
    if (!rows[0]) throw new ErroCompras("item da nota não encontrado", 404);
    nome ||= nomeLegivel(rows[0].descricao);
    unidade ??= rows[0].unidade;
  }
  if (!nome || nome.length > 120) throw new ErroCompras("nome é obrigatório (até 120 letras)");
  if (dados.codigo && lerCodigo(dados.codigo).tipo === "invalido") throw new ErroCompras("código de barras inválido (dígito verificador não confere)");

  const rows = (await sql().query(`insert into compras_produtos (nome, unidade) values ($1, $2) returning id`, [nome, unidade ?? "UN"])) as { id: string }[];
  const id = Number(rows[0]!.id);
  if (dados.codigo) await vincularLido(id, dados.codigo, mercadoId);
  if (dados.itemNotaId) await vincularLinhaNota(id, dados.itemNotaId);
  return (await getProduto(id, mercadoId))!;
}

/** "Sim, já comprei": liga o código lido a um produto que já existe. */
export async function vincularCodigo(produtoId: number, dados: { codigo?: string; itemNotaId?: number; sessaoId?: number }): Promise<Produto> {
  if (!(await getProduto(produtoId))) throw new ErroCompras("produto não encontrado", 404);
  if (!dados.codigo && !dados.itemNotaId) throw new ErroCompras("mande codigo (código de barras) ou itemNotaId");
  const mercadoId = await mercadoDaSessao(dados.sessaoId);
  if (dados.codigo) await vincularLido(produtoId, dados.codigo, mercadoId);
  if (dados.itemNotaId) await vincularLinhaNota(produtoId, dados.itemNotaId);
  return (await getProduto(produtoId, mercadoId))!;
}

export async function renomearProduto(id: number, dados: { nome?: string; unidade?: Unidade }): Promise<Produto> {
  const nome = dados.nome?.trim();
  if (nome !== undefined && (!nome || nome.length > 120)) throw new ErroCompras("nome inválido");
  if (dados.unidade && dados.unidade !== "UN" && dados.unidade !== "KG") throw new ErroCompras("unidade deve ser UN ou KG");
  const rows = await sql().query(
    `update compras_produtos set nome = coalesce($2, nome), unidade = coalesce($3, unidade), updated_at = now() where id = $1 returning id`,
    [id, nome ?? null, dados.unidade ?? null],
  );
  if (!rows.length) throw new ErroCompras("produto não encontrado", 404);
  return (await getProduto(id))!;
}

// ───────── preços ─────────

/** Todos os preços pagos pelo produto (das notas), do mais novo para o mais antigo, com o mercado. */
export async function historicoPrecos(produtoId: number) {
  const produto = await getProduto(produtoId);
  if (!produto) throw new ErroCompras("produto não encontrado", 404);
  const precos = (await precosDeNota([produtoId])).map(({ produtoId: _p, itemNotaId: _i, ...p }) => p);
  return { produto: { id: produto.id, nome: produto.nome, unidade: produto.unidade }, precos };
}

export interface Comparacao {
  produtoId: number;
  nome: string;
  unidade: Unidade;
  porMercado: { mercadoId: number | null; mercado: string | null; precoUnitario: number; data: string }[];
  maisBarato: { mercadoId: number | null; mercado: string | null; precoUnitario: number };
  diferencaPct: number;
}

function compararLista(precos: (PrecoNota & { produtoId: number })[], nomes: Map<number, { nome: string; unidade: Unidade }>): Comparacao[] {
  const porProduto = new Map<number, Map<string, PrecoNota>>();
  for (const p of precos) {
    const info = nomes.get(p.produtoId);
    if (!info || p.unidade !== info.unidade) continue;
    const chave = String(p.mercadoId ?? p.mercado);
    const m = porProduto.get(p.produtoId) ?? new Map<string, PrecoNota>();
    if (!m.has(chave)) m.set(chave, p); // precos vem do mais novo para o mais antigo: fica o último de cada mercado
    porProduto.set(p.produtoId, m);
  }
  const lista: Comparacao[] = [];
  for (const [produtoId, mercados] of porProduto) {
    if (mercados.size < 2) continue;
    const porMercado = [...mercados.values()]
      .map((p) => ({ mercadoId: p.mercadoId, mercado: p.mercado, precoUnitario: p.precoUnitario, data: p.data }))
      .sort((a, b) => a.precoUnitario - b.precoUnitario);
    const barato = porMercado[0]!;
    const caro = porMercado.at(-1)!;
    const info = nomes.get(produtoId)!;
    lista.push({
      produtoId, nome: info.nome, unidade: info.unidade, porMercado,
      maisBarato: { mercadoId: barato.mercadoId, mercado: barato.mercado, precoUnitario: barato.precoUnitario },
      diferencaPct: barato.precoUnitario > 0 ? Math.round(((caro.precoUnitario - barato.precoUnitario) / barato.precoUnitario) * 1000) / 10 : 0,
    });
  }
  return lista.sort((a, b) => b.diferencaPct - a.diferencaPct);
}

/** Produtos comprados em 2+ mercados: último preço em cada um, do maior para o menor diferença. */
export async function compararPrecos(): Promise<Comparacao[]> {
  const produtos = (await sql().query(`select id, nome, unidade from compras_produtos`)) as ProdutoRow[];
  const nomes = new Map(produtos.map((p) => [Number(p.id), { nome: p.nome, unidade: p.unidade }]));
  return compararLista(await precosDeNota([...nomes.keys()]), nomes);
}

// ───────── sessão de compra ─────────

export interface ItemSessao {
  id: number;
  produtoId: number | null;
  descricao: string;
  textoOriginal: string | null;
  codigoLido: string | null;
  quantidade: number;
  unidade: Unidade;
  precoUnitario: number;
  valorCentavos: number;
  emPromocao: boolean;
  criadoEm: string;
}

export interface Sessao {
  id: number;
  nome: string | null;
  mercado: Mercado | null;
  orcamentoCentavos: number | null;
  descontoManualCentavos: number | null;
  chave: string | null;
  criadaEm: string;
  itens: ItemSessao[];
  totalCentavos: number;
  saldoCentavos: number | null;
}

interface ItemRow {
  id: string;
  produto_id: string | null;
  descricao: string;
  texto_original: string | null;
  codigo_lido: string | null;
  quantidade: string;
  unidade: Unidade;
  preco_unitario: string;
  valor_centavos: number;
  em_promocao: boolean;
  created_at: Date;
}

const toItem = (r: ItemRow): ItemSessao => ({
  id: Number(r.id),
  produtoId: num(r.produto_id),
  descricao: r.descricao,
  textoOriginal: r.texto_original,
  codigoLido: r.codigo_lido,
  quantidade: Number(r.quantidade),
  unidade: r.unidade,
  precoUnitario: Number(r.preco_unitario),
  valorCentavos: r.valor_centavos,
  emPromocao: r.em_promocao,
  criadoEm: new Date(r.created_at).toISOString(),
});

/** Mercado da compra: um que já existe (mercadoId) ou um novo pelo nome ("outro supermercado"). */
async function resolverMercado(dados: { mercadoId?: number | null; mercadoNome?: string }): Promise<number | null | undefined> {
  if (dados.mercadoNome?.trim()) return (await criarMercado(dados.mercadoNome)).id;
  if (dados.mercadoId === undefined) return undefined;
  if (dados.mercadoId === null) return null;
  if (!(await getMercado(dados.mercadoId))) throw new ErroCompras("mercado não encontrado", 404);
  return dados.mercadoId;
}

export async function criarSessao(dados: { nome?: string; orcamentoCentavos?: number; mercadoId?: number; mercadoNome?: string }): Promise<Sessao> {
  const orc = dados.orcamentoCentavos;
  if (orc !== undefined && orc !== null && !(Number.isSafeInteger(orc) && orc > 0)) throw new ErroCompras("orcamentoCentavos deve ser inteiro positivo");
  const mercadoId = (await resolverMercado(dados)) ?? null;
  const rows = (await sql().query(
    `insert into compras_sessoes (nome, orcamento_centavos, mercado_id) values ($1, $2, $3) returning id`,
    [dados.nome?.trim() || null, orc ?? null, mercadoId],
  )) as { id: string }[];
  return (await getSessao(Number(rows[0]!.id)))!;
}

export async function listarSessoes(limite = 20) {
  const rows = (await sql().query(
    `select s.id, s.nome, s.orcamento_centavos, s.chave, s.created_at, m.id as mercado_id, m.nome as mercado_nome, m.cnpj as mercado_cnpj,
            count(i.id)::int as itens, coalesce(sum(i.valor_centavos), 0)::int as total
       from compras_sessoes s left join compras_itens i on i.sessao_id = s.id left join compras_mercados m on m.id = s.mercado_id
      group by s.id, m.id order by s.created_at desc limit $1`,
    [limite],
  )) as { id: string; nome: string | null; orcamento_centavos: number | null; chave: string | null; created_at: Date; mercado_id: string | null; mercado_nome: string | null; mercado_cnpj: string | null; itens: number; total: number }[];
  return rows.map((r) => ({
    id: Number(r.id),
    nome: r.nome,
    mercado: r.mercado_id ? toMercado({ id: r.mercado_id, nome: r.mercado_nome!, cnpj: r.mercado_cnpj }) : null,
    orcamentoCentavos: r.orcamento_centavos,
    chave: r.chave,
    criadaEm: new Date(r.created_at).toISOString(),
    itens: r.itens,
    totalCentavos: r.total,
  }));
}

export async function getSessao(id: number): Promise<Sessao | null> {
  const s = (await sql().query(
    `select s.id, s.nome, s.orcamento_centavos, s.desconto_manual_centavos, s.chave, s.created_at, s.mercado_id from compras_sessoes s where s.id = $1`,
    [id],
  )) as { id: string; nome: string | null; orcamento_centavos: number | null; desconto_manual_centavos: number | null; chave: string | null; created_at: Date; mercado_id: string | null }[];
  if (!s[0]) return null;
  const itens = ((await sql().query(`select * from compras_itens where sessao_id = $1 order by id`, [id])) as ItemRow[]).map(toItem);
  const total = itens.reduce((t, i) => t + i.valorCentavos, 0);
  const orc = s[0].orcamento_centavos;
  return {
    id: Number(s[0].id),
    nome: s[0].nome,
    mercado: s[0].mercado_id ? await getMercado(Number(s[0].mercado_id)) : null,
    orcamentoCentavos: orc,
    descontoManualCentavos: s[0].desconto_manual_centavos,
    chave: s[0].chave,
    criadaEm: new Date(s[0].created_at).toISOString(),
    itens,
    totalCentavos: total,
    saldoCentavos: orc === null ? null : orc - total,
  };
}

export async function atualizarSessao(
  id: number,
  dados: { nome?: string | null; orcamentoCentavos?: number | null; descontoManualCentavos?: number | null; mercadoId?: number | null; mercadoNome?: string },
): Promise<Sessao> {
  const atual = await getSessao(id);
  if (!atual) throw new ErroCompras("sessão não encontrada", 404);
  const inteiro = (v: unknown, campo: string, min: number) => {
    if (v === null) return null;
    if (!Number.isSafeInteger(v) || (v as number) < min) throw new ErroCompras(`${campo} deve ser inteiro em centavos`);
    return v as number;
  };
  const nome = dados.nome === undefined ? atual.nome : dados.nome?.trim() || null;
  const orc = dados.orcamentoCentavos === undefined ? atual.orcamentoCentavos : inteiro(dados.orcamentoCentavos, "orcamentoCentavos", 1);
  const desc = dados.descontoManualCentavos === undefined ? atual.descontoManualCentavos : inteiro(dados.descontoManualCentavos, "descontoManualCentavos", 0);
  const novoMercado = await resolverMercado(dados);
  const mercadoId = novoMercado === undefined ? (atual.mercado?.id ?? null) : novoMercado;
  await sql().query(
    `update compras_sessoes set nome = $2, orcamento_centavos = $3, desconto_manual_centavos = $4, mercado_id = $5, updated_at = now() where id = $1`,
    [id, nome, orc, desc, mercadoId],
  );
  return (await getSessao(id))!;
}

export async function apagarSessao(id: number): Promise<boolean> {
  return (await sql().query(`delete from compras_sessoes where id = $1 returning id`, [id])).length > 0;
}

export interface DadosItem {
  /** Texto livre: "2 arroz 4,13", "1,5kg batata 6,49 o kg". */
  texto?: string;
  /** Código de barras lido (conhecido ou recém-cadastrado). */
  codigo?: string;
  produtoId?: number;
  descricao?: string;
  quantidade?: number;
  unidade?: Unidade;
  precoUnitario?: number;
  /** Etiqueta de balança: o valor do pacote já vem no código. */
  valorCentavos?: number;
  emPromocao?: boolean;
}

interface ItemPronto {
  produtoId: number | null;
  descricao: string;
  textoOriginal: string | null;
  codigoLido: string | null;
  quantidade: number;
  unidade: Unidade;
  precoUnitario: number;
  valorCentavos: number;
  emPromocao: boolean;
}

async function montarItem(d: DadosItem, mercadoId: number | null, base?: ItemSessao): Promise<ItemPronto> {
  let item: ItemPronto = base
    ? { ...base }
    : { produtoId: null, descricao: "", textoOriginal: null, codigoLido: null, quantidade: 1, unidade: "UN", precoUnitario: 0, valorCentavos: 0, emPromocao: false };

  if (d.texto !== undefined) {
    let lido;
    try {
      lido = lerAnotacao(d.texto);
    } catch (e) {
      throw new ErroCompras((e as Error).message);
    }
    item = { ...item, ...lido, textoOriginal: d.texto.trim() };
  }

  let balancaCentavos: number | null = null;
  let produtoLido: Produto | null = null;
  if (d.codigo !== undefined) {
    const lido = lerCodigo(d.codigo);
    if (lido.tipo === "invalido") throw new ErroCompras(lido.motivo);
    item.codigoLido = lido.codigo;
    if (lido.tipo === "balanca") {
      balancaCentavos = lido.valorCentavos;
      produtoLido = await produtoDoCodigo("balanca", lido.prefixo, escopoBalanca(mercadoId), mercadoId);
    } else {
      produtoLido = await produtoDoCodigo("ean", lido.codigo, "", mercadoId);
    }
  }

  const produto = d.produtoId !== undefined ? await getProduto(d.produtoId, mercadoId) : produtoLido;
  if (d.produtoId !== undefined && !produto) throw new ErroCompras("produto não encontrado", 404);
  if (produto) {
    item.produtoId = produto.id;
    if (!d.texto && !base) {
      item.descricao = produto.nome;
      item.unidade = produto.unidade;
      if (produto.ultimoPreco) item.precoUnitario = produto.ultimoPreco.precoUnitario;
    }
  }

  if (d.descricao !== undefined) item.descricao = d.descricao.trim();
  if (d.unidade !== undefined) {
    if (d.unidade !== "UN" && d.unidade !== "KG") throw new ErroCompras("unidade deve ser UN ou KG");
    item.unidade = d.unidade;
  }
  if (d.quantidade !== undefined) {
    if (!(typeof d.quantidade === "number" && d.quantidade > 0)) throw new ErroCompras("quantidade deve ser maior que zero");
    item.quantidade = d.quantidade;
  }
  if (d.precoUnitario !== undefined) {
    if (!(typeof d.precoUnitario === "number" && d.precoUnitario >= 0)) throw new ErroCompras("precoUnitario inválido");
    item.precoUnitario = d.precoUnitario;
  }
  if (d.emPromocao !== undefined) item.emPromocao = d.emPromocao === true;

  const valor = d.valorCentavos ?? balancaCentavos;
  if (valor !== undefined && valor !== null) {
    // Pacote pesado na loja: o que vale é o total da etiqueta.
    if (!Number.isSafeInteger(valor) || valor < 0) throw new ErroCompras("valorCentavos inválido");
    item.valorCentavos = valor;
    if (d.precoUnitario === undefined) {
      item.unidade = "UN";
      item.precoUnitario = valor / 100 / item.quantidade;
    }
  } else {
    item.valorCentavos = valorLinha(item.quantidade, item.precoUnitario);
  }

  if (!item.descricao) throw new ErroCompras("descricao é obrigatória (ou mande texto, produtoId ou um código conhecido)");
  if (item.descricao.length > 120) throw new ErroCompras("descricao até 120 letras");
  return item;
}

export async function adicionarItem(sessaoId: number, dados: DadosItem): Promise<{ item: ItemSessao; sessao: Sessao }> {
  const sessao = await getSessao(sessaoId);
  if (!sessao) throw new ErroCompras("sessão não encontrada", 404);
  const i = await montarItem(dados, sessao.mercado?.id ?? null);
  const rows = (await sql().query(
    `insert into compras_itens (sessao_id, produto_id, descricao, texto_original, codigo_lido, quantidade, unidade, preco_unitario, valor_centavos, em_promocao)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
    [sessaoId, i.produtoId, i.descricao, i.textoOriginal, i.codigoLido, i.quantidade, i.unidade, i.precoUnitario, i.valorCentavos, i.emPromocao],
  )) as ItemRow[];
  await sql().query(`update compras_sessoes set updated_at = now() where id = $1`, [sessaoId]);
  return { item: toItem(rows[0]!), sessao: (await getSessao(sessaoId))! };
}

export async function editarItem(sessaoId: number, itemId: number, dados: DadosItem): Promise<{ item: ItemSessao; sessao: Sessao }> {
  const sessao = await getSessao(sessaoId);
  const atual = sessao?.itens.find((i) => i.id === itemId);
  if (!sessao || !atual) throw new ErroCompras("item não encontrado", 404);
  const i = await montarItem(dados, sessao.mercado?.id ?? null, atual);
  const rows = (await sql().query(
    `update compras_itens set produto_id = $3, descricao = $4, texto_original = $5, codigo_lido = $6, quantidade = $7, unidade = $8,
       preco_unitario = $9, valor_centavos = $10, em_promocao = $11
     where id = $2 and sessao_id = $1 returning *`,
    [sessaoId, itemId, i.produtoId, i.descricao, i.textoOriginal, i.codigoLido, i.quantidade, i.unidade, i.precoUnitario, i.valorCentavos, i.emPromocao],
  )) as ItemRow[];
  return { item: toItem(rows[0]!), sessao: (await getSessao(sessaoId))! };
}

export async function apagarItem(sessaoId: number, itemId: number): Promise<Sessao> {
  const rows = await sql().query(`delete from compras_itens where id = $2 and sessao_id = $1 returning id`, [sessaoId, itemId]);
  if (!rows.length) throw new ErroCompras("item não encontrado", 404);
  return (await getSessao(sessaoId))!;
}

// ───────── nota e conferência ─────────

/** O mercado da nota pelo CNPJ. O mercado escolhido na compra aprende o CNPJ; se for outro, a nota corrige. */
async function mercadoDaNota(sessao: Sessao, nota: NotaLida): Promise<{ mercadoId: number; corrigido: boolean }> {
  const achado = (await sql().query(`select id from compras_mercados where cnpj = $1`, [nota.cnpj])) as { id: string }[];
  let mercadoId: number;
  if (achado[0]) mercadoId = Number(achado[0].id);
  else if (sessao.mercado && !sessao.mercado.cnpj) {
    mercadoId = sessao.mercado.id;
    await sql().query(`update compras_mercados set cnpj = $2 where id = $1`, [mercadoId, nota.cnpj]);
  } else {
    const nome = (nota.estabelecimento ? nomeLegivel(nota.estabelecimento) : `CNPJ ${nota.cnpj}`).slice(0, 80);
    mercadoId = Number(((await sql().query(`insert into compras_mercados (nome, cnpj) values ($1, $2) returning id`, [nome, nota.cnpj])) as { id: string }[])[0]!.id);
  }
  const corrigido = sessao.mercado !== null && sessao.mercado.id !== mercadoId;
  if (sessao.mercado?.id !== mercadoId) {
    await sql().query(`update compras_sessoes set mercado_id = $2, updated_at = now() where id = $1`, [sessao.id, mercadoId]);
  }
  return { mercadoId, corrigido };
}

/**
 * Grava a nota (uma vez por chave) e liga à compra. Cada linha vira produto do catálogo (pelo código da loja), com
 * nome legível: é isso que dá o histórico de preço já na próxima nota, mesmo sem escanear nada.
 */
export async function salvarNota(sessaoId: number, nota: NotaLida, bruto: string | null): Promise<{ nova: boolean; mercadoCorrigido: boolean; produtosCriados: number[] }> {
  const sessao = await getSessao(sessaoId);
  if (!sessao) throw new ErroCompras("sessão não encontrada", 404);
  const outra = (await sql().query(`select id from compras_sessoes where chave = $1 and id <> $2`, [nota.chave, sessaoId])) as { id: string }[];
  if (outra[0]) throw new ErroCompras(`essa nota já foi conferida na compra ${outra[0].id}`, 409);

  const { corrigido } = await mercadoDaNota(sessao, nota);
  const inserida = await sql().query(
    `insert into compras_notas (chave, cnpj, estabelecimento, numero, serie, emitida_em, subtotal_centavos, descontos_centavos, total_centavos, origem, bruto)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) on conflict (chave) do nothing returning chave`,
    [nota.chave, nota.cnpj, nota.estabelecimento, nota.numero, nota.serie, nota.emitidaEm, nota.subtotalCentavos, nota.descontosCentavos, nota.totalCentavos, nota.origem, bruto?.slice(0, 2_000_000) ?? null],
  );
  const nova = inserida.length > 0;
  const produtosCriados: number[] = [];
  if (nova) {
    const it = nota.itens;
    await sql().query(
      `insert into compras_itens_nota (chave, ordem, codigo_loja, ean, descricao, quantidade, unidade, preco_unitario, valor_centavos, desconto_centavos)
       select $1, * from unnest($2::int[], $3::text[], $4::text[], $5::text[], $6::numeric[], $7::text[], $8::numeric[], $9::int[], $10::int[])`,
      [nota.chave, it.map((i) => i.ordem), it.map((i) => i.codigoLoja), it.map((i) => i.ean), it.map((i) => i.descricao), it.map((i) => i.quantidade),
        it.map((i) => i.unidade), it.map((i) => i.precoUnitario), it.map((i) => i.valorCentavos), it.map((i) => i.descontoCentavos)],
    );

    // Produtos que os códigos já conhecem, numa consulta só.
    const lojas = [...new Set(it.map((i) => i.codigoLoja).filter((c): c is string => !!c))];
    const eans = [...new Set(it.map((i) => i.ean).filter((c): c is string => !!c))];
    const conhecidos = (await sql().query(
      `select tipo, codigo, produto_id from compras_codigos
        where (tipo = 'loja' and escopo = $1 and codigo = any($2::text[])) or (tipo = 'ean' and escopo = '' and codigo = any($3::text[]))`,
      [nota.cnpj, lojas, eans],
    )) as { tipo: "loja" | "ean"; codigo: string; produto_id: string }[];
    const porLoja = new Map(conhecidos.filter((c) => c.tipo === "loja").map((c) => [c.codigo, Number(c.produto_id)]));
    const porEan = new Map(conhecidos.filter((c) => c.tipo === "ean").map((c) => [c.codigo, Number(c.produto_id)]));

    // Linhas sem produto: um produto novo por código (a mesma linha repetida na nota não cria dois).
    const novos: { nome: string; unidade: Unidade; loja: string | null; ean: string | null }[] = [];
    const novoPor = new Map<string, (typeof novos)[number]>();
    const vinculos = new Map<string, { tipo: "loja" | "ean"; escopo: string; codigo: string; produto: number | (typeof novos)[number] }>();
    for (const i of it) {
      const p = (i.codigoLoja ? porLoja.get(i.codigoLoja) : undefined) ?? (i.ean ? porEan.get(i.ean) : undefined);
      if (p !== undefined) {
        if (i.codigoLoja && !porLoja.has(i.codigoLoja)) vinculos.set(`loja|${i.codigoLoja}`, { tipo: "loja", escopo: nota.cnpj, codigo: i.codigoLoja, produto: p });
        if (i.ean && !porEan.has(i.ean)) vinculos.set(`ean|${i.ean}`, { tipo: "ean", escopo: "", codigo: i.ean, produto: p });
        continue;
      }
      if (!i.codigoLoja && !i.ean) continue;
      const chaveNovo = i.codigoLoja ? `loja|${i.codigoLoja}` : `ean|${i.ean}`;
      let novo = novoPor.get(chaveNovo) ?? (i.ean ? novoPor.get(`ean|${i.ean}`) : undefined);
      if (!novo) {
        novo = { nome: nomeLegivel(i.descricao), unidade: i.unidade, loja: i.codigoLoja, ean: i.ean };
        novos.push(novo);
      }
      if (i.codigoLoja) {
        novoPor.set(`loja|${i.codigoLoja}`, novo);
        vinculos.set(`loja|${i.codigoLoja}`, { tipo: "loja", escopo: nota.cnpj, codigo: i.codigoLoja, produto: novo });
      }
      if (i.ean) {
        novoPor.set(`ean|${i.ean}`, novo);
        vinculos.set(`ean|${i.ean}`, { tipo: "ean", escopo: "", codigo: i.ean, produto: novo });
      }
    }

    // Ids reservados antes de inserir: assim cada produto novo sabe o seu id sem depender da ordem do RETURNING.
    const ids = new Map<(typeof novos)[number], number>();
    if (novos.length) {
      const seq = (await sql().query(`select nextval(pg_get_serial_sequence('compras_produtos', 'id')) as id from generate_series(1, $1::int)`, [novos.length])) as { id: string }[];
      novos.forEach((n, k) => ids.set(n, Number(seq[k]!.id)));
      await sql().query(
        `insert into compras_produtos (id, nome, unidade) select * from unnest($1::bigint[], $2::text[], $3::text[])`,
        [novos.map((n) => ids.get(n)), novos.map((n) => n.nome), novos.map((n) => n.unidade)],
      );
      produtosCriados.push(...novos.map((n) => ids.get(n)!));
    }
    const lista = [...vinculos.values()];
    if (lista.length) {
      await sql().query(
        `insert into compras_codigos (tipo, escopo, codigo, produto_id) select * from unnest($1::text[], $2::text[], $3::text[], $4::bigint[])
         on conflict (tipo, escopo, codigo) do update set produto_id = excluded.produto_id`,
        [lista.map((v) => v.tipo), lista.map((v) => v.escopo), lista.map((v) => v.codigo), lista.map((v) => (typeof v.produto === "number" ? v.produto : ids.get(v.produto)))],
      );
    }
  }
  await sql().query(`update compras_sessoes set chave = $2, updated_at = now() where id = $1`, [sessaoId, nota.chave]);
  return { nova, mercadoCorrigido: corrigido, produtosCriados };
}

export interface VariacaoPreco {
  produtoId: number;
  nome: string;
  descricaoNota: string;
  unidade: Unidade;
  precoUnitario: number;
  /** Última compra no mesmo mercado, antes desta nota. */
  anterior: { precoUnitario: number; data: string } | null;
  variacaoPct: number | null;
  /** Outro mercado onde a última compra saiu mais barata. */
  maisBaratoEm: { mercadoId: number | null; mercado: string | null; precoUnitario: number; data: string; diferencaPct: number } | null;
}

export interface Relatorio extends Conciliacao {
  sessao: { id: number; nome: string | null; orcamentoCentavos: number | null; mercado: Mercado | null };
  nota: { chave: string; estabelecimento: string | null; cnpj: string; numero: string; serie: string; emitidaEm: string | null; origem: string } | null;
  /** Depois da nota: o que subiu ou baixou desde a última compra no mesmo mercado, e o que saiu mais barato em outro. */
  precos: { subiram: VariacaoPreco[]; baixaram: VariacaoPreco[]; maisBaratoEmOutroMercado: VariacaoPreco[] };
}

const pct = (de: number, para: number) => (de > 0 ? Math.round(((para - de) / de) * 1000) / 10 : 0);

async function variacoes(chave: string, linhas: LinhaNota[], mercadoId: number | null): Promise<Relatorio["precos"]> {
  const comProduto = linhas.filter((l) => l.produtoId !== null);
  const ids = [...new Set(comProduto.map((l) => l.produtoId!))];
  const historico = (await precosDeNota(ids)).filter((p) => p.chave !== chave);
  const nomes = (await sql().query(`select id, nome from compras_produtos where id = any($1::bigint[])`, [ids])) as { id: string; nome: string }[];
  const nomeDe = new Map(nomes.map((n) => [Number(n.id), n.nome]));
  const desta = (await sql().query(`select coalesce(emitida_em, created_at) as data from compras_notas where chave = $1`, [chave])) as { data: Date }[];
  const dataDesta = new Date(desta[0]!.data).toISOString();

  const lista: VariacaoPreco[] = [];
  const vistos = new Set<number>();
  for (const l of comProduto) {
    if (vistos.has(l.produtoId!)) continue;
    vistos.add(l.produtoId!);
    const anteriores = historico.filter((p) => p.produtoId === l.produtoId && p.unidade === l.unidade && p.data <= dataDesta);
    const mesmo = anteriores.find((p) => p.mercadoId === mercadoId);
    const ultimosOutros = new Map<string, PrecoNota>();
    for (const p of anteriores) {
      if (p.mercadoId === mercadoId) continue;
      const k = String(p.mercadoId ?? p.mercado);
      if (!ultimosOutros.has(k)) ultimosOutros.set(k, p);
    }
    const barato = [...ultimosOutros.values()].filter((p) => p.precoUnitario < l.precoUnitario - 0.005).sort((a, b) => a.precoUnitario - b.precoUnitario)[0];
    lista.push({
      produtoId: l.produtoId!,
      nome: nomeDe.get(l.produtoId!) ?? l.descricao,
      descricaoNota: l.descricao,
      unidade: l.unidade,
      precoUnitario: l.precoUnitario,
      anterior: mesmo ? { precoUnitario: mesmo.precoUnitario, data: mesmo.data } : null,
      variacaoPct: mesmo ? pct(mesmo.precoUnitario, l.precoUnitario) : null,
      maisBaratoEm: barato
        ? { mercadoId: barato.mercadoId, mercado: barato.mercado, precoUnitario: barato.precoUnitario, data: barato.data, diferencaPct: pct(barato.precoUnitario, l.precoUnitario) }
        : null,
    });
  }
  return {
    subiram: lista.filter((v) => (v.variacaoPct ?? 0) > 0).sort((a, b) => b.variacaoPct! - a.variacaoPct!),
    baixaram: lista.filter((v) => (v.variacaoPct ?? 0) < 0).sort((a, b) => a.variacaoPct! - b.variacaoPct!),
    maisBaratoEmOutroMercado: lista.filter((v) => v.maisBaratoEm).sort((a, b) => b.maisBaratoEm!.diferencaPct - a.maisBaratoEm!.diferencaPct),
  };
}

export async function relatorio(sessaoId: number, limiteCentavos?: number): Promise<Relatorio> {
  const sessao = await getSessao(sessaoId);
  if (!sessao) throw new ErroCompras("sessão não encontrada", 404);
  if (!sessao.chave) throw new ErroCompras("a compra ainda não tem nota: mande o link, o HTML ou o texto da nota", 409);

  const n = (await sql().query(`select * from compras_notas where chave = $1`, [sessao.chave])) as {
    chave: string; cnpj: string; estabelecimento: string | null; numero: string; serie: string; emitida_em: Date | null;
    descontos_centavos: number | null; total_centavos: number | null; origem: string;
  }[];
  const nota = n[0]!;
  const linhasRows = (await sql().query(
    `select i.*,
            (select c.produto_id from compras_codigos c where ${CODIGO_DA_LINHA} order by (c.tipo = 'ean') desc limit 1) as produto_id
       from compras_itens_nota i join compras_notas n on n.chave = i.chave where i.chave = $1 order by i.ordem`,
    [nota.chave],
  )) as { id: string; descricao: string; produto_id: string | null; codigo_loja: string | null; ean: string | null; quantidade: string; unidade: Unidade; preco_unitario: string; valor_centavos: number; desconto_centavos: number }[];

  const linhas: LinhaNota[] = linhasRows.map((l) => ({
    id: Number(l.id),
    descricao: l.descricao,
    produtoId: num(l.produto_id),
    codigoLoja: l.codigo_loja,
    ean: l.ean,
    quantidade: Number(l.quantidade),
    unidade: l.unidade,
    precoUnitario: Number(l.preco_unitario),
    valorCentavos: l.valor_centavos,
    descontoCentavos: l.desconto_centavos,
  }));
  const anotados: Anotado[] = sessao.itens.map((i) => ({
    id: i.id,
    descricao: i.descricao,
    produtoId: i.produtoId,
    quantidade: i.quantidade,
    unidade: i.unidade,
    precoUnitario: i.precoUnitario,
    valorCentavos: i.valorCentavos,
    emPromocao: i.emPromocao,
  }));

  const c = conciliar(anotados, linhas, {
    descontosNotaCentavos: nota.descontos_centavos,
    descontoManualCentavos: sessao.descontoManualCentavos,
    totalNotaCentavos: nota.total_centavos,
    limiteCentavos,
  });
  return {
    sessao: { id: sessao.id, nome: sessao.nome, orcamentoCentavos: sessao.orcamentoCentavos, mercado: sessao.mercado },
    nota: {
      chave: nota.chave,
      estabelecimento: nota.estabelecimento,
      cnpj: nota.cnpj,
      numero: nota.numero,
      serie: nota.serie,
      emitidaEm: nota.emitida_em ? new Date(nota.emitida_em).toISOString() : null,
      origem: nota.origem,
    },
    ...c,
    precos: await variacoes(nota.chave, linhas, sessao.mercado?.id ?? null),
  };
}

/**
 * Logo depois de importar a nota: pares seguros pelo nome ("nome") já ligam a anotação ao produto da linha. Se a
 * anotação foi escaneada (produto com código de barras) e a linha criou um produto agora, os dois viram um só, e o
 * código de barras passa a valer junto com o código da loja. Pares "provavel" esperam a sua confirmação.
 */
export async function aplicarParesSeguros(sessaoId: number, criadosAgora: number[], r: Relatorio): Promise<boolean> {
  if (!criadosAgora.length) return false;
  const novos = new Set(criadosAgora);
  const juntar: [number, number][] = [];
  const itens: number[] = [];
  const produtos: number[] = [];
  for (const par of r.pares) {
    if (par.confianca !== "nome") continue;
    const daLinha = [...new Set(par.linhas.map((l) => l.produtoId).filter((p): p is number => p !== null))];
    if (daLinha.length !== 1 || !novos.has(daLinha[0]!)) continue;
    const doItem = [...new Set(par.anotados.map((a) => a.produtoId).filter((p): p is number => p !== null))];
    if (doItem.length > 1) continue;
    const destino = doItem[0] ?? daLinha[0]!;
    if (doItem.length) juntar.push([destino, daLinha[0]!]);
    for (const a of par.anotados) {
      itens.push(a.id);
      produtos.push(destino);
    }
  }
  await mesclarVarios(juntar);
  if (itens.length) {
    await sql().query(
      `update compras_itens i set produto_id = v.p from unnest($2::bigint[], $3::bigint[]) as v(id, p) where i.sessao_id = $1 and i.id = v.id`,
      [sessaoId, itens, produtos],
    );
  }
  return itens.length > 0;
}

/**
 * Confirma (ou corrige) um par: essas anotações são essas linhas da nota. Tudo vira um produto só: o das anotações,
 * se já tinham (escaneadas), senão o que a nota criou; os outros são mesclados nele. Os códigos da loja ficam
 * vinculados e na próxima compra o par sai sozinho, como "codigo".
 */
export async function confirmarPar(sessaoId: number, dados: { itemIds: number[]; itemNotaIds: number[]; nome?: string }): Promise<Relatorio> {
  const sessao = await getSessao(sessaoId);
  if (!sessao?.chave) throw new ErroCompras("sessão sem nota", 409);
  const itens = sessao.itens.filter((i) => dados.itemIds.includes(i.id));
  if (!itens.length || itens.length !== new Set(dados.itemIds).size) throw new ErroCompras("itemIds inválidos");
  const linhas = (await sql().query(`select id, unidade from compras_itens_nota where chave = $1 and id = any($2::bigint[])`, [sessao.chave, dados.itemNotaIds])) as { id: string; unidade: Unidade }[];
  if (!linhas.length || linhas.length !== new Set(dados.itemNotaIds).size) throw new ErroCompras("itemNotaIds inválidos (devem ser da nota desta compra)");

  const dasLinhas: number[] = [];
  for (const l of linhas) {
    const p = await produtoDaLinhaNota(Number(l.id));
    if (p !== null) dasLinhas.push(p);
  }
  const dosItens = itens.map((i) => i.produtoId).filter((p): p is number => p !== null);
  let produtoId = dosItens[0] ?? dasLinhas[0] ?? null;
  if (produtoId === null) {
    const rows = (await sql().query(`insert into compras_produtos (nome, unidade) values ($1, $2) returning id`, [(dados.nome?.trim() || itens[0]!.descricao).slice(0, 120), linhas[0]!.unidade])) as { id: string }[];
    produtoId = Number(rows[0]!.id);
  }
  await mesclar(produtoId, [...dosItens, ...dasLinhas]);
  if (dados.nome?.trim()) await renomearProduto(produtoId, { nome: dados.nome });

  await sql().query(`update compras_itens set produto_id = $3 where sessao_id = $1 and id = any($2::bigint[])`, [sessaoId, dados.itemIds, produtoId]);
  for (const i of itens) if (i.codigoLido) await vincularLido(produtoId, i.codigoLido, sessao.mercado?.id ?? null).catch(() => undefined);
  for (const l of linhas) await vincularLinhaNota(produtoId, Number(l.id));
  return relatorio(sessaoId);
}

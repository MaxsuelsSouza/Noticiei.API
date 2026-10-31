import { sql } from "../db.js";
import { lerAnotacao } from "./anotacao.js";
import { lerCodigo, sugerirOpenFoodFacts, type SugestaoProduto } from "./codigo.js";
import { conciliar, similaridade, type Anotado, type Conciliacao, type LinhaNota } from "./conciliar.js";
import type { NotaLida } from "./nota.js";
import { valorLinha } from "./numeros.js";

export class ErroCompras extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
type Unidade = "UN" | "KG";

// ───────── catálogo ─────────

export interface Produto {
  id: number;
  nome: string;
  unidade: Unidade;
  codigos: { tipo: "ean" | "loja"; codigo: string; cnpj: string | null }[];
  ultimoPreco: { precoUnitario: number; data: string; origem: "nota" | "anotado" } | null;
}

interface ProdutoRow {
  id: string;
  nome: string;
  unidade: Unidade;
}

async function montarProdutos(rows: ProdutoRow[]): Promise<Produto[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => Number(r.id));
  const codigos = (await sql().query(
    `select produto_id, tipo, cnpj, codigo from compras_codigos where produto_id = any($1::bigint[]) order by created_at`,
    [ids],
  )) as { produto_id: string; tipo: "ean" | "loja"; cnpj: string; codigo: string }[];
  // Último preço: o da nota mais recente (preço real) ou, se nunca veio em nota, o último anotado.
  const precos = (await sql().query(
    `select distinct on (produto_id) produto_id, preco_unitario, data, origem from (
       select c.produto_id, i.preco_unitario, coalesce(n.emitida_em, n.created_at) as data, 'nota' as origem
         from compras_itens_nota i
         join compras_notas n on n.chave = i.chave
         join compras_codigos c on (c.tipo = 'loja' and c.cnpj = n.cnpj and c.codigo = i.codigo_loja)
                                or (c.tipo = 'ean' and c.codigo = i.ean)
        where c.produto_id = any($1::bigint[])
       union all
       select produto_id, preco_unitario, created_at, 'anotado' from compras_itens where produto_id = any($1::bigint[])
     ) p
     order by produto_id, (origem = 'nota') desc, data desc`,
    [ids],
  )) as { produto_id: string; preco_unitario: string; data: Date; origem: "nota" | "anotado" }[];

  return rows.map((r) => {
    const preco = precos.find((p) => p.produto_id === r.id);
    return {
      id: Number(r.id),
      nome: r.nome,
      unidade: r.unidade,
      codigos: codigos.filter((c) => c.produto_id === r.id).map((c) => ({ tipo: c.tipo, codigo: c.codigo, cnpj: c.cnpj || null })),
      ultimoPreco: preco ? { precoUnitario: Number(preco.preco_unitario), data: new Date(preco.data).toISOString(), origem: preco.origem } : null,
    };
  });
}

export async function getProduto(id: number): Promise<Produto | null> {
  const rows = (await sql().query(`select id, nome, unidade from compras_produtos where id = $1`, [id])) as ProdutoRow[];
  return (await montarProdutos(rows))[0] ?? null;
}

async function produtoDoCodigo(tipo: "ean" | "loja", codigo: string, cnpj = ""): Promise<Produto | null> {
  const rows = (await sql().query(
    `select p.id, p.nome, p.unidade from compras_codigos c join compras_produtos p on p.id = c.produto_id
      where c.tipo = $1 and c.cnpj = $2 and c.codigo = $3`,
    [tipo, cnpj, codigo],
  )) as ProdutoRow[];
  return (await montarProdutos(rows))[0] ?? null;
}

export type Leitura =
  | { status: "conhecido"; codigo: string; balanca: { valorCentavos: number } | null; produto: Produto }
  | { status: "novo"; codigo: string; balanca: { valorCentavos: number } | null; sugestao: SugestaoProduto | null };

/**
 * O app leu um código de barras. Conhecido → o produto e o último preço, para adicionar com um toque.
 * Novo → sugestão de nome do Open Food Facts; o app pergunta "esse produto já foi comprado?" e mostra a busca.
 */
export async function lerCodigoDeBarras(entrada: string, opcoes: { sugerir?: boolean } = {}): Promise<Leitura> {
  const lido = lerCodigo(entrada);
  if (lido.tipo === "invalido") throw new ErroCompras(lido.motivo);
  if (lido.tipo === "balanca") {
    const balanca = { valorCentavos: lido.valorCentavos };
    const produto = await produtoDoCodigo("ean", lido.prefixo);
    return produto ? { status: "conhecido", codigo: lido.prefixo, balanca, produto } : { status: "novo", codigo: lido.prefixo, balanca, sugestao: null };
  }
  const produto = await produtoDoCodigo("ean", lido.codigo);
  if (produto) return { status: "conhecido", codigo: lido.codigo, balanca: null, produto };
  return { status: "novo", codigo: lido.codigo, balanca: null, sugestao: opcoes.sugerir === false ? null : await sugerirOpenFoodFacts(lido.codigo) };
}

/** Código da embalagem como fica salvo (UPC-A vira EAN-13; etiqueta de balança vira o prefixo do produto). */
function codigoParaSalvar(entrada: string): string {
  const lido = lerCodigo(entrada);
  if (lido.tipo === "invalido") throw new ErroCompras(lido.motivo);
  return lido.tipo === "balanca" ? lido.prefixo : lido.codigo;
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
 * "Esse produto já foi comprado?": procura no catálogo e nas notas antigas (linhas que ainda não viraram produto).
 * O catálogo é pessoal e pequeno, então o filtro por nome parecido roda aqui, com as mesmas regras da conciliação.
 */
export async function buscarProdutos(busca: string): Promise<{ produtos: Produto[]; daNota: ItemDaNotaSemProduto[] }> {
  const termo = busca.trim();
  if (termo.length < 2) throw new ErroCompras("busca deve ter pelo menos 2 letras");

  const todos = (await sql().query(`select id, nome, unidade from compras_produtos order by updated_at desc limit 2000`)) as ProdutoRow[];
  const produtos = todos
    .map((p) => ({ p, s: similaridade(termo, p.nome).anotado }))
    .filter((x) => x.s >= 0.45)
    .sort((a, b) => b.s - a.s)
    .slice(0, 20)
    .map((x) => x.p);

  const linhas = (await sql().query(
    `select distinct on (n.cnpj, coalesce(i.codigo_loja, i.descricao))
            i.id, i.descricao, n.cnpj, n.estabelecimento, i.codigo_loja, i.ean, i.unidade, i.preco_unitario,
            coalesce(n.emitida_em, n.created_at) as data
       from compras_itens_nota i join compras_notas n on n.chave = i.chave
      where not exists (
        select 1 from compras_codigos c
         where (c.tipo = 'loja' and c.cnpj = n.cnpj and c.codigo = i.codigo_loja) or (c.tipo = 'ean' and c.codigo = i.ean))
      order by n.cnpj, coalesce(i.codigo_loja, i.descricao), coalesce(n.emitida_em, n.created_at) desc
      limit 3000`,
  )) as { id: string; descricao: string; cnpj: string; estabelecimento: string | null; codigo_loja: string | null; ean: string | null; unidade: Unidade; preco_unitario: string; data: Date }[];
  const daNota = linhas
    .map((l) => ({ l, s: similaridade(termo, l.descricao).anotado }))
    .filter((x) => x.s >= 0.45)
    .sort((a, b) => b.s - a.s)
    .slice(0, 20)
    .map(({ l }) => ({
      itemNotaId: Number(l.id),
      descricao: l.descricao,
      cnpj: l.cnpj,
      estabelecimento: l.estabelecimento,
      codigoLoja: l.codigo_loja,
      ean: l.ean,
      unidade: l.unidade,
      precoUnitario: Number(l.preco_unitario),
      compradoEm: new Date(l.data).toISOString(),
    }));

  return { produtos: await montarProdutos(produtos), daNota };
}

async function vincular(produtoId: number, tipo: "ean" | "loja", codigo: string, cnpj = ""): Promise<void> {
  // Um código aponta para um produto só; vincular de novo move o código (corrige um vínculo errado).
  await sql().query(
    `insert into compras_codigos (tipo, cnpj, codigo, produto_id) values ($1, $2, $3, $4)
     on conflict (tipo, cnpj, codigo) do update set produto_id = excluded.produto_id, created_at = now()`,
    [tipo, cnpj, codigo, produtoId],
  );
  await sql().query(`update compras_produtos set updated_at = now() where id = $1`, [produtoId]);
}

/** Liga os códigos de uma linha de nota (código da loja e, se veio, código de barras) a um produto. */
async function vincularLinhaNota(produtoId: number, itemNotaId: number): Promise<void> {
  const rows = (await sql().query(
    `select i.codigo_loja, i.ean, n.cnpj from compras_itens_nota i join compras_notas n on n.chave = i.chave where i.id = $1`,
    [itemNotaId],
  )) as { codigo_loja: string | null; ean: string | null; cnpj: string }[];
  const l = rows[0];
  if (!l) throw new ErroCompras("item da nota não encontrado", 404);
  if (l.codigo_loja) await vincular(produtoId, "loja", l.codigo_loja, l.cnpj);
  if (l.ean) await vincular(produtoId, "ean", l.ean);
}

export interface NovoProduto {
  nome?: string;
  unidade?: Unidade;
  /** Código de barras lido agora. */
  codigo?: string;
  /** Produto que já veio numa nota antiga (resposta da busca). */
  itemNotaId?: number;
}

/** Cadastra o produto do código novo, opcionalmente a partir de uma linha de nota antiga. */
export async function criarProduto(dados: NovoProduto): Promise<Produto> {
  let nome = dados.nome?.trim() ?? "";
  let unidade = dados.unidade;
  if (dados.itemNotaId) {
    const rows = (await sql().query(`select descricao, unidade from compras_itens_nota where id = $1`, [dados.itemNotaId])) as { descricao: string; unidade: Unidade }[];
    if (!rows[0]) throw new ErroCompras("item da nota não encontrado", 404);
    nome ||= rows[0].descricao;
    unidade ??= rows[0].unidade;
  }
  if (!nome || nome.length > 120) throw new ErroCompras("nome é obrigatório (até 120 letras)");
  if (unidade && unidade !== "UN" && unidade !== "KG") throw new ErroCompras("unidade deve ser UN ou KG");
  const codigo = dados.codigo ? codigoParaSalvar(dados.codigo) : null;

  const rows = (await sql().query(`insert into compras_produtos (nome, unidade) values ($1, $2) returning id`, [nome, unidade ?? "UN"])) as { id: string }[];
  const id = Number(rows[0]!.id);
  if (codigo) await vincular(id, "ean", codigo);
  if (dados.itemNotaId) await vincularLinhaNota(id, dados.itemNotaId);
  return (await getProduto(id))!;
}

/** "Sim, já comprei": liga o código lido a um produto que já existe. */
export async function vincularCodigo(produtoId: number, dados: { codigo?: string; itemNotaId?: number }): Promise<Produto> {
  if (!(await getProduto(produtoId))) throw new ErroCompras("produto não encontrado", 404);
  if (!dados.codigo && !dados.itemNotaId) throw new ErroCompras("mande codigo (código de barras) ou itemNotaId");
  if (dados.codigo) await vincular(produtoId, "ean", codigoParaSalvar(dados.codigo));
  if (dados.itemNotaId) await vincularLinhaNota(produtoId, dados.itemNotaId);
  return (await getProduto(produtoId))!;
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

export async function criarSessao(dados: { nome?: string; orcamentoCentavos?: number }): Promise<Sessao> {
  const orc = dados.orcamentoCentavos;
  if (orc !== undefined && orc !== null && !(Number.isSafeInteger(orc) && orc > 0)) throw new ErroCompras("orcamentoCentavos deve ser inteiro positivo");
  const rows = (await sql().query(`insert into compras_sessoes (nome, orcamento_centavos) values ($1, $2) returning id`, [dados.nome?.trim() || null, orc ?? null])) as { id: string }[];
  return (await getSessao(Number(rows[0]!.id)))!;
}

export async function listarSessoes(limite = 20) {
  const rows = (await sql().query(
    `select s.id, s.nome, s.orcamento_centavos, s.chave, s.created_at,
            count(i.id)::int as itens, coalesce(sum(i.valor_centavos), 0)::int as total
       from compras_sessoes s left join compras_itens i on i.sessao_id = s.id
      group by s.id order by s.created_at desc limit $1`,
    [limite],
  )) as { id: string; nome: string | null; orcamento_centavos: number | null; chave: string | null; created_at: Date; itens: number; total: number }[];
  return rows.map((r) => ({
    id: Number(r.id),
    nome: r.nome,
    orcamentoCentavos: r.orcamento_centavos,
    chave: r.chave,
    criadaEm: new Date(r.created_at).toISOString(),
    itens: r.itens,
    totalCentavos: r.total,
  }));
}

export async function getSessao(id: number): Promise<Sessao | null> {
  const s = (await sql().query(`select id, nome, orcamento_centavos, desconto_manual_centavos, chave, created_at from compras_sessoes where id = $1`, [id])) as {
    id: string; nome: string | null; orcamento_centavos: number | null; desconto_manual_centavos: number | null; chave: string | null; created_at: Date;
  }[];
  if (!s[0]) return null;
  const itens = ((await sql().query(`select * from compras_itens where sessao_id = $1 order by id`, [id])) as ItemRow[]).map(toItem);
  const total = itens.reduce((t, i) => t + i.valorCentavos, 0);
  const orc = s[0].orcamento_centavos;
  return {
    id: Number(s[0].id),
    nome: s[0].nome,
    orcamentoCentavos: orc,
    descontoManualCentavos: s[0].desconto_manual_centavos,
    chave: s[0].chave,
    criadaEm: new Date(s[0].created_at).toISOString(),
    itens,
    totalCentavos: total,
    saldoCentavos: orc === null ? null : orc - total,
  };
}

export async function atualizarSessao(id: number, dados: { nome?: string | null; orcamentoCentavos?: number | null; descontoManualCentavos?: number | null }): Promise<Sessao> {
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
  await sql().query(
    `update compras_sessoes set nome = $2, orcamento_centavos = $3, desconto_manual_centavos = $4, updated_at = now() where id = $1`,
    [id, nome, orc, desc],
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

async function montarItem(d: DadosItem, base?: ItemSessao): Promise<ItemPronto> {
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
  if (d.codigo !== undefined) {
    const lido = lerCodigo(d.codigo);
    if (lido.tipo === "invalido") throw new ErroCompras(lido.motivo);
    item.codigoLido = lido.codigo;
    const salvo = lido.tipo === "balanca" ? lido.prefixo : lido.codigo;
    if (lido.tipo === "balanca") balancaCentavos = lido.valorCentavos;
    const produto = await produtoDoCodigo("ean", salvo);
    if (produto && d.produtoId === undefined) item.produtoId = produto.id;
  }

  if (d.produtoId !== undefined) {
    const produto = await getProduto(d.produtoId);
    if (!produto) throw new ErroCompras("produto não encontrado", 404);
    item.produtoId = produto.id;
    if (!d.texto && !base) {
      item.descricao = produto.nome;
      item.unidade = produto.unidade;
      if (produto.ultimoPreco) item.precoUnitario = produto.ultimoPreco.precoUnitario;
    }
  } else if (item.produtoId !== null && !d.texto && !base) {
    const produto = await getProduto(item.produtoId);
    if (produto) {
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
    if (d.precoUnitario === undefined) item.precoUnitario = valor / 100 / item.quantidade;
  } else {
    item.valorCentavos = valorLinha(item.quantidade, item.precoUnitario);
  }

  if (!item.descricao) throw new ErroCompras("descricao é obrigatória (ou mande texto, produtoId ou um código conhecido)");
  if (item.descricao.length > 120) throw new ErroCompras("descricao até 120 letras");
  return item;
}

export async function adicionarItem(sessaoId: number, dados: DadosItem): Promise<{ item: ItemSessao; sessao: Sessao }> {
  if (!(await getSessao(sessaoId))) throw new ErroCompras("sessão não encontrada", 404);
  const i = await montarItem(dados);
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
  if (!atual) throw new ErroCompras("item não encontrado", 404);
  const i = await montarItem(dados, atual);
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

/** Grava a nota (uma vez por chave) e liga à sessão. Reimportar a mesma chave não duplica. */
export async function salvarNota(sessaoId: number, nota: NotaLida, bruto: string | null): Promise<{ nova: boolean }> {
  if (!(await getSessao(sessaoId))) throw new ErroCompras("sessão não encontrada", 404);
  const outra = (await sql().query(`select id from compras_sessoes where chave = $1 and id <> $2`, [nota.chave, sessaoId])) as { id: string }[];
  if (outra[0]) throw new ErroCompras(`essa nota já foi conferida na compra ${outra[0].id}`, 409);

  const inserida = await sql().query(
    `insert into compras_notas (chave, cnpj, estabelecimento, numero, serie, emitida_em, subtotal_centavos, descontos_centavos, total_centavos, origem, bruto)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) on conflict (chave) do nothing returning chave`,
    [nota.chave, nota.cnpj, nota.estabelecimento, nota.numero, nota.serie, nota.emitidaEm, nota.subtotalCentavos, nota.descontosCentavos, nota.totalCentavos, nota.origem, bruto?.slice(0, 2_000_000) ?? null],
  );
  const nova = inserida.length > 0;
  if (nova) {
    for (const i of nota.itens) {
      await sql().query(
        `insert into compras_itens_nota (chave, ordem, codigo_loja, ean, descricao, quantidade, unidade, preco_unitario, valor_centavos, desconto_centavos)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [nota.chave, i.ordem, i.codigoLoja, i.ean, i.descricao, i.quantidade, i.unidade, i.precoUnitario, i.valorCentavos, i.descontoCentavos],
      );
      // Veio o código de barras (XML) e ele já é conhecido: aprende também o código da loja.
      if (i.ean && i.codigoLoja) {
        const p = await produtoDoCodigo("ean", i.ean);
        if (p) await vincular(p.id, "loja", i.codigoLoja, nota.cnpj);
      }
    }
  }
  await sql().query(`update compras_sessoes set chave = $2, updated_at = now() where id = $1`, [sessaoId, nota.chave]);
  return { nova };
}

export interface Relatorio extends Conciliacao {
  sessao: { id: number; nome: string | null; orcamentoCentavos: number | null };
  nota: { chave: string; estabelecimento: string | null; cnpj: string; numero: string; serie: string; emitidaEm: string | null; origem: string } | null;
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
            (select c.produto_id from compras_codigos c
              where (c.tipo = 'loja' and c.cnpj = $2 and c.codigo = i.codigo_loja) or (c.tipo = 'ean' and c.codigo = i.ean)
              order by (c.tipo = 'ean') desc limit 1) as produto_id
       from compras_itens_nota i where i.chave = $1 order by i.ordem`,
    [nota.chave, nota.cnpj],
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
    sessao: { id: sessao.id, nome: sessao.nome, orcamentoCentavos: sessao.orcamentoCentavos },
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
  };
}

/**
 * Confirma (ou corrige) um par: essas anotações são essas linhas da nota. As anotações passam a apontar para um
 * produto do catálogo (o que já tinham, ou um novo com o nome anotado) e o código da loja de cada linha fica
 * vinculado a ele. Na próxima compra o par sai sozinho, como "codigo".
 */
export async function confirmarPar(sessaoId: number, dados: { itemIds: number[]; itemNotaIds: number[]; nome?: string }): Promise<Relatorio> {
  const sessao = await getSessao(sessaoId);
  if (!sessao?.chave) throw new ErroCompras("sessão sem nota", 409);
  const itens = sessao.itens.filter((i) => dados.itemIds.includes(i.id));
  if (!itens.length || itens.length !== new Set(dados.itemIds).size) throw new ErroCompras("itemIds inválidos");
  const linhas = (await sql().query(`select id, unidade from compras_itens_nota where chave = $1 and id = any($2::bigint[])`, [sessao.chave, dados.itemNotaIds])) as { id: string; unidade: Unidade }[];
  if (!linhas.length || linhas.length !== new Set(dados.itemNotaIds).size) throw new ErroCompras("itemNotaIds inválidos (devem ser da nota desta compra)");

  let produtoId = itens.find((i) => i.produtoId !== null)?.produtoId ?? null;
  if (produtoId === null) {
    const nome = dados.nome?.trim() || itens[0]!.descricao;
    const rows = (await sql().query(`insert into compras_produtos (nome, unidade) values ($1, $2) returning id`, [nome.slice(0, 120), linhas[0]!.unidade])) as { id: string }[];
    produtoId = Number(rows[0]!.id);
  }
  await sql().query(`update compras_itens set produto_id = $3 where sessao_id = $1 and id = any($2::bigint[])`, [sessaoId, dados.itemIds, produtoId]);
  for (const i of itens) {
    const lido = i.codigoLido ? lerCodigo(i.codigoLido) : null;
    if (lido?.tipo === "ean") await vincular(produtoId, "ean", lido.codigo);
  }
  for (const l of linhas) await vincularLinhaNota(produtoId, Number(l.id));
  return relatorio(sessaoId);
}


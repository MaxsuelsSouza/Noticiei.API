import { centavos, numeroBr, unidadeBase } from "./numeros.js";

/**
 * Leitura da NFC-e a partir do que o app manda: o XML (nfeProc), o HTML da página de consulta que o celular
 * baixou pelo link do QR code, ou o texto copiado dessa página. HTML vira texto e passa pelo mesmo leitor do
 * texto colado, então uma mudança de layout da página só quebra a leitura se mudar os rótulos ("Código", "Qtde.").
 */

export interface ItemLido {
  ordem: number;
  codigoLoja: string | null;
  ean: string | null;
  descricao: string;
  quantidade: number;
  unidade: "UN" | "KG";
  precoUnitario: number;
  valorCentavos: number;
  descontoCentavos: number;
}

export interface NotaLida {
  chave: string;
  uf: string;
  cnpj: string;
  numero: string;
  serie: string;
  emitidaEm: string | null;
  estabelecimento: string | null;
  itens: ItemLido[];
  subtotalCentavos: number;
  descontosCentavos: number | null;
  totalCentavos: number | null;
  origem: "xml" | "html" | "texto";
}

const UFS: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO", "21": "MA", "22": "PI",
  "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA", "31": "MG", "32": "ES",
  "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS", "50": "MS", "51": "MT", "52": "GO", "53": "DF",
};

/** Dígito verificador da chave de acesso (módulo 11, pesos 2 a 9 da direita para a esquerda). */
export function chaveValida(chave: string): boolean {
  if (!/^\d{44}$/.test(chave)) return false;
  let soma = 0;
  for (let i = 42, peso = 2; i >= 0; i--, peso = peso === 9 ? 2 : peso + 1) soma += Number(chave[i]) * peso;
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(chave[43]);
}

/** O que a chave já diz sem consultar nada. */
export function dadosDaChave(chave: string) {
  if (!chaveValida(chave)) throw new Error("chave de acesso inválida");
  const uf = UFS[chave.slice(0, 2)];
  if (!uf) throw new Error("chave de acesso com UF desconhecida");
  return {
    chave,
    uf,
    cnpj: chave.slice(6, 20),
    modelo: chave.slice(20, 22),
    serie: String(Number(chave.slice(22, 25))),
    numero: chave.slice(25, 34),
  };
}

/** Acha a chave num link do QR code (?p=chave|2|1|...) ou num texto (aceita os blocos de 4 dígitos com espaço). */
export function acharChave(texto: string): string | null {
  const p = /[?&]p=(\d{44})/.exec(texto);
  if (p && chaveValida(p[1]!)) return p[1]!;
  for (const m of texto.matchAll(/\d(?:[\d ]{42,60})\d/g)) {
    const digitos = m[0].replace(/ /g, "");
    for (let i = 0; i + 44 <= digitos.length; i++) {
      const c = digitos.slice(i, i + 44);
      if (chaveValida(c)) return c;
    }
  }
  return null;
}

/** Só links de consulta de Sefaz (.gov.br) são buscados pelo servidor. */
export function urlDeConsulta(url: string): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("url inválida");
  }
  if (!/^https?:$/.test(u.protocol) || !/\.gov\.br$/i.test(u.hostname)) throw new Error("url deve ser a consulta da Sefaz (.gov.br)");
  return u;
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decodificar = (t: string) =>
  t.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (todo, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTIDADES[e.toLowerCase()] ?? todo;
  });

/** HTML → texto com uma quebra de linha por bloco (linha de tabela, célula, div), como o "copiar" do navegador. */
export function htmlParaTexto(html: string): string {
  return decodificar(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/?(tr|td|th|div|p|li|br|table|tbody|h\d)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n[\n ]*/g, "\n");
}

// "Código" aceita o ó lido com a codificação errada (página em latin-1 lida como UTF-8: "C\uFFFDdigo", "CÃ³digo").
const ITEM =
  /([^\n]*?\S)\s*\(\s*C[^\sd]{1,3}digo:\s*([^)\s]+)\s*\)\s*Qtde\.?:\s*([\d.,]+)\s*UN:\s*([A-Za-z]+)\d*\s*Vl\.?\s*Unit\.?:\s*([\d.,]+)\s*Vl\.?\s*Total\s*:?\s*([\d.,]+)/g;

const valorRotulo = (texto: string, rotulo: RegExp) => {
  const m = new RegExp(`${rotulo.source}\\s*(?:R\\$)?\\s*:?\\s*([\\d.]*\\d,\\d{2})`, "i").exec(texto);
  return m ? centavos(numeroBr(m[1]!)) : null;
};

function emissao(texto: string): string | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})/.exec(texto);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}-03:00` : null;
}

function estabelecimentoDoTexto(texto: string): string | null {
  const linhas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  const i = linhas.findIndex((l) => /CNPJ/i.test(l));
  if (i <= 0) return null;
  const nome = linhas[i - 1]!;
  return nome.length <= 120 && !/C[^\sd]{1,3}digo:/i.test(nome) ? nome : null;
}

/** Texto copiado da página de consulta (ou HTML já convertido). */
export function lerTexto(texto: string, chaveInformada?: string | null, origem: "texto" | "html" = "texto"): NotaLida {
  const chave = chaveInformada ?? acharChave(texto);
  if (!chave) throw new Error("não achei a chave de acesso: mande também o link do QR code ou a chave");
  const dados = dadosDaChave(chave);

  const itens: ItemLido[] = [];
  for (const m of texto.matchAll(ITEM)) {
    const quantidade = numeroBr(m[3]!);
    itens.push({
      ordem: itens.length + 1,
      descricao: m[1]!.replace(/\s+/g, " ").trim(),
      codigoLoja: m[2]!,
      ean: null,
      quantidade,
      unidade: unidadeBase(m[4]!),
      precoUnitario: numeroBr(m[5]!),
      valorCentavos: centavos(numeroBr(m[6]!)),
      descontoCentavos: 0,
    });
  }
  if (!itens.length) throw new Error("não achei nenhum item da nota no conteúdo enviado");

  const subtotal = itens.reduce((s, i) => s + i.valorCentavos, 0);
  const total = valorRotulo(texto, /Valor\s+a\s+pagar/);
  let descontos = valorRotulo(texto, /Descontos?/);
  if (descontos === null && total !== null && total < subtotal) descontos = subtotal - total;

  return {
    ...dados,
    emitidaEm: emissao(texto),
    estabelecimento: estabelecimentoDoTexto(texto),
    itens,
    subtotalCentavos: subtotal,
    descontosCentavos: descontos,
    totalCentavos: total,
    origem,
  };
}

const tag = (xml: string, nome: string) => {
  const m = new RegExp(`<(?:\\w+:)?${nome}>([\\s\\S]*?)</(?:\\w+:)?${nome}>`).exec(xml);
  return m ? decodificar(m[1]!.trim()) : null;
};

/** XML da NFC-e (nfeProc ou NFe), como alguns portais devolvem ou o "baixar XML" da consulta. */
export function lerXml(xml: string): NotaLida {
  const id = /Id="NFe(\d{44})"/.exec(xml)?.[1] ?? tag(xml, "chNFe");
  if (!id) throw new Error("XML sem chave de acesso");
  const dados = dadosDaChave(id);
  const emit = tag(xml, "emit") ?? "";

  const itens: ItemLido[] = [];
  for (const det of xml.matchAll(/<(?:\w+:)?det\b[^>]*>([\s\S]*?)<\/(?:\w+:)?det>/g)) {
    const prod = tag(det[1]!, "prod") ?? "";
    const ean = tag(prod, "cEAN");
    itens.push({
      ordem: itens.length + 1,
      codigoLoja: tag(prod, "cProd"),
      ean: ean && /^\d{8,14}$/.test(ean) ? ean : null,
      descricao: (tag(prod, "xProd") ?? "").replace(/\s+/g, " "),
      quantidade: Number(tag(prod, "qCom") ?? 0),
      unidade: unidadeBase(tag(prod, "uCom") ?? "UN"),
      precoUnitario: Number(tag(prod, "vUnCom") ?? 0),
      valorCentavos: centavos(Number(tag(prod, "vProd") ?? 0)),
      descontoCentavos: centavos(Number(tag(prod, "vDesc") ?? 0)),
    });
  }
  if (!itens.length) throw new Error("XML sem itens");

  const tot = tag(xml, "ICMSTot") ?? "";
  const subtotal = itens.reduce((s, i) => s + i.valorCentavos, 0);
  const vDesc = tag(tot, "vDesc");
  const vNF = tag(tot, "vNF");
  return {
    ...dados,
    cnpj: tag(emit, "CNPJ") ?? dados.cnpj,
    emitidaEm: tag(xml, "dhEmi"),
    estabelecimento: tag(emit, "xFant") ?? tag(emit, "xNome"),
    itens,
    subtotalCentavos: subtotal,
    descontosCentavos: vDesc === null ? itens.reduce((s, i) => s + i.descontoCentavos, 0) : centavos(Number(vDesc)),
    totalCentavos: vNF === null ? null : centavos(Number(vNF)),
    origem: "xml",
  };
}

/** Descobre o formato do conteúdo e lê. */
export function lerNota(conteudo: string, chave?: string | null): NotaLida {
  const c = conteudo.trim();
  if (/<(\w+:)?(nfeProc|NFe)\b/.test(c) && /<(\w+:)?det\b/.test(c)) return lerXml(c);
  if (/<(html|body|table|div|span)\b/i.test(c)) return lerTexto(htmlParaTexto(c), chave ?? acharChave(c), "html");
  return lerTexto(c, chave);
}

/** Plano B: o servidor busca o link. Pode falhar (portal fora, bloqueio de IP de fora do Brasil). */
export async function baixarNota(url: string, timeoutMs = 20_000): Promise<string> {
  const u = urlDeConsulta(url);
  const resposta = await fetch(u, {
    headers: { "user-agent": "Mozilla/5.0 (Linux; Android 14) Noticiei", "accept-language": "pt-BR,pt;q=0.9" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resposta.ok) throw new Error(`Sefaz respondeu ${resposta.status}`);
  return resposta.text();
}

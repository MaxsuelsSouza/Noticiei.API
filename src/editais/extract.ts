/**
 * Regras que leem uma matéria de concurso (título + texto) e tiram dela o que dá para saber:
 * órgão, fase, salários, datas, banca, requisito, etapas. Funções puras, sem banco e sem IA.
 */
import { BANCAS, CIDADES_PERTO, ORGAOS, SIGLAS_COM_UF, UFS, type AreaOrgao, type Orgao } from "./orgaos.js";

// ───────────────────────── texto ─────────────────────────

/**
 * Minúsculas e sem acento, caractere por caractere: o tamanho não muda, então uma posição no texto
 * normalizado vale também no original (serve para recortar nomes com acento, ex.: "Chã Preta").
 */
export function normalizar(texto: string): string {
  let out = "";
  for (const c of texto) {
    const n = c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    out += n.length === c.length ? n : c;
  }
  return out;
}

export const slug = (texto: string) => normalizar(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// ───────────────────────── fases ─────────────────────────

/** Em ordem: um concurso só anda para a frente. */
export const FASES = ["rumor", "autorizado", "comissao", "banca", "edital", "inscricoes", "andamento", "encerrado"] as const;
export type Fase = (typeof FASES)[number];
export const ordemFase = (f: Fase) => FASES.indexOf(f);

const REGRAS_FASE: [Fase, RegExp][] = [
  ["encerrado", /homologad|resultado final|nomeac|nomeia|convoca(cao|dos)? (de )?aprovados/],
  ["andamento", /gabarito|\bresultado\b|locais de prova|cartao de confirmacao|provas? (sera|serao|e|sao) (aplicadas? )?(neste|amanha|hoje)|\brecursos?\b|aprovados/],
  ["inscricoes", /inscricoes abertas|abrem?( as)? inscricoes|inscreva-se|inscricoes (comecam|iniciam|terminam|encerram|vao ate|ate|seguem)|ultimos dias|ultimo dia|prorroga|reabre|abre (concursos?|selecao|processo seletivo|\d+ vagas)|abre(m)? edital/],
  ["edital", /edital (publicado|divulgado|aberto|saiu|lancado|na praca|com|oferece|traz)|publica(do)? (o )?edital|sai edital|retifica/],
  ["banca", /banca (definida|contratada|escolhida|confirmada)|contrata(da)? (a )?banca|define (a )?banca|escolhe (a )?banca|banca e (o|a) /],
  ["comissao", /comissao (formada|organizadora|instituida|criada|designada)|banca em definicao|definicao (da )?banca|escolha da banca|projeto basico/],
  ["autorizado", /autoriza|autorizacao/],
];

export function detectarFase(titulo: string, texto: string): Fase {
  const t = normalizar(titulo);
  for (const [fase, regra] of REGRAS_FASE) if (regra.test(t)) return fase;
  // No corpo, "resultado" e "recurso" aparecem em qualquer matéria: só valem as fases de antes da prova.
  const inicio = normalizar(texto.slice(0, 800));
  for (const [fase, regra] of REGRAS_FASE) {
    if (fase === "andamento" || fase === "encerrado") continue;
    if (regra.test(inicio)) return fase;
  }
  return "rumor";
}

// ───────────────────────── dinheiro ─────────────────────────

export interface Salario {
  centavos: number;
  /** Valor depois da formação / fim de carreira (o inicial pode ser menor). */
  final: boolean;
  /** Citado perto de um cargo de TI. */
  ti: boolean;
  /** Citado perto de um cargo que você pode fazer (TI, qualquer superior, técnico, médio, fundamental). */
  acessivel?: boolean;
}

/** Cargos que você pode fazer sem formação específica: nível médio/fundamental, curso técnico, qualquer superior. */
const ACESSIVEL = /\b(nivel medio|ensino medio|nivel fundamental|ensino fundamental|nivel tecnico|curso tecnico|tecnicos? (?:em|de) [a-z]{4,}|qualquer (?:area|curso|graduacao|formacao)|nivel superior em qualquer|qualquer curso superior|tecnologos?)\b/g;

/**
 * Cargos que exigem formação ou registro profissional específico (Medicina, Direito, Engenharia, licenciatura…).
 * "Técnico em enfermagem" não entra: só "enfermeiro".
 */
const NICHO: [string, RegExp][] = [
  ["medicina", /\bmedic[oa]s?\b(?! veterinari)|\bmedicina\b|residencia medica/],
  ["enfermagem (superior)", /\benfermeir[oa]s?\b/],
  ["odontologia", /\bdentistas?\b|\bodontolog/],
  ["farmácia", /\bfarmaceutic[oa]s?\b/],
  ["fisioterapia", /\bfisioterapeutas?\b/],
  ["psicologia", /\bpsicolog[oa]s?\b/],
  ["nutrição", /\bnutricionistas?\b/],
  ["veterinária", /\bveterinari[oa]s?\b|medic[oa]s? veterinari/],
  ["Direito", /\bjuiz(es|a)?\b|\bmagistratura\b|\bpromotor(es|a)?\b|\bprocurador(es|a)?\b|\bdefensor(es|a)?\b|\bdelegad[oa]s?\b|\badvogad[oa]s?\b|\bcartorio\b|\btabeliao\b/],
  ["engenharia", /\bengenheir[oa]s?\b/],
  ["arquitetura", /\barquitet[oa]s?\b/],
  ["contabilidade", /\bcontador(es|a)?\b/],
  ["licenciatura", /\bprofessor(es|a|as)?\b|\bdocentes?\b|\bpedagog[oa]s?\b/],
];

export const nichosNoTexto = (n: string) => NICHO.filter(([, r]) => r.test(n)).map(([nome]) => nome);

export function posicoesAcessivel(n: string): number[] {
  return [...n.replace(INFORMATICA_BASICA, (m) => " ".repeat(m.length)).matchAll(ACESSIVEL)].map((m) => m.index!);
}

const DINHEIRO = /r\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)(\s*mil\b)?/g;
const PALAVRA_SALARIO = /salario|remunera|vencimento|subsidio|ganho|inicia(is|l)|ganhar|\bpaga|chegar a|chegam a/g;
const PALAVRA_BENEFICIO = /(auxilio|vale|ticket|tiquete|bolsa|taxa|isencao|beneficio|diaria|indenizacao|ajuda de custo|plr|participacao nos lucros|alimentacao|refeicao|transporte|creche)/g;
const PALAVRA_FINAL_ANTES = /(apos (a |o )?(formacao|curso|estagio|posse)|final (de|da) carreira|podendo chegar|pode chegar|chegar a|chegam a|ao longo da carreira|no topo|ultima classe|classe especial)[^r]{0,30}$/;
const PALAVRA_FINAL_DEPOIS = /^\s*[(,–-]?\s*(apos|no final|ao final|final de carreira|no fim)/;
const NAO_MENSAL = /^\s*(por|\/)\s*(plantao|hora|aula|dia|mes de estagio)/;

export function valorEmCentavos(numero: string, mil: boolean): number {
  const n = Number(numero.replace(/\./g, "").replace(",", "."));
  return Math.round(n * (mil ? 1000 : 1) * 100);
}

/** Posições de menção a cargo/área de TI no texto normalizado. */
const TI = /\b(tecnologia da informacao|tecnologia de informacao|tecnologia da informacao e comunicacao|ti|tic|analistas? de sistemas?|analise de sistemas|desenvolvimento de (sistemas|software)|desenvolvedor(es)?|programador(es)?|ciencia de dados|cientistas? de dados|engenharia de software|engenheiros? de software|banco de dados|infraestrutura de ti|seguranca da informacao|seguranca cibernetica|informatica|computacao|agentes? de tecnologia|analistas? de dados|redes de computadores|suporte tecnico)\b/g;
/** "Noções de informática" cai em quase todo concurso e não diz nada sobre cargo de TI. */
const INFORMATICA_BASICA = /(nocoes|conhecimentos basicos|conceitos basicos) de informatica|informatica basica/g;

export function posicoesTi(n: string): number[] {
  const limpo = n.replace(INFORMATICA_BASICA, (m) => " ".repeat(m.length));
  return [...limpo.matchAll(TI)].map((m) => m.index!);
}

const DISTANCIA_TI = 160;

export function extrairSalarios(n: string, todoTi = false): Salario[] {
  const ti = posicoesTi(n);
  const acessiveis = [...ti, ...posicoesAcessivel(n)];
  const nichos = NICHO.flatMap(([, r]) => [...n.matchAll(new RegExp(r.source, "g"))].map((m) => m.index!));
  // Vale o cargo citado mais perto do valor: "Médico: R$ 15 mil … Técnico: R$ 2.500" não mistura os dois.
  const pertoDeAcessivel = (pos: number) => {
    const dist = (lista: number[]) => Math.min(Infinity, ...lista.map((p) => Math.abs(p - pos)));
    const a = dist(acessiveis);
    return a <= DISTANCIA_TI && a <= dist(nichos);
  };
  const salarios: Salario[] = [];
  for (const m of n.matchAll(DINHEIRO)) {
    const inicio = m.index!;
    const fim = inicio + m[0].length;
    const antes = n.slice(Math.max(0, inicio - 70), inicio);
    const depois = n.slice(fim, fim + 40);
    if (NAO_MENSAL.test(depois)) continue;
    // Benefício só se a palavra de benefício estiver mais perto do valor do que a de salário.
    const ultimoBeneficio = Math.max(-1, ...[...antes.matchAll(PALAVRA_BENEFICIO)].map((b) => b.index!));
    const posSalario = Math.max(-1, ...[...antes.matchAll(PALAVRA_SALARIO)].map((s) => s.index!));
    if (ultimoBeneficio >= 0 && ultimoBeneficio > posSalario && antes.length - ultimoBeneficio < 45) continue;
    const centavos = valorEmCentavos(m[1]!, Boolean(m[2]));
    // Fora disso é taxa, valor total de contrato ou erro de leitura.
    if (centavos < 100_000 || centavos > 8_000_000) continue;
    salarios.push({
      centavos,
      final: PALAVRA_FINAL_ANTES.test(antes) || PALAVRA_FINAL_DEPOIS.test(depois),
      ti: todoTi || ti.some((p) => Math.abs(p - inicio) <= DISTANCIA_TI),
      acessivel: todoTi || pertoDeAcessivel(inicio),
    });
  }
  return salarios;
}

// ───────────────────────── datas ─────────────────────────

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};
const DATA = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b|\b(\d{1,2})(?:º)? de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?: de (\d{4}))?/g;

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Datas do trecho, em ISO. Sem ano: o da referência, ou o seguinte se ficaria mais de 2 meses no passado. */
export function datasNoTrecho(trecho: string, referencia: Date): string[] {
  const result: string[] = [];
  for (const m of trecho.matchAll(DATA)) {
    const d = Number(m[1] ?? m[4]);
    const mes = m[2] ? Number(m[2]) : MESES[m[5]!]!;
    let anoTexto = m[3] ?? m[6];
    if (anoTexto && anoTexto.length === 2) anoTexto = `20${anoTexto}`;
    if (d < 1 || d > 31 || mes < 1 || mes > 12) continue;
    let ano = anoTexto ? Number(anoTexto) : referencia.getUTCFullYear();
    if (!anoTexto && Date.UTC(ano, mes - 1, d) < referencia.getTime() - 60 * 86_400_000) ano += 1;
    if (ano < 2000 || ano > 2100) continue;
    result.push(iso(ano, mes, d));
  }
  return result;
}

function janelas(n: string, chave: RegExp, tamanho: number): { trecho: string; antes: string }[] {
  const global = new RegExp(chave.source, "g");
  // A janela não atravessa o fim da frase: "inscrições até 20/06. A prova será em 26/07" são duas coisas.
  return [...n.matchAll(global)].map((m) => {
    const trecho = n.slice(m.index!, m.index! + m[0].length + tamanho);
    const antes = n.slice(Math.max(0, m.index! - 40), m.index!);
    return {
      trecho: trecho.split(/\.\s/)[0]!,
      antes: antes.split(/\.\s/).pop()!,
    };
  });
}

const maiorData = (datas: string[]) => (datas.length ? datas.reduce((a, b) => (a > b ? a : b)) : null);

export function extrairDatas(n: string, referencia: Date) {
  const inscricao = janelas(n, /inscric(oes|ao)/, 110)
    .filter((j) => !/isenca/.test(j.antes) && !/isenca/.test(j.trecho.slice(0, 40)))
    .flatMap((j) => datasNoTrecho(j.trecho, referencia));
  const isencao = janelas(n, /isencao/, 110).flatMap((j) => datasNoTrecho(j.trecho, referencia));
  const prova = janelas(n, /\bprovas?( objetivas?| escritas?)?\b/, 90)
    .filter((j) => !/titulos/.test(j.trecho.slice(0, 20)))
    .map((j) => datasNoTrecho(j.trecho, referencia)[0])
    .filter((d): d is string => Boolean(d));
  return { inscricoesAte: maiorData(inscricao), isencaoAte: maiorData(isencao), provaEm: prova[0] ?? null };
}

// ───────────────────────── órgão ─────────────────────────

export interface OrgaoEncontrado {
  chave: string;
  nome: string;
  uf: string | null;
  esfera: Orgao["esfera"] | null;
  area?: AreaOrgao;
  /** "dicionario" = órgão conhecido; "padrao" = reconhecido pelo formato do título (menos certeza). */
  origem: "dicionario" | "padrao";
}

const SIGLAS_UF = Object.keys(UFS).map((u) => u.toLowerCase());
const NOMES_UF = Object.entries(UFS);

/** Título de matéria-resumo ("Concursos PE: 20 editais"), que fala de vários concursos e não de um. */
export function ehPanorama(titulo: string): boolean {
  const t = normalizar(titulo).trim();
  return /^(os |\d+ )?concursos\b/.test(t) || /concursos e selecoes|editais (abertos|previstos)\b|^confira (os )?concursos/.test(t);
}

function ufNoTexto(n: string): string | null {
  const contagem = new Map<string, number>();
  for (const [uf, nome] of NOMES_UF) {
    const vezes = n.match(new RegExp(`\\b${nome}\\b|[-(/]\\s?${uf.toLowerCase()}\\b`, "g"))?.length ?? 0;
    if (vezes) contagem.set(uf, vezes);
  }
  // "Mato Grosso do Sul" também casa "Mato Grosso"; "Pará" casa dentro de "Paraíba" não (\b), ok.
  const [melhor] = [...contagem].sort((a, b) => b[1] - a[1]);
  return melhor?.[0] ?? null;
}

const PARADAS = new Set([
  "abre", "abrem", "publica", "publicam", "divulga", "retifica", "prorroga", "tem", "oferece", "lanca", "anuncia", "realiza",
  "convoca", "homologa", "suspende", "cancela", "reabre", "define", "contrata", "autoriza", "com", "para", "e", "inicia",
  "encerra", "recebe", "seleciona", "vai", "pode", "deve", "terá", "tera", "concurso", "edital", "processo", "selecao",
]);

function cidadeDoTitulo(original: string, n: string, depoisDe: number): { cidade: string; uf: string | null } | null {
  const palavras: string[] = [];
  let uf: string | null = null;
  const resto = original.slice(depoisDe);
  const restoN = n.slice(depoisDe);
  const tokens = [...resto.matchAll(/[^\s\-–(),:!?/]+|[\-–(),:!?/]/g)];
  for (const t of tokens) {
    const palavra = t[0];
    const normal = restoN.slice(t.index!, t.index! + palavra.length);
    if (/^[\-–(/]$/.test(palavra)) {
      // "Caruaru - PE" / "Caruaru (PE)": o próximo token pode ser a UF.
      const prox = tokens[tokens.indexOf(t) + 1]?.[0];
      if (prox && SIGLAS_UF.includes(prox.toLowerCase()) && prox === prox.toUpperCase()) uf = prox.toUpperCase();
      break;
    }
    if (/^[),:!?]$/.test(palavra)) break;
    if (palavra.length === 2 && palavra === palavra.toUpperCase() && SIGLAS_UF.includes(normal)) {
      uf = palavra;
      break;
    }
    if (PARADAS.has(normal) || /^\d/.test(palavra)) break;
    palavras.push(palavra);
    if (palavras.length >= 5) break;
  }
  if (!palavras.length) return null;
  return { cidade: palavras.join(" "), uf };
}

export function identificarOrgao(titulo: string, texto: string): OrgaoEncontrado | null {
  const n = normalizar(titulo);
  const corpo = normalizar(texto.slice(0, 2000));

  for (const org of ORGAOS) {
    if (org.padroes.some((p) => p.test(n))) {
      return { chave: org.chave, nome: org.nome, uf: org.uf, esfera: org.esfera, area: org.area, origem: "dicionario" };
    }
  }

  for (const s of SIGLAS_COM_UF) {
    const porSigla = new RegExp(`\\b(${s.sigla.source})\\s*[-–/]?\\s*(${SIGLAS_UF.join("|")})\\b`).exec(n);
    const porNome = new RegExp(`\\b(${s.sigla.source})\\s+(?:d[aoe]\\s+)?(${NOMES_UF.map(([, nome]) => nome).join("|")})\\b`).exec(n);
    const uf = porSigla ? porSigla[porSigla.length - 1]!.toUpperCase()
      : porNome ? NOMES_UF.find(([, nome]) => nome === porNome[porNome.length - 1])![0] : null;
    if (uf) return { chave: `${s.chave}-${uf.toLowerCase()}`, nome: `${s.nome} ${uf}`, uf, esfera: s.esfera, area: s.area, origem: "padrao" };
  }

  const pref = /\b(prefeitura|camara)( municipal)? (de|do|da|dos|das) /.exec(n);
  if (pref) {
    const achado = cidadeDoTitulo(titulo, n, pref.index + pref[0].length);
    if (achado) {
      const cidadeN = normalizar(achado.cidade);
      const uf = achado.uf ?? CIDADES_PERTO[cidadeN] ?? ufNoTexto(corpo);
      const tipo = pref[1] === "camara" ? "camara" : "pref";
      const nome = `${tipo === "camara" ? "Câmara" : "Prefeitura"} de ${achado.cidade}${uf ? ` (${uf})` : ""}`;
      return { chave: `${tipo}-${slug(achado.cidade)}${uf ? `-${uf.toLowerCase()}` : ""}`, nome, uf, esfera: "municipal", origem: "padrao" };
    }
  }

  // "Concurso Sefaz Bahia: ...", "Concurso ATI: ..." — o nome vem antes de ":" ou de um verbo.
  const geral = /\bconcurso (?:publico )?(?:d[aoe]s? )?(.{2,40}?)(?:\s*[:!,?–]|\s+-\s|\s+(?:20\d\d|tem|abre|publica|divulga|tera|deve|pode|sai|edital|autorizado|banca|inscricoes|vagas|gabarito|resultado|oferece)\b)/.exec(n);
  if (geral) {
    const nomeN = geral[1]!.trim();
    if (/[a-z]/.test(nomeN) && !/^(publico|federal|nacional|estadual|municipal|unificado|aberto|previsto|ti)$/.test(nomeN)) {
      const original = titulo.slice(geral.index + geral[0].indexOf(geral[1]!), geral.index + geral[0].indexOf(geral[1]!) + geral[1]!.length).trim();
      const ufFinal = /\s(\w\w)$/.exec(nomeN)?.[1];
      const uf = ufFinal && SIGLAS_UF.includes(ufFinal) ? ufFinal.toUpperCase() : ufNoTexto(`${n} ${corpo}`);
      return { chave: slug(nomeN), nome: original, uf, esfera: null, origem: "padrao" };
    }
  }

  // "Emprel abre seleção…", "Detran Paraíba publica edital…" (formato comum no PCI): o nome vem antes do verbo.
  const verbo = /^(.{2,50}?)(?:\s*[-–]\s*(\w\w))?\s+(?:abre|abrem|publica|divulga|retifica|prorroga|lanca|anuncia|oferece|realiza|homologa|suspende|reabre|convoca)\b/.exec(n);
  if (verbo && /[a-z]{3}/.test(verbo[1]!) && !/^(o|a|os|as|governo|concurso|edital|selecao|processo)\b/.test(verbo[1]!.trim())) {
    const nomeN = verbo[1]!.trim();
    const original = titulo.slice(0, nomeN.length).trim();
    const ufTitulo = verbo[2] && SIGLAS_UF.includes(verbo[2]) ? verbo[2].toUpperCase() : null;
    const uf = ufTitulo ?? /\s[-–(]\s?(\w\w)\)?\s*$/.exec(n)?.[1]?.toUpperCase() ?? ufNoTexto(`${n} ${corpo}`);
    return { chave: slug(`${nomeN}${uf ? ` ${uf}` : ""}`), nome: original, uf: uf && UFS[uf] ? uf : null, esfera: null, origem: "padrao" };
  }
  return null;
}

// ───────────────────────── o resto ─────────────────────────

const POLICIA_TI = /(perito|pericia)[^.]{0,60}(informatica|computacao|tecnologia da informacao)|computacao forense|area 3[^.]{0,30}(informatica|computacao)/;
const POLICIA_GERAL = /\b(policia federal|policia rodoviaria federal|policia civil|agente de policia|agentes? da policia|escrivao|escrivaes|papiloscopista|oficiais? de inteligencia|agentes? de inteligencia|abin)\b/;

const ETAPAS: [string, RegExp][] = [
  ["discursiva", /discursiva|redacao/],
  ["prova prática", /prova pratica/],
  ["títulos", /(prova|avaliacao) de titulos/],
  ["teste físico (TAF)", /\btaf\b|aptidao fisica|teste fisico|exame fisico/],
  ["avaliação psicológica", /psicotecnico|avaliacao psicologica|exame psicologico/],
  ["investigação social", /investigacao social/],
  ["exame médico", /exame medico|avaliacao medica|exames medicos/],
  ["curso de formação", /curso de formacao/],
];
const RESTRICOES: [string, RegExp][] = [
  ["limite de idade", /idade (maxima|minima|limite)|limite de idade/],
  ["altura mínima", /altura minima/],
  ["CNH", /\bcnh\b|carteira nacional de habilitacao/],
];
const NUMEROS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, dezoito: 18, "vinte e quatro": 24, trinta: 30, "trinta e seis": 36,
};
const QUANTIDADE = "(\\d{1,2}|vinte e quatro|trinta e seis|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|dezoito|trinta)";
const DURACAO = new RegExp(
  `(?:contrat\\w*|vigencia|duracao|prazo d[ea] (?:contrato|contratacao|vigencia)|temporari\\w*)[^.;]{0,70}?\\b(?:de|ate|por|em)\\s+(?:ate\\s+)?${QUANTIDADE}\\s*(?:\\(\\w+\\)\\s*)?(meses|mes|anos?)\\b([^.;]{0,90})`,
);

export interface Duracao {
  meses: number;
  prorrogavel: boolean;
  /** Até quantos meses no total, se o texto disser ("prorrogável por igual período" = o dobro). */
  ateMeses: number | null;
}

const emMeses = (quantidade: string, unidade: string) => (NUMEROS[quantidade] ?? Number(quantidade)) * (/ano/.test(unidade) ? 12 : 1);

/**
 * Duração do contrato temporário ("contrato de 12 meses, prorrogável por igual período"). Ignora a validade do
 * concurso ("validade de 2 anos"), que é outra coisa.
 */
export function duracaoTemporario(n: string): Duracao | null {
  for (const frase of n.split(/\.\s|;\s|\n/)) {
    if (/validade/.test(frase) && !/contrat/.test(frase)) continue;
    const m = DURACAO.exec(frase);
    if (!m) continue;
    const antes = frase.slice(0, m.index + m[0].length - m[3]!.length);
    if (/validade[^.]{0,40}$/.test(antes)) continue;
    const meses = emMeses(m[1]!, m[2]!);
    if (!meses || meses > 72) continue;
    const resto = m[3] ?? "";
    const prorrogavel = /prorrog/.test(resto);
    const ate = new RegExp(`(?:ate|por mais|por)\\s+(?:ate\\s+)?${QUANTIDADE}\\s*(meses|mes|anos?)`).exec(resto.slice(resto.search(/prorrog/) + 1 || 0));
    const ateMeses = !prorrogavel ? null : /igual periodo/.test(resto) ? meses * 2 : ate ? meses + emMeses(ate[1]!, ate[2]!) : null;
    return { meses, prorrogavel, ateMeses };
  }
  return null;
}

const CLT_ORGAOS = new Set(["bb", "caixa", "bnb", "serpro", "dataprev", "petrobras", "correios", "bndes", "compesa"]);

export interface Extracao {
  orgao: OrgaoEncontrado | null;
  fase: Fase;
  banca: string | null;
  vagas: number | null;
  cadastroReserva: boolean;
  regime: "estatutario" | "clt" | "temporario" | null;
  /** Só para temporário: quanto tempo dura o contrato. */
  duracao: Duracao | null;
  taxaCentavos: number | null;
  inscricoesAte: string | null;
  isencaoAte: string | null;
  provaEm: string | null;
  salarios: Salario[];
  temTi: boolean;
  policiaTi: boolean;
  policiaGeral: boolean;
  aceitaTecnologo: boolean | null;
  exigeBacharelado: boolean;
  /** Nível médio ou fundamental (não pede diploma). */
  nivelMedio: boolean;
  /** Curso técnico (técnico em enfermagem, segurança do trabalho…). */
  nivelTecnico?: boolean;
  /** Aceita qualquer graduação. */
  qualquerSuperior?: boolean;
  /** Formações específicas citadas no título (concurso de médico, juiz…). */
  nicho?: string[];
  etapas: string[];
  restricoes: string[];
  cidadesProva: string[];
  provaNasCapitais: boolean;
  editais: string[];
}

export interface Materia {
  titulo: string;
  texto: string;
  publicadoEm: Date | null;
  /** Links de PDF encontrados na página da matéria. */
  pdfs?: string[];
}

function cidadesDeProva(n: string): { cidades: string[]; capitais: boolean } {
  const trechos = janelas(n, /(provas?|aplicacao|aplicadas?)\b/, 160).map((j) => j.trecho).join(" | ");
  const cidades = Object.keys(CIDADES_PERTO).filter((c) => new RegExp(`\\b${c}\\b`).test(trechos));
  return {
    // "jaboatao" e "jaboatao dos guararapes" são a mesma: fica a forma mais longa.
    cidades: cidades.filter((c) => !cidades.some((o) => o !== c && o.includes(c))),
    capitais: /todas as (27 )?capitais|nas 27 capitais|em todas as unidades da federacao|todos os estados/.test(n),
  };
}

export function extrair(materia: Materia): Extracao {
  const referencia = materia.publicadoEm ?? new Date();
  const orgao = identificarOrgao(materia.titulo, materia.texto);
  const n = normalizar(`${materia.titulo}. ${materia.texto}`);
  const todoTi = orgao?.area === "ti";

  const tiPos = posicoesTi(n);
  const banca = BANCAS.find((b) => b.padrao.test(normalizar(materia.titulo)))
    ?? BANCAS.find((b) => janelas(n, /\bbanca\b/, 80).some((j) => b.padrao.test(j.trecho)))
    ?? null;
  const vagas = /(\d{1,3}(?:\.\d{3})+|\d+) (novas )?vagas/.exec(normalizar(materia.titulo)) ?? /(\d{1,3}(?:\.\d{3})+|\d+) (novas )?vagas/.exec(n);
  const taxa = /taxa de inscricao[^r]{0,40}r\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/.exec(n);
  const temporario = /contratacao temporaria|\btemporari[oa]s?\b|processo seletivo simplificado|selecao simplificada|\bpss\b/.test(n)
    || /\b(abre|abrem) selecao\b|processo seletivo/.test(normalizar(materia.titulo));
  const clt = /\bclt\b|emprego publico|empregados? publicos?/.test(n) || CLT_ORGAOS.has(orgao?.chave ?? "");
  const tecnologo = /tecnologo|curso superior de tecnologia|graduacao tecnologica|qualquer (area de formacao|graduacao|curso superior|area)|nivel superior em qualquer/.test(n);
  const bacharel = /bacharel(ado)? em (ciencia da computacao|sistemas de informacao|engenharia (de|da) (computacao|software))/.test(n);
  const { cidades, capitais } = cidadesDeProva(n);
  const datas = extrairDatas(n, referencia);

  return {
    orgao,
    fase: detectarFase(materia.titulo, materia.texto),
    banca: banca?.nome ?? null,
    vagas: vagas ? Number(vagas[1]!.replace(/\./g, "")) : null,
    cadastroReserva: /cadastro (de )?reserva|\+ ?\d* ?cr\b/.test(n),
    regime: temporario ? "temporario" : clt ? "clt" : /estatutari/.test(n) ? "estatutario" : null,
    duracao: temporario ? duracaoTemporario(n) : null,
    taxaCentavos: taxa ? valorEmCentavos(taxa[1]!, false) : null,
    ...datas,
    salarios: extrairSalarios(n, todoTi),
    temTi: todoTi || tiPos.length > 0,
    policiaTi: POLICIA_TI.test(n),
    policiaGeral: orgao?.area === "policia" || POLICIA_GERAL.test(normalizar(materia.titulo)),
    aceitaTecnologo: tecnologo ? true : bacharel ? false : null,
    exigeBacharelado: bacharel && !tecnologo,
    nivelMedio: /nivel medio|ensino medio|nivel fundamental|ensino fundamental|nao (?:e )?exige (?:diploma|formacao)/.test(n),
    nivelTecnico: /nivel tecnico|curso tecnico|\btecnicos? (?:em|de) (?!informatica basica)[a-z]{4,}/.test(n),
    qualquerSuperior: /qualquer (?:area|curso|graduacao|formacao)|nivel superior em qualquer|qualquer curso superior/.test(n),
    nicho: nichosNoTexto(normalizar(materia.titulo)),
    etapas: ETAPAS.filter(([, r]) => r.test(n)).map(([nome]) => nome),
    restricoes: RESTRICOES.filter(([, r]) => r.test(n)).map(([nome]) => nome),
    cidadesProva: cidades,
    provaNasCapitais: capitais,
    editais: [...new Set(materia.pdfs ?? [])],
  };
}

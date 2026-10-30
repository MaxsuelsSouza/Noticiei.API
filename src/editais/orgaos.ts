/**
 * Dicionários do módulo de editais: estados, cidades de prova que importam e órgãos conhecidos.
 * Tudo por regra (sem IA). Órgão fora do dicionário ainda é reconhecido pelos padrões em extract.ts
 * ("TJ PE", "Prefeitura de Caruaru - PE"), só com menos certeza.
 */

export const UFS: Record<string, string> = {
  AC: "acre", AL: "alagoas", AP: "amapa", AM: "amazonas", BA: "bahia", CE: "ceara", DF: "distrito federal",
  ES: "espirito santo", GO: "goias", MA: "maranhao", MT: "mato grosso", MS: "mato grosso do sul", MG: "minas gerais",
  PA: "para", PB: "paraiba", PR: "parana", PE: "pernambuco", PI: "piaui", RJ: "rio de janeiro", RN: "rio grande do norte",
  RS: "rio grande do sul", RO: "rondonia", RR: "roraima", SC: "santa catarina", SP: "sao paulo", SE: "sergipe", TO: "tocantins",
};

/** Peso da região: Pernambuco primeiro, vizinhos depois, Bahia um pouco abaixo. Resto do país = peso baixo. */
export const PESO_UF: Record<string, number> = { PE: 1, PB: 0.8, AL: 0.8, RN: 0.8, BA: 0.6 };
export const PESO_NACIONAL = 0.5;
export const PESO_OUTRA_UF = 0.2;
export const PESO_UF_DESCONHECIDA = 0.3;

/** Cidades onde uma prova ou vaga "fica perto". Normalizadas (sem acento, minúsculas). */
export const CIDADES_PERTO: Record<string, string> = {
  recife: "PE", olinda: "PE", jaboatao: "PE", "jaboatao dos guararapes": "PE", paulista: "PE", caruaru: "PE",
  petrolina: "PE", garanhuns: "PE", "vitoria de santo antao": "PE", "cabo de santo agostinho": "PE", igarassu: "PE",
  "joao pessoa": "PB", "campina grande": "PB", patos: "PB",
  maceio: "AL", arapiraca: "AL",
  natal: "RN", mossoro: "RN",
  salvador: "BA", "feira de santana": "BA", "vitoria da conquista": "BA", juazeiro: "BA",
};

/**
 * Área do órgão:
 * - "ti": o órgão é de TI (todo cargo de lá interessa);
 * - "policia": polícia/inteligência que interessa (PF, PRF, ABIN, Polícia Civil);
 * - "fora": nunca aparece (PM, bombeiro, polícia penal, guarda municipal).
 * Sem área: depende dos cargos citados (só entra se tiver cargo de TI).
 */
export type AreaOrgao = "ti" | "policia" | "fora";

export interface Orgao {
  chave: string;
  nome: string;
  /** "BR" = nacional (federal com prova em vários estados). */
  uf: string;
  esfera: "federal" | "estadual" | "municipal";
  area?: AreaOrgao;
  /** Regras sobre o texto normalizado (sem acento, minúsculo). */
  padroes: RegExp[];
}

const o = (chave: string, nome: string, uf: string, esfera: Orgao["esfera"], padroes: RegExp[], area?: AreaOrgao): Orgao =>
  ({ chave, nome, uf, esfera, padroes, area });

/** Ordem importa: o primeiro que casar no título vence (mais específico antes). */
export const ORGAOS: Orgao[] = [
  // Polícia e inteligência
  o("pf", "Polícia Federal", "BR", "federal", [/\bpolicia federal\b/, /\bconcurso pf\b/, /\bpf\s*[:!-]/, /\bpf 20\d\d\b/], "policia"),
  o("prf", "Polícia Rodoviária Federal", "BR", "federal", [/\bpolicia rodoviaria federal\b/, /\bprf\b/], "policia"),
  o("abin", "ABIN", "BR", "federal", [/\babin\b/, /agencia brasileira de inteligencia/], "policia"),
  // TI federal
  o("serpro", "Serpro", "BR", "federal", [/\bserpro\b/], "ti"),
  o("dataprev", "Dataprev", "BR", "federal", [/\bdataprev\b/], "ti"),
  o("ati-pe", "ATI Pernambuco", "PE", "estadual", [/\bati[ -]?pe\b/, /agencia (estadual )?de tecnologia da informacao/], "ti"),
  // Federais nacionais
  o("bb", "Banco do Brasil", "BR", "federal", [/\bbanco do brasil\b/, /\bconcurso bb\b/]),
  o("caixa", "Caixa Econômica Federal", "BR", "federal", [/\bcaixa economica\b/, /\bconcurso (da )?caixa\b/]),
  o("bnb", "Banco do Nordeste", "BR", "federal", [/\bbanco do nordeste\b/, /\bbnb\b/]),
  o("bacen", "Banco Central", "BR", "federal", [/\bbacen\b/, /\bbanco central\b/]),
  o("bndes", "BNDES", "BR", "federal", [/\bbndes\b/]),
  o("cnu", "Concurso Nacional Unificado", "BR", "federal", [/\bcnu\b/, /\bcpnu\b/, /concurso (publico )?nacional unificado/]),
  o("inss", "INSS", "BR", "federal", [/\binss\b/]),
  o("receita-federal", "Receita Federal", "BR", "federal", [/\breceita federal\b/]),
  o("tcu", "TCU", "BR", "federal", [/\btcu\b/]),
  o("cgu", "CGU", "BR", "federal", [/\bcgu\b/]),
  o("ibge", "IBGE", "BR", "federal", [/\bibge\b/]),
  o("petrobras", "Petrobras", "BR", "federal", [/\bpetrobras\b/]),
  o("correios", "Correios", "BR", "federal", [/\bcorreios\b/]),
  o("anpd", "ANPD", "BR", "federal", [/\banpd\b/]),
  // Federais regionais
  o("trf5", "TRF da 5ª Região", "PE", "federal", [/\btrf ?5\b/, /trf da 5/]),
  o("ufpe", "UFPE", "PE", "federal", [/\bufpe\b/]),
  o("ufrpe", "UFRPE", "PE", "federal", [/\bufrpe\b/]),
  o("ifpe", "IFPE", "PE", "federal", [/\bifpe\b/]),
  o("if-sertao-pe", "IF Sertão-PE", "PE", "federal", [/\bif sertao/]),
  o("univasf", "Univasf", "PE", "federal", [/\bunivasf\b/]),
  o("ufpb", "UFPB", "PB", "federal", [/\bufpb\b/]),
  o("ufcg", "UFCG", "PB", "federal", [/\bufcg\b/]),
  o("ifpb", "IFPB", "PB", "federal", [/\bifpb\b/]),
  o("ufal", "UFAL", "AL", "federal", [/\bufal\b/]),
  o("ifal", "IFAL", "AL", "federal", [/\bifal\b/]),
  o("ufrn", "UFRN", "RN", "federal", [/\bufrn\b/]),
  o("ufersa", "UFERSA", "RN", "federal", [/\bufersa\b/]),
  o("ifrn", "IFRN", "RN", "federal", [/\bifrn\b/]),
  o("ufba", "UFBA", "BA", "federal", [/\bufba\b/]),
  o("ifba", "IFBA", "BA", "federal", [/\bifba\b/]),
  // Estaduais de PE com nome próprio
  o("alepe", "Assembleia Legislativa de PE", "PE", "estadual", [/\balepe\b/]),
  o("compesa", "Compesa", "PE", "estadual", [/\bcompesa\b/]),
  o("upe", "UPE", "PE", "estadual", [/\bupe\b/, /universidade de pernambuco/]),
  o("cpu-pe", "Concurso Unificado de Pernambuco", "PE", "estadual", [/\bcpu[ -]?pe\b/, /concurso (publico )?unificado de pernambuco/]),
  o("al-pb", "Assembleia Legislativa da PB", "PB", "estadual", [/\balpb\b/]),
  o("alrn", "Assembleia Legislativa do RN", "RN", "estadual", [/\balrn\b/]),
  o("alba", "Assembleia Legislativa da BA", "BA", "estadual", [/\balba\b/]),
  o("ale-al", "Assembleia Legislativa de AL", "AL", "estadual", [/\bale[ -]?al\b/]),
];

/**
 * Siglas que vêm acompanhadas da UF ("TJ PE", "Sefaz - AL", "TRT PE"). A chave fica "tj-pe".
 * "pc"/"policia civil" = polícia que interessa; "pm", "cbm" e "policia penal" ficam de fora.
 */
export const SIGLAS_COM_UF: { sigla: RegExp; chave: string; nome: string; esfera: Orgao["esfera"]; area?: AreaOrgao }[] = [
  { sigla: /tj/, chave: "tj", nome: "Tribunal de Justiça", esfera: "estadual" },
  { sigla: /trt/, chave: "trt", nome: "TRT", esfera: "federal" },
  { sigla: /tre/, chave: "tre", nome: "TRE", esfera: "federal" },
  { sigla: /tce/, chave: "tce", nome: "Tribunal de Contas do Estado", esfera: "estadual" },
  { sigla: /tcm/, chave: "tcm", nome: "Tribunal de Contas dos Municípios", esfera: "estadual" },
  { sigla: /mpe?/, chave: "mp", nome: "Ministério Público", esfera: "estadual" },
  { sigla: /mpf/, chave: "mpf", nome: "MPF", esfera: "federal" },
  { sigla: /sefaz/, chave: "sefaz", nome: "Sefaz", esfera: "estadual" },
  { sigla: /detran/, chave: "detran", nome: "Detran", esfera: "estadual" },
  { sigla: /pge/, chave: "pge", nome: "PGE", esfera: "estadual" },
  { sigla: /dpe/, chave: "dpe", nome: "Defensoria Pública", esfera: "estadual" },
  { sigla: /seplag/, chave: "seplag", nome: "Seplag", esfera: "estadual" },
  { sigla: /ses/, chave: "ses", nome: "Secretaria de Saúde", esfera: "estadual" },
  { sigla: /pc|pol[ií]cia civil( d[aoe])?/, chave: "pc", nome: "Polícia Civil", esfera: "estadual", area: "policia" },
  { sigla: /pm|pol[ií]cia militar( d[aoe])?/, chave: "pm", nome: "Polícia Militar", esfera: "estadual", area: "fora" },
  { sigla: /cbm|bombeiros?( militar)?( d[aoe])?/, chave: "cbm", nome: "Corpo de Bombeiros", esfera: "estadual", area: "fora" },
  { sigla: /pol[ií]cia penal( d[aoe])?|pp/, chave: "pp", nome: "Polícia Penal", esfera: "estadual", area: "fora" },
];

/** Bancas conhecidas, para reconhecer "banca definida: X". */
export const BANCAS: { nome: string; padrao: RegExp }[] = [
  { nome: "Cebraspe", padrao: /\bcebraspe\b|\bcespe\b/ },
  { nome: "FGV", padrao: /\bfgv\b|fundacao getulio vargas/ },
  { nome: "FCC", padrao: /\bfcc\b|fundacao carlos chagas/ },
  { nome: "Cesgranrio", padrao: /\bcesgranrio\b/ },
  { nome: "Vunesp", padrao: /\bvunesp\b/ },
  { nome: "IBFC", padrao: /\bibfc\b/ },
  { nome: "Idecan", padrao: /\bidecan\b/ },
  { nome: "Instituto AOCP", padrao: /\baocp\b/ },
  { nome: "Fundatec", padrao: /\bfundatec\b/ },
  { nome: "IADES", padrao: /\biades\b/ },
  { nome: "Consulplan", padrao: /\bconsulplan\b/ },
  { nome: "Quadrix", padrao: /\bquadrix\b/ },
  { nome: "Upenet/IAUPE", padrao: /\bupenet\b|\biaupe\b/ },
  { nome: "IBADE", padrao: /\bibade\b/ },
  { nome: "Consulpam", padrao: /\bconsulpam\b/ },
  { nome: "Igeduc", padrao: /\bigeduc\b/ },
  { nome: "Comperve", padrao: /\bcomperve\b/ },
  { nome: "CPCON", padrao: /\bcpcon\b/ },
  { nome: "Copeve/UFAL", padrao: /\bcopeve\b/ },
  { nome: "Selecon", padrao: /\bselecon\b/ },
  { nome: "Fundep", padrao: /\bfundep\b/ },
  { nome: "Avança SP", padrao: /\bavanca sp\b/ },
  { nome: "Instituto Access", padrao: /\binstituto access\b/ },
  { nome: "Objetiva", padrao: /\bobjetiva concursos\b/ },
];

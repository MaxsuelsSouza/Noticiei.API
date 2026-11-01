/**
 * O que cada concurso é, para o app filtrar (desde a coleta de todas as áreas, migração 024): áreas, salário geral,
 * escolaridade. Funções puras, só regras e dicionários (sem IA). A visibilidade antiga (perfil TI/polícia,
 * R$ 6 mil+) continua em avaliar.ts para o APK antigo; o app novo decide sozinho o que mostrar.
 */
import { acessoDe, type Acesso, type Agregado } from "./avaliar.js";
import { normalizar } from "./extract.js";

export const AREAS = [
  "ti", "pericia", "policia", "seguranca", "fiscal", "juridica", "saude", "educacao", "administrativa", "outras",
] as const;
export type AreaGeral = (typeof AREAS)[number];

/** Pelo nome do órgão (normalizado). Um órgão pode ter mais de uma (TRT: jurídica; com cargo de TI, também TI). */
const POR_ORGAO: [AreaGeral, RegExp][] = [
  ["seguranca", /\b(policia militar|pm[a-z]{2}|bombeiros?|cbm[a-z]{2}|guarda (civil |municipal)|guardas civis|policia penal|sistema prisional|seap|sejus|socioeducativ)/],
  ["policia", /\b(policia (federal|civil|rodoviaria federal|cientifica)|pf|prf|pc[a-z]{2}|abin|depen|delegado)\b/],
  ["juridica", /\b(tribunal (de justica|regional|superior)|tj[a-z]{0,3}|trt\s?\d*|trf\s?\d*|tre(?:-|\s)?[a-z]{2}|tst|stj|stf|stm|tjm[a-z]{0,2}|ministerio publico|mp[a-z]{0,3}|defensoria|dpe|dpu|procuradoria|pge|pgm|pgfn|agu|cartorio|justica)\b/],
  ["fiscal", /\b(sefaz|sefin|secretaria (da |de )?fazenda|receita (federal|estadual|municipal)|fisco|tribunal de contas|tce[a-z]{0,2}|tcm[a-z]{0,2}|tcu|cgu|cge|controladoria|auditor)/],
  ["saude", /\b(saude|hospital|hospitalar|ebserh|ses[a-z]{0,2}|sms|fhemig|hemo[a-z]*|samu|upa|sus)\b/],
  ["educacao", /\b(educacao|seduc|seed|universidade|instituto federal|if[a-z]{2,6}|uf[a-z]{1,4}|uniao das escolas|escola|colegio)\b/],
  ["administrativa", /\b(prefeitura|camara|assembleia|detran|inss|ibge|correios|banco|caixa economica|bnb|serpro|dataprev|conselho regional|cr[a-z]{2,3}|secretaria de administracao)\b/],
];

/** Formações específicas que a extração já acha nos títulos (extract.ts, NICHO) e a área que elas indicam. */
const POR_NICHO: Record<string, AreaGeral> = {
  medicina: "saude", "enfermagem (superior)": "saude", odontologia: "saude", "farmácia": "saude", fisioterapia: "saude",
  psicologia: "saude", "nutrição": "saude", "veterinária": "saude", Direito: "juridica", contabilidade: "fiscal", licenciatura: "educacao",
};

export interface BaseAreas {
  orgaoNome: string;
  /** concursos.orgao_area (dicionário de órgãos): "fora" = PM, bombeiro, polícia penal, guarda. */
  orgaoArea: string | null;
  /** concursos.area (avaliar.ts): ti | policia_ti | policia | null. */
  area: string | null;
}

export function areasDe(base: BaseAreas, ag: Pick<Agregado, "temTi" | "policiaTi" | "policiaGeral" | "nicho">): AreaGeral[] {
  const areas = new Set<AreaGeral>();
  if (base.area === "policia_ti" || ag.policiaTi) areas.add("pericia");
  if (base.area === "ti" || base.orgaoArea === "ti" || ag.temTi) areas.add("ti");
  if (base.area === "policia" || base.orgaoArea === "policia" || ag.policiaGeral) areas.add("policia");
  if (base.orgaoArea === "fora") areas.add("seguranca");
  const nome = normalizar(base.orgaoNome);
  for (const [area, regra] of POR_ORGAO) if (regra.test(nome)) areas.add(area);
  for (const n of ag.nicho ?? []) {
    const area = POR_NICHO[n];
    if (area) areas.add(area);
  }
  // Segurança (PM, bombeiro) não é a "polícia/inteligência" do perfil: o dicionário do órgão manda.
  if (areas.has("seguranca") && base.orgaoArea === "fora") areas.delete("policia");
  return areas.size ? AREAS.filter((a) => areas.has(a)) : ["outras"];
}

export interface SalarioGeral {
  /** Maior salário inicial citado no concurso (qualquer cargo). */
  inicialCentavos: number | null;
  /** Maior salário de fim de carreira / após formação citado. */
  finalCentavos: number | null;
  /** Maior inicial entre os cargos que dá para fazer sem formação específica (null = não separou). */
  inicialAcessivelCentavos: number | null;
}

const maior = (v: number[]) => (v.length ? Math.max(...v) : null);

export function salarioGeral(ag: Pick<Agregado, "salarios">): SalarioGeral {
  const s = ag.salarios ?? [];
  return {
    inicialCentavos: maior(s.filter((x) => !x.final).map((x) => x.centavos)),
    finalCentavos: maior(s.filter((x) => x.final).map((x) => x.centavos)),
    inicialAcessivelCentavos: maior(s.filter((x) => !x.final && x.acessivel).map((x) => x.centavos)),
  };
}

export interface Atributos {
  areas: AreaGeral[];
  salarioGeral: SalarioGeral;
  /** Por onde se entra: tecnologo | qualquer_superior | tecnico | medio | null (não identificado). */
  acesso: Acesso | null;
  exigeBacharelado: boolean;
  /** Formações específicas citadas (médico, juiz…). */
  nicho: string[];
  cidadesProva: string[];
  provaNasCapitais: boolean;
  isencaoAte: string | null;
  taxaCentavos: number | null;
  temProgramatico: boolean;
  temAnterior: boolean;
  /** Nome do primeiro cargo conhecido (do PDF), para o cartão. */
  cargo: string | null;
  /** Nomes de todos os cargos do PDF (busca por texto no app). */
  cargos: string[];
}

export function atributos(base: BaseAreas, r: Partial<Agregado>): Atributos {
  const ag = r as Agregado;
  const cargos = (ag.cargos?.length ? ag.cargos : ag.cargosTi ?? []).map((c) => c.nome);
  return {
    areas: areasDe(base, { temTi: ag.temTi ?? false, policiaTi: ag.policiaTi ?? false, policiaGeral: ag.policiaGeral ?? false, nicho: ag.nicho ?? [] }),
    salarioGeral: salarioGeral({ salarios: ag.salarios ?? [] }),
    acesso: ag.temTi === undefined ? null : acessoDe({ ...ag, nivelTecnico: ag.nivelTecnico ?? false, qualquerSuperior: ag.qualquerSuperior ?? false }),
    exigeBacharelado: ag.exigeBacharelado ?? false,
    nicho: ag.nicho ?? [],
    cidadesProva: ag.cidadesProva ?? [],
    provaNasCapitais: ag.provaNasCapitais ?? false,
    isencaoAte: ag.isencaoAte ?? null,
    taxaCentavos: ag.taxaCentavos ?? null,
    temProgramatico: (ag.programatico?.length ?? 0) > 0,
    temAnterior: Boolean(ag.editalAnterior),
    cargo: (ag.cargosTi?.[0] ?? ag.cargos?.[0])?.nome ?? null,
    cargos: cargos.slice(0, 30),
  };
}

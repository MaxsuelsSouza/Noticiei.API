/**
 * Junta o que várias matérias disseram sobre um concurso (agregar), decide se ele aparece e com que peso
 * (avaliar) e o que mudou desde a última vez (eventos). Funções puras.
 */
import { FASES, ordemFase, type Duracao, type Extracao, type Fase, type Salario } from "./extract.js";
import type { CargoEdital, EditalExtraido, Programatico } from "./pdf.js";
import { CIDADES_PERTO, PESO_NACIONAL, PESO_OUTRA_UF, PESO_UF, PESO_UF_DESCONHECIDA } from "./orgaos.js";

/** Abaixo disso o concurso nem aparece. */
export const SALARIO_MINIMO_CENTAVOS = 600_000;

export interface Agregado {
  fase: Fase;
  banca: string | null;
  vagas: number | null;
  cadastroReserva: boolean;
  regime: Extracao["regime"];
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
  nivelMedio: boolean;
  etapas: string[];
  restricoes: string[];
  cidadesProva: string[];
  provaNasCapitais: boolean;
  editais: string[];
  /** Do PDF do edital (vazio enquanto não foi lido). */
  cargosTi: CargoEdital[];
  programatico: Programatico[];
  /** Do edital anterior, para estudar antes de sair o novo. */
  editalAnterior: string | null;
  programaticoAnterior: Programatico[];
}

export interface FonteExtraida {
  publicadoEm: string | null;
  extracao: Extracao | EditalExtraido;
  /** "noticia" (padrão), "edital" (PDF atual ou retificação) ou "anterior" (só referência: não mexe em datas nem fase). */
  tipo?: "noticia" | "edital" | "anterior";
  url?: string;
}

const doEdital = (e: Extracao | EditalExtraido): e is EditalExtraido => "programatico" in e;

const uniao = (listas: string[][]) => [...new Set(listas.flat())];

/** O mais recente que disse alguma coisa vence (retificação muda prazo, banca etc.). */
function ultimo<T>(fontes: FonteExtraida[], campo: (e: Extracao) => T | null): T | null {
  for (let i = fontes.length - 1; i >= 0; i--) {
    const valor = campo(fontes[i]!.extracao);
    if (valor !== null && valor !== undefined) return valor;
  }
  return null;
}

export function agregar(entrada: FonteExtraida[]): Agregado {
  const ordenadas = [...entrada].sort((a, b) => (a.publicadoEm ?? "").localeCompare(b.publicadoEm ?? ""));
  const fontes = ordenadas.filter((f) => f.tipo !== "anterior");
  const anteriores = ordenadas.filter((f) => f.tipo === "anterior");
  const es = fontes.map((f) => f.extracao);
  const pdfs = es.filter(doEdital);
  const comProgramatico = (lista: FonteExtraida[]) =>
    [...lista].reverse().map((f) => f.extracao).find((e): e is EditalExtraido => doEdital(e) && e.programatico.length > 0);
  const anterior = [...anteriores].reverse().find((f) => doEdital(f.extracao)) ?? anteriores.at(-1);
  const algum = (campo: (e: Extracao) => boolean) => es.some(campo);
  // O requisito do edital (PDF) vale mais que o que a notícia disse.
  const comCargos = pdfs.filter((e) => e.cargosTi.length);
  const baseRequisito = comCargos.length ? comCargos : es;
  const aceita = baseRequisito.some((e) => e.aceitaTecnologo === true) ? true : baseRequisito.some((e) => e.aceitaTecnologo === false) ? false : null;
  return {
    // Um concurso não volta de fase: matéria velha de rumor não desfaz o edital.
    fase: es.reduce<Fase>((maior, e) => (ordemFase(e.fase) > ordemFase(maior) ? e.fase : maior), "rumor"),
    banca: ultimo(fontes, (e) => e.banca),
    vagas: ultimo(fontes, (e) => e.vagas),
    cadastroReserva: algum((e) => e.cadastroReserva),
    regime: algum((e) => e.regime === "clt") ? "clt" : ultimo(fontes, (e) => e.regime),
    duracao: ultimo(fontes, (e) => e.duracao ?? null),
    taxaCentavos: ultimo(fontes, (e) => e.taxaCentavos),
    inscricoesAte: ultimo(fontes, (e) => e.inscricoesAte),
    isencaoAte: ultimo(fontes, (e) => e.isencaoAte),
    provaEm: ultimo(fontes, (e) => e.provaEm),
    salarios: comCargos.some((e) => e.salarios.length) ? comCargos.flatMap((e) => e.salarios) : es.flatMap((e) => e.salarios),
    temTi: algum((e) => e.temTi),
    policiaTi: algum((e) => e.policiaTi),
    policiaGeral: algum((e) => e.policiaGeral),
    aceitaTecnologo: aceita,
    exigeBacharelado: aceita !== true && baseRequisito.some((e) => e.exigeBacharelado),
    nivelMedio: algum((e) => e.nivelMedio),
    etapas: uniao(es.map((e) => e.etapas)),
    restricoes: uniao(es.map((e) => e.restricoes)),
    cidadesProva: uniao(es.map((e) => e.cidadesProva)),
    provaNasCapitais: algum((e) => e.provaNasCapitais),
    editais: uniao(es.map((e) => e.editais)),
    cargosTi: [...pdfs].reverse().find((e) => e.cargosTi.length)?.cargosTi ?? [],
    programatico: comProgramatico(fontes)?.programatico ?? [],
    editalAnterior: anterior?.url ?? null,
    programaticoAnterior: comProgramatico(anteriores)?.programatico ?? [],
  };
}

export type Area = "ti" | "policia_ti" | "policia";
export type SituacaoSalario = "ok" | "so_final" | "desconhecido";

export interface Avaliacao {
  /** Aparece no seu perfil (TI e polícia/inteligência): Editais, Inscrições abertas, Favoritos, widget, avisos. */
  visivel: boolean;
  /** Aparece em Todos e Rumores: qualquer área que pague R$ 6 mil ou mais (o do perfil também entra). */
  visivelGeral: boolean;
  pesoGeral: number;
  /** Por que não aparece (para diagnóstico). */
  motivo: string | null;
  area: Area | null;
  salarioInicialCentavos: number | null;
  salarioFinalCentavos: number | null;
  situacaoSalario: SituacaoSalario | null;
  peso: number;
}

export interface OrgaoBase {
  uf: string | null;
  area?: "ti" | "policia" | "fora";
}

const PESO_FASE: Record<Fase, number> = {
  rumor: 0.3, autorizado: 0.45, comissao: 0.5, banca: 0.6, edital: 0.85, inscricoes: 1, andamento: 0.2, encerrado: 0.1,
};
const PESO_AREA: Record<Area, number> = { ti: 1, policia_ti: 1, policia: 0.6 };

const maior = (valores: number[]) => (valores.length ? Math.max(...valores) : null);

/** Peso da região: onde é a prova manda mais que o estado do órgão (prova em Recife = perto). */
export function pesoRegiao(orgao: OrgaoBase, ag: Pick<Agregado, "cidadesProva" | "provaNasCapitais">): number {
  if (ag.provaNasCapitais) return 1;
  const ufsProva = ag.cidadesProva.map((c) => CIDADES_PERTO[c]).filter((u): u is string => Boolean(u));
  const daProva = maior(ufsProva.map((u) => PESO_UF[u] ?? 0));
  const doOrgao = orgao.uf ? PESO_UF[orgao.uf] ?? (orgao.uf === "BR" ? PESO_NACIONAL : PESO_OUTRA_UF) : PESO_UF_DESCONHECIDA;
  return Math.max(daProva ?? 0, doOrgao);
}

/** Concurso fora do perfil entra em Todos/Rumores pesando menos que os de TI e polícia. */
const PESO_AREA_OUTRA = 0.3;

export function avaliar(orgao: OrgaoBase, ag: Agregado): Avaliacao {
  const perfil = avaliarPerfil(orgao, ag);
  if (perfil.visivel) return { ...perfil, visivelGeral: true, pesoGeral: perfil.peso };
  // Fora do perfil: entra em Todos/Rumores se pagar 6 mil ou mais (salário conhecido), de qualquer área.
  // PM, bombeiro, polícia penal e guarda continuam fora.
  if (orgao.area === "fora") return { ...perfil, visivelGeral: false, pesoGeral: 0 };
  const inicial = maior(ag.salarios.filter((s) => !s.final).map((s) => s.centavos));
  const final = maior(ag.salarios.filter((s) => s.final).map((s) => s.centavos));
  const situacao: SituacaoSalario | null = inicial !== null && inicial >= SALARIO_MINIMO_CENTAVOS ? "ok"
    : final !== null && final >= SALARIO_MINIMO_CENTAVOS ? "so_final" : null;
  if (!situacao) return { ...perfil, visivelGeral: false, pesoGeral: 0 };
  const base = pesoRegiao(orgao, ag) * 0.5 + PESO_FASE[ag.fase] * 0.3 + PESO_AREA_OUTRA * 0.2;
  const fator = (situacao === "so_final" ? 0.5 : 1) * (ag.regime === "temporario" ? 0.6 : 1);
  return {
    ...perfil,
    // Sem o salário do cargo de TI, o cartão mostra o salário do concurso.
    salarioInicialCentavos: perfil.salarioInicialCentavos ?? inicial,
    salarioFinalCentavos: perfil.salarioFinalCentavos ?? final,
    situacaoSalario: perfil.situacaoSalario ?? situacao,
    visivelGeral: true,
    pesoGeral: Math.round(base * fator * 1000) / 1000,
  };
}

type AvaliacaoPerfil = Omit<Avaliacao, "visivelGeral" | "pesoGeral">;

function avaliarPerfil(orgao: OrgaoBase, ag: Agregado): AvaliacaoPerfil {
  const oculto = (motivo: string, area: Area | null = null): AvaliacaoPerfil => ({
    visivel: false, motivo, area, salarioInicialCentavos: null, salarioFinalCentavos: null, situacaoSalario: null, peso: 0,
  });
  if (orgao.area === "fora") return oculto("fora do perfil (PM, bombeiro, polícia penal, guarda)");

  const area: Area | null = ag.policiaTi ? "policia_ti"
    : orgao.area === "ti" || ag.temTi ? "ti"
    : orgao.area === "policia" || ag.policiaGeral ? "policia"
    : null;
  if (!area) return oculto("sem cargo de TI ou de polícia/inteligência");
  if (area !== "policia" && ag.exigeBacharelado) return oculto("exige bacharelado (não aceita tecnólogo)", area);

  // Cargo de TI: vale o salário citado perto do cargo. Polícia: o salário do concurso.
  const relevantes = area === "policia" ? ag.salarios : ag.salarios.filter((s) => s.ti);
  const inicial = maior(relevantes.filter((s) => !s.final).map((s) => s.centavos));
  const final = maior(relevantes.filter((s) => s.final).map((s) => s.centavos));
  let situacao: SituacaoSalario;
  if (inicial !== null && inicial >= SALARIO_MINIMO_CENTAVOS) situacao = "ok";
  else if (final !== null && final >= SALARIO_MINIMO_CENTAVOS) situacao = "so_final";
  else if (inicial !== null || final !== null) return oculto("salário abaixo de R$ 6 mil", area);
  else {
    // Sem salário do cargo: se nem o maior salário do concurso chega a 6 mil, o de TI também não chega.
    const teto = maior(ag.salarios.map((s) => s.centavos));
    if (teto !== null && teto < SALARIO_MINIMO_CENTAVOS) return oculto("maior salário do concurso abaixo de R$ 6 mil", area);
    situacao = "desconhecido";
  }

  const fatorSalario = situacao === "so_final" ? 0.5 : situacao === "desconhecido" ? 0.9 : 1;
  const fatorRegime = ag.regime === "temporario" ? 0.6 : 1;
  const base = pesoRegiao(orgao, ag) * 0.5 + PESO_FASE[ag.fase] * 0.3 + PESO_AREA[area] * 0.2;
  return {
    visivel: true,
    motivo: null,
    area,
    salarioInicialCentavos: inicial,
    salarioFinalCentavos: final,
    situacaoSalario: situacao,
    peso: Math.round(base * fatorSalario * fatorRegime * 1000) / 1000,
  };
}

// ───────────────────────── eventos ─────────────────────────

export const NOME_FASE: Record<Fase, string> = {
  rumor: "rumor", autorizado: "autorizado", comissao: "comissão formada", banca: "banca definida",
  edital: "edital publicado", inscricoes: "inscrições abertas", andamento: "em andamento (provas/resultados)", encerrado: "encerrado",
};

export interface Evento {
  tipo: "novo" | "fase" | "banca" | "inscricoes" | "prova" | "edital" | "lembrete" | "diario" | "anterior";
  descricao: string;
}

const dataBr = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

export function eventos(antes: Agregado | null, depois: Agregado): Evento[] {
  if (!antes) return [{ tipo: "novo", descricao: `Novo concurso (${NOME_FASE[depois.fase]})` }];
  const lista: Evento[] = [];
  if (ordemFase(depois.fase) > ordemFase(antes.fase)) lista.push({ tipo: "fase", descricao: `Agora: ${NOME_FASE[depois.fase]}` });
  if (depois.banca && depois.banca !== antes.banca) lista.push({ tipo: "banca", descricao: `Banca: ${depois.banca}` });
  if (depois.inscricoesAte && depois.inscricoesAte !== antes.inscricoesAte) {
    lista.push({ tipo: "inscricoes", descricao: antes.inscricoesAte ? `Prazo de inscrição mudou para ${dataBr(depois.inscricoesAte)}` : `Inscrições até ${dataBr(depois.inscricoesAte)}` });
  }
  if (depois.provaEm && depois.provaEm !== antes.provaEm) lista.push({ tipo: "prova", descricao: `Prova em ${dataBr(depois.provaEm)}` });
  const novosEditais = depois.editais.filter((e) => !antes.editais.includes(e));
  if (!antes.programatico?.length && depois.programatico.length) {
    lista.push({ tipo: "edital", descricao: `Conteúdo programático lido: ${depois.programatico.reduce((t, g) => t + g.materias.length, 0)} matérias` });
  }
  if (!antes.editalAnterior && depois.editalAnterior) lista.push({ tipo: "anterior", descricao: "Edital anterior encontrado" });
  if (novosEditais.length) lista.push({ tipo: "edital", descricao: novosEditais.length === 1 ? "Edital (PDF) disponível" : `${novosEditais.length} documentos do edital disponíveis` });
  return lista;
}

export { FASES };

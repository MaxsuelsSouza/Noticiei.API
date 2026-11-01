/**
 * Nome legível para o produto criado a partir da linha da nota: "COXA FGO SADIA" → "Coxa frango Sadia".
 * É só um ponto de partida; o nome pode ser trocado no app (PATCH /produtos/{id}).
 */
const TROCAS: [RegExp, string][] = [
  [/\bRF\.?\s*LING\.?\s*(T\.?\s*)?CALAB\.?\s*/g, "LINGUIÇA CALABRESA "],
  [/\bESC\.?\s*DENTAL\b/g, "ESCOVA DENTAL"],
  [/\bCR\.?\s*DENTAL\b/g, "CREME DENTAL"],
  [/\bAP\.?\s*BARB\.?\s*/g, "APARELHO DE BARBEAR "],
  [/\bDET\.?\s*PO\b/g, "SABÃO EM PÓ"],
  [/\bDET\.?\s*LIQ\.?\s*/g, "DETERGENTE "],
  [/\bBEB\.?\s*LAC\.?\s*/g, "BEBIDA LÁCTEA "],
  [/\bSAC\.?\s*INST\.?\s*/g, "SACOLA "],
  [/\bLEITE PO\b/g, "LEITE EM PÓ"],
  [/\bACHOC\.?\s*PO\b/g, "ACHOCOLATADO EM PÓ"],
  [/\bBOV\.\s*/g, "BOVINO "],
  [/\bFGO\b/g, "FRANGO"],
  [/\bMAC\.\s*/g, "MACARRÃO "],
  [/\bSAB\.\s*/g, "SABONETE "],
  [/\bDES\.\s*/g, "DESODORANTE "],
  [/\bABS\.\s*/g, "ABSORVENTE "],
  [/\bACHOC\.\s*/g, "ACHOCOLATADO "],
  [/\bBISC\.\s*/g, "BISCOITO "],
  [/\bMAION\.\s*/g, "MAIONESE "],
  [/\bMARG\.\s*/g, "MARGARINA "],
  [/\bMUSS\.\s*/g, "MUÇARELA "],
  [/\bMORTAD\.\s*/g, "MORTADELA "],
  [/\bSARD\.\s*/g, "SARDINHA "],
  [/\bIOG\b/g, "IOGURTE"],
  [/\bJERKEED\b/g, "CHARQUE"],
  [/\bHF\.\s*/g, ""],
  [/\bHIG\.\s*/g, "HIGIÊNICO "],
  [/\bCOND\.\s*/g, "CONDICIONADOR "],
  [/\bTEMP\.\s*/g, "TEMPERO "],
  [/\bPARB\.\s*/g, "PARBOILIZADO "],
  [/\bTRAD\b\.?/g, "TRADICIONAL"],
  [/\bINTEG\.?(?=\s|$)/g, "INTEGRAL"],
];

/** Acentos das palavras mais comuns de mercado (a nota vem sem acento). */
const ACENTOS: Record<string, string> = {
  FEIJAO: "feijão", MACARRAO: "macarrão", CAFE: "café", MAMAO: "mamão", SABAO: "sabão", ACUCAR: "açúcar", PAO: "pão",
  LIMAO: "limão", MACA: "maçã", AGUA: "água", OLEO: "óleo", FIGADO: "fígado", SUINA: "suína", SUINO: "suíno",
  TILAPIA: "tilápia", MELAO: "melão", PE: "pé", LACTEA: "láctea", PO: "pó", CHAMPIGNON: "champignon",
  MUCARELA: "muçarela", HIGIENICO: "higiênico", LINGUICA: "linguiça", ATACADAO: "Atacadão",
};

export function nomeLegivel(descricao: string): string {
  let t = ` ${descricao.toUpperCase()} `;
  for (const [re, troca] of TROCAS) t = t.replace(re, troca);
  const palavras = t.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const nome = palavras
    .map((p, i) => {
      const limpa = p.replace(/[.]+$/, "");
      const acento = ACENTOS[limpa];
      if (acento) return i === 0 ? acento[0]!.toUpperCase() + acento.slice(1) : acento;
      const minuscula = limpa.toLowerCase();
      return i === 0 ? minuscula.charAt(0).toUpperCase() + minuscula.slice(1) : minuscula;
    })
    .join(" ");
  return nome.slice(0, 120) || descricao.slice(0, 120);
}

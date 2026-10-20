import { franc } from "franc-min";

const ISO3_TO_TAG: Record<string, string> = { eng: "en", por: "pt", spa: "es" };

/**
 * Detecção por estatística de trigramas de caracteres (franc). Texto curto demais
 * para decidir cai no idioma padrão da fonte.
 */
export function detectLanguage(text: string, fallback: string): string {
  const code = franc(text, { only: Object.keys(ISO3_TO_TAG), minLength: 40 });
  return ISO3_TO_TAG[code] ?? fallback;
}

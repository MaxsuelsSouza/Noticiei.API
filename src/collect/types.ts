/** Na ordem em que aparecem no resumo. */
export const CATEGORIES = ["tecnologia", "hackernews", "curiosidades", "mundo", "acompanhar", "aleatorio"] as const;
export type Category = (typeof CATEGORIES)[number];
/** "popular": os artigos mais pontuados de um blog no Hacker News (endereço = domínio e caminho do blog). */
export type SourceType = "rss" | "reddit" | "devto" | "hackernews" | "popular";

export interface Source {
  id: number;
  name: string;
  type: SourceType;
  address: string;
  default_category: Category;
  language: string;
  is_official: boolean;
  /** Itens desta fonte nunca mudam de categoria, mesmo com assunto forte de outra (ex.: notícia de IA no MIT Tech Review fica em mundo). */
  lock_category: boolean;
  /** Blog da seção "Para acompanhar": o feed e a lista de populares do mesmo blog têm a mesma chave. */
  follow_key?: string | null;
}

/** Item como veio da fonte, antes da curadoria. */
export interface RawItem {
  url: string;
  title: string;
  summary: string;
  publishedAt: Date | null;
  engagement: number;
  tags: string[];
}

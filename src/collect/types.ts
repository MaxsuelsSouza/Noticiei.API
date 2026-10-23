export type Category = "tecnologia" | "curiosidades" | "mundo" | "aleatorio";
export type SourceType = "rss" | "reddit" | "devto" | "hackernews";

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

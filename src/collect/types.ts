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

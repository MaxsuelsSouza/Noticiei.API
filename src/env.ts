function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ${name} não configurada`);
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get appApiKey() {
    return required("APP_API_KEY");
  },
  get cronSecret() {
    return required("CRON_SECRET");
  },
  /** Login de aluno no site da academia. */
  get borracha() {
    return { email: required("BORRACHA_EMAIL"), password: required("BORRACHA_PASSWORD") };
  },
  /** Segunda conta (opcional): faz o check-in logo depois da principal, na mesma aula. */
  get borracha2() {
    const email = process.env.BORRACHA_EMAIL_2;
    const password = process.env.BORRACHA_PASSWORD_2;
    return email && password ? { email, password } : null;
  },
  /** Unidade em que o aluno treina; aulas de outra unidade não são pedidas automaticamente. */
  get borrachaUnidade() {
    return process.env.BORRACHA_UNIDADE || "Espinheiro";
  },
  /** Chave própria do LivreQ (computador), aceita só nas rotas /api/livros/*. Opcional: sem ela, vale a do app. */
  get livreqApiKey() {
    return process.env.LIVREQ_API_KEY || null;
  },
  /** Adaptações: chave do TMDB (v3 ou token de leitura v4). Sem ela a rotina das adaptações não roda. */
  get tmdbApiKey() {
    return process.env.TMDB_API_KEY || null;
  },
  /** Adaptações (opcional): chave da API de livros do NYT, para as semanas na lista de mais vendidos. */
  get nytApiKey() {
    return process.env.NYT_API_KEY || null;
  },
  get reddit() {
    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  },
};

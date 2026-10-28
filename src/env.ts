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
  get reddit() {
    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  },
};

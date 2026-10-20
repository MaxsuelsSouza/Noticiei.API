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
  get reddit() {
    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  },
};

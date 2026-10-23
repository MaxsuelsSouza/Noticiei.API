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
  /** Chave própria do check-in: separada da APP_API_KEY para que um vazamento de uma não libere a outra. */
  get checkinApiKey() {
    return required("CHECKIN_API_KEY");
  },
  get borracha() {
    return { email: required("BORRACHA_EMAIL"), password: required("BORRACHA_PASSWORD") };
  },
  get reddit() {
    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  },
};

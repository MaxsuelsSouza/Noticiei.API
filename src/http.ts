import { timingSafeEqual } from "node:crypto";
import { env } from "./env.js";

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** O app manda a chave no header x-api-key. */
export function isApp(request: Request): boolean {
  return safeEqual(request.headers.get("x-api-key") ?? "", env.appApiKey);
}

/** Rotas de Livros: o app (APP_API_KEY) ou o LivreQ no computador (LIVREQ_API_KEY, se configurada). */
export function isAppOuLivreq(request: Request): boolean {
  if (isApp(request)) return true;
  const chave = env.livreqApiKey;
  return chave !== null && safeEqual(request.headers.get("x-api-key") ?? "", chave);
}

/** A Vercel manda "Authorization: Bearer <CRON_SECRET>" nas chamadas de cron. */
export function isCron(request: Request): boolean {
  return safeEqual(request.headers.get("authorization") ?? "", `Bearer ${env.cronSecret}`);
}

export const unauthorized = () => json({ error: "não autorizado" }, 401);

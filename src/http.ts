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

/** O listener de check-in do app manda a chave própria no header x-checkin-key. */
export function isCheckinClient(request: Request): boolean {
  return safeEqual(request.headers.get("x-checkin-key") ?? "", env.checkinApiKey);
}

/** A Vercel manda "Authorization: Bearer <CRON_SECRET>" nas chamadas de cron. */
export function isCron(request: Request): boolean {
  return safeEqual(request.headers.get("authorization") ?? "", `Bearer ${env.cronSecret}`);
}

export const unauthorized = () => json({ error: "não autorizado" }, 401);

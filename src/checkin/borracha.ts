/**
 * Cliente do site da academia (professorborracha.com.br / "Agenda Borracha").
 *
 * O site é um Next.js com Supabase: o login é e-mail/senha no Supabase Auth e a sessão vai em cookie no formato do
 * @supabase/ssr. As aulas do dia vêm de GET /api/checkin?date= e o pedido de check-in é POST /api/checkin com o mesmo
 * corpo que a tela de /presencas envia. A chave abaixo é a "publishable" do próprio front do site (não é segredo).
 */
import { env } from "../env.js";
import type { Slot } from "./rules.js";

const REF = "wzhvsjmzypdbxopgumos";
const SUPABASE_URL = `https://${REF}.supabase.co`;
const SUPABASE_KEY = "sb_publishable_eNygO8af7vZBi-8qqK3dnw_kCH_ShdR";
const SITE = "https://www.professorborracha.com.br";
const TIMEOUT_MS = 15_000;

export type Step = "login" | "aulas" | "envio";

export class SiteError extends Error {
  constructor(
    message: string,
    readonly step: Step,
    readonly httpStatus: number | null = null,
  ) {
    super(message);
  }
}

export interface CheckinInput {
  unidade: string;
  /** YYYY-MM-DD */
  date: string;
  slot: Slot;
}

export interface GymSite {
  listSlots(date: string): Promise<Slot[]>;
  /** Sem retry: repetir o envio poderia duplicar o pedido. */
  requestCheckin(input: CheckinInput): Promise<void>;
}

async function call(url: string, init: RequestInit, step: Step): Promise<{ res: Response; body: any }> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause?.code ?? (error as Error).message;
    throw new SiteError(`Falha de rede (${step}): ${cause}`, step);
  }
  return { res, body: await res.json().catch(() => null) };
}

/** Cookie de sessão no formato do @supabase/ssr: "base64-" + base64url(JSON), em pedaços de 3180 caracteres. */
export function sessionCookie(session: unknown): string {
  const raw = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const name = `sb-${REF}-auth-token`;
  const chunks = raw.match(/.{1,3180}/g)!;
  return chunks.length === 1 ? `${name}=${raw}` : chunks.map((c, i) => `${name}.${i}=${c}`).join("; ");
}

export function createBorracha(credentials: () => { email: string; password: string } = () => env.borracha): GymSite {
  let cookie: string | null = null;

  async function login(): Promise<string> {
    if (cookie) return cookie;
    const { email, password } = credentials();
    const { res, body } = await call(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      },
      "login",
    );
    if (!res.ok) {
      throw new SiteError(`Login recusado: ${body?.msg ?? body?.error_description ?? res.status}`, "login", res.status);
    }
    cookie = sessionCookie(body);
    return cookie;
  }

  const headers = (c: string) => ({ cookie: c, accept: "application/json", origin: SITE, referer: `${SITE}/presencas` });

  return {
    async listSlots(date) {
      const { res, body } = await call(`${SITE}/api/checkin?date=${encodeURIComponent(date)}`, { headers: headers(await login()) }, "aulas");
      if (!res.ok || !body?.ok) {
        throw new SiteError(body?.error ?? `Não foi possível listar as aulas (${res.status})`, "aulas", res.status);
      }
      return body.data as Slot[];
    },

    async requestCheckin({ unidade, date, slot }) {
      const { res, body } = await call(
        `${SITE}/api/checkin`,
        {
          method: "POST",
          headers: { ...headers(await login()), "content-type": "application/json" },
          body: JSON.stringify({
            unidade,
            dataAula: date,
            horarioAula: slot.horario_aula,
            aulaId: slot.aula_id,
            turmaHorarioId: slot.aula_id ? null : slot.turma_horario_id,
            sourceType: "manual",
            sourceMetadata: { origem: "presencas" },
            // A confirmação "treino com outro professor" é do aluno, no site: nunca é marcada por aqui.
            otherProfessorConfirmed: false,
            deviceHash: null,
          }),
        },
        "envio",
      );
      if (!res.ok || !body?.ok) {
        throw new SiteError(body?.error ?? `Pedido recusado (${res.status})`, "envio", res.status);
      }
    },
  };
}

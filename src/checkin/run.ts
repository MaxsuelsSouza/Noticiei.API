import { autoAllowed, localNow, pickSlot, slotLabel, type LocalNow, type Slot } from "./rules.js";
import { SiteError, type GymSite, type Step } from "./borracha.js";

export type Source = "app" | "widget" | "auto";
export type Status = "ok" | "duplicate" | "skipped" | "error";

export interface Attempt {
  source: Source;
  status: Status;
  message: string;
  /** Dia local (YYYY-MM-DD). */
  date: string;
  aula: string | null;
  unidade: string;
  step: Step | null;
  httpStatus: number | null;
}

/** O que o banco precisa oferecer (trocado por um falso nos testes). */
export interface Store {
  alreadyDone(date: string): Promise<boolean>;
  record(attempt: Attempt): Promise<void>;
}

export interface Deps {
  site: GymSite;
  store: Store;
  /** Unidade em que o aluno treina; aulas de outra unidade pedem confirmação manual no site. */
  unidade: string;
  leadMin?: number;
  now?: () => Date;
}

export interface Request {
  source: Source;
  /** Simulação: faz tudo menos enviar e gravar. */
  dryRun?: boolean;
}

export interface Result {
  status: Status;
  message: string;
  aula: string | null;
  /** Simulação (dryRun) que teria enviado. */
  simulated?: boolean;
}

/** Texto de erro do site que indica pedido repetido. */
const DUPLICATE = /duplic|j[aá] (existe|foi|solicit)|pendente/i;

const truncate = (text: string) => (text.length > 500 ? `${text.slice(0, 497)}…` : text);

/**
 * Escolhe a aula pelo horário, envia o pedido e registra a tentativa.
 * Regras: automático só ter/qui/sex 19h–21h e no máximo um sucesso por dia; aula de outra unidade é ignorada.
 */
export async function runCheckin({ source, dryRun = false }: Request, deps: Deps): Promise<Result> {
  const now: LocalNow = localNow(deps.now?.());
  const base = { source, date: now.date, unidade: deps.unidade, step: null, httpStatus: null } as const;

  const finish = async (status: Status, message: string, extra: Partial<Attempt> = {}): Promise<Result> => {
    const attempt: Attempt = { ...base, status, message: truncate(message), aula: null, ...extra };
    if (!dryRun) await deps.store.record(attempt);
    return { status, message: attempt.message, aula: attempt.aula };
  };

  try {
    if (source === "auto") {
      if (!autoAllowed(now)) return await finish("skipped", "Fora da regra automática (ter/qui/sex, 19h–21h).");
      if (!dryRun && (await deps.store.alreadyDone(now.date))) return await finish("skipped", "Já houve check-in hoje; nada a fazer.");
    }

    const slots = await deps.site.listSlots(now.date);
    const slot: Slot | null = pickSlot(slots, now.minutes, deps.leadMin);
    if (!slot) return await finish("skipped", "Nenhuma aula neste horário; nada foi enviado.");

    const aula = slotLabel(slot);
    if (slot.unidade_borracha !== deps.unidade) {
      return await finish("skipped", `A aula é de ${slot.unidade_borracha}, diferente de ${deps.unidade}. Confirme manualmente no site.`, { aula });
    }
    if (dryRun) return { ...(await finish("skipped", `Simulação: enviaria a aula ${aula}.`, { aula })), simulated: true };

    await deps.site.requestCheckin({ unidade: deps.unidade, date: now.date, slot });
    return await finish("ok", `Solicitação enviada: ${aula}.`, { aula });
  } catch (error) {
    if (error instanceof SiteError) {
      const duplicate = error.step === "envio" && DUPLICATE.test(error.message);
      return await finish(duplicate ? "duplicate" : "error", error.message, { step: error.step, httpStatus: error.httpStatus });
    }
    return await finish("error", `Erro inesperado: ${(error as Error).message}`);
  }
}

/**
 * Segunda conta: acompanha a principal. Só tenta quando a principal enviou (ou o site disse que já estava pedido);
 * senão registra que não foi, com o motivo da principal. Cada conta segue as próprias regras (ex.: um sucesso por dia).
 */
export async function runCompanion(request: Request, primary: Result, deps: Deps): Promise<Result> {
  const followed = primary.status === "ok" || primary.status === "duplicate" || primary.simulated === true;
  if (followed) return runCheckin(request, deps);

  const now = localNow(deps.now?.());
  const attempt: Attempt = {
    source: request.source,
    status: "skipped",
    message: truncate(`Acompanha a conta principal, que não enviou: ${primary.message}`),
    date: now.date,
    aula: primary.aula,
    unidade: deps.unidade,
    step: null,
    httpStatus: null,
  };
  if (!request.dryRun) await deps.store.record(attempt);
  return { status: attempt.status, message: attempt.message, aula: attempt.aula };
}

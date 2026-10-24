import assert from "node:assert/strict";
import { test } from "node:test";
import { SiteError, sessionCookie, type CheckinInput, type GymSite } from "../src/checkin/borracha.js";
import { autoAllowed, localNow, pickSlot, type Slot } from "../src/checkin/rules.js";
import { runCheckin, type Attempt, type Store } from "../src/checkin/run.js";

const slot = (inicio: string, fim: string, unidade = "Espinheiro"): Slot => ({
  horario_aula: `${inicio}:00`,
  horario_fim: `${fim}:00`,
  unidade_borracha: unidade,
  turma_horario_id: `t-${inicio}`,
  aula_id: null,
});
const slots = [slot("06:00", "07:30", "Casa Forte"), slot("17:00", "18:30"), slot("19:30", "21:00")];
const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

// ---- regras puras ----

test("pickSlot: aula em andamento e janela de 30 min antes do início", () => {
  assert.equal(pickSlot(slots, min("19:45"))?.horario_aula, "19:30:00");
  assert.equal(pickSlot(slots, min("19:00"))?.horario_aula, "19:30:00");
  assert.equal(pickSlot(slots, min("18:59")), null);
});

test("pickSlot: depois do fim, fora de horário e sem aulas não escolhe nada", () => {
  assert.equal(pickSlot(slots, min("21:01")), null);
  assert.equal(pickSlot(slots, min("14:00")), null);
  assert.equal(pickSlot([], min("19:45")), null);
});

test("pickSlot: com duas candidatas vence a de início mais próximo", () => {
  const apertado = [slot("17:00", "19:10"), slot("19:30", "21:00")];
  assert.equal(pickSlot(apertado, min("19:05"))?.horario_aula, "19:30:00");
  assert.equal(pickSlot(apertado, min("18:00"))?.horario_aula, "17:00:00");
});

test("localNow usa o fuso do usuário, não o do servidor", () => {
  // terça 2026-10-27 22:30 UTC = 19:30 em Brasília/Recife (UTC-3)
  assert.deepEqual(localNow(new Date("2026-10-27T22:30:00Z")), { date: "2026-10-27", minutes: 19 * 60 + 30, weekday: 2 });
  assert.equal(localNow(new Date("2026-10-28T01:00:00Z")).date, "2026-10-27");
});

test("autoAllowed: só ter/qui/sex entre 19h e 21h", () => {
  assert.equal(autoAllowed({ date: "", weekday: 2, minutes: min("19:45") }), true);
  assert.equal(autoAllowed({ date: "", weekday: 4, minutes: min("21:00") }), true);
  assert.equal(autoAllowed({ date: "", weekday: 5, minutes: min("19:00") }), true);
  assert.equal(autoAllowed({ date: "", weekday: 1, minutes: min("19:45") }), false);
  assert.equal(autoAllowed({ date: "", weekday: 3, minutes: min("19:45") }), false);
  assert.equal(autoAllowed({ date: "", weekday: 2, minutes: min("18:59") }), false);
  assert.equal(autoAllowed({ date: "", weekday: 2, minutes: min("21:01") }), false);
});

test("sessionCookie: formato do @supabase/ssr, em pedaços quando grande", () => {
  const small = sessionCookie({ a: 1 });
  assert.match(small, /^sb-wzhvsjmzypdbxopgumos-auth-token=base64-[A-Za-z0-9_-]+$/);
  const big = sessionCookie({ token: "x".repeat(5000) });
  assert.match(big, /^sb-wzhvsjmzypdbxopgumos-auth-token\.0=base64-.+; sb-wzhvsjmzypdbxopgumos-auth-token\.1=/);
});

// ---- runCheckin com site e banco falsos ----

function harness(opts: { slots?: Slot[]; done?: boolean; fail?: SiteError; unidade?: string } = {}) {
  const calls = { list: 0, request: [] as CheckinInput[] };
  const recorded: Attempt[] = [];
  const site: GymSite = {
    async listSlots() {
      calls.list++;
      return opts.slots ?? slots;
    },
    async requestCheckin(input) {
      calls.request.push(input);
      if (opts.fail) throw opts.fail;
    },
  };
  const store: Store = {
    async alreadyDone() {
      return opts.done ?? false;
    },
    async record(a) {
      recorded.push(a);
    },
  };
  return { calls, recorded, deps: (iso: string) => ({ site, store, unidade: opts.unidade ?? "Espinheiro", now: () => new Date(iso) }) };
}

// terça 2026-10-27, 19:45 em Brasília = 22:45 UTC
const TUE_1945 = "2026-10-27T22:45:00Z";
const SAT_1608 = "2026-10-24T19:08:00Z";

test("runCheckin: dentro da aula envia e registra ok", async () => {
  const h = harness();
  const r = await runCheckin({ source: "widget" }, h.deps(TUE_1945));
  assert.equal(r.status, "ok");
  assert.equal(r.aula, "19:30–21:00 Espinheiro");
  assert.equal(h.calls.request.length, 1);
  assert.equal(h.calls.request[0]!.slot.turma_horario_id, "t-19:30");
  assert.equal(h.recorded[0]!.status, "ok");
  assert.equal(h.recorded[0]!.date, "2026-10-27");
});

test("runCheckin: sem aula no horário não envia, mas registra o motivo", async () => {
  const h = harness();
  const r = await runCheckin({ source: "widget" }, h.deps(SAT_1608));
  assert.equal(r.status, "skipped");
  assert.equal(h.calls.request.length, 0);
  assert.equal(h.recorded.length, 1);
});

test("runCheckin: aula de outra unidade é ignorada e nunca confirma 'outro professor'", async () => {
  const h = harness({ slots: [slot("19:30", "21:00", "Boa Viagem")] });
  const r = await runCheckin({ source: "widget" }, h.deps(TUE_1945));
  assert.equal(r.status, "skipped");
  assert.match(r.message, /Boa Viagem/);
  assert.equal(h.calls.request.length, 0);
});

test("runCheckin: automático fora da regra nem consulta o site", async () => {
  const h = harness();
  const r = await runCheckin({ source: "auto" }, h.deps("2026-10-26T22:45:00Z")); // segunda 19:45
  assert.equal(r.status, "skipped");
  assert.equal(h.calls.list, 0);
});

test("runCheckin: automático não repete quando já houve check-in no dia", async () => {
  const h = harness({ done: true });
  const r = await runCheckin({ source: "auto" }, h.deps(TUE_1945));
  assert.equal(r.status, "skipped");
  assert.equal(h.calls.request.length, 0);
});

test("runCheckin: automático na regra envia", async () => {
  const h = harness();
  const r = await runCheckin({ source: "auto" }, h.deps(TUE_1945));
  assert.equal(r.status, "ok");
  assert.equal(h.recorded[0]!.source, "auto");
});

test("runCheckin: dryRun não envia nem grava", async () => {
  const h = harness();
  const r = await runCheckin({ source: "widget", dryRun: true }, h.deps(TUE_1945));
  assert.equal(r.status, "skipped");
  assert.match(r.message, /Simulação/);
  assert.equal(h.calls.request.length, 0);
  assert.equal(h.recorded.length, 0);
});

test("runCheckin: erro do site vira 'error' com etapa e HTTP, sem retry", async () => {
  const h = harness({ fail: new SiteError("Não foi encontrada uma aula para este contexto.", "envio", 400) });
  const r = await runCheckin({ source: "widget" }, h.deps(TUE_1945));
  assert.equal(r.status, "error");
  assert.equal(h.calls.request.length, 1);
  assert.equal(h.recorded[0]!.step, "envio");
  assert.equal(h.recorded[0]!.httpStatus, 400);
});

test("runCheckin: pedido repetido no site vira 'duplicate'", async () => {
  const h = harness({ fail: new SiteError("Já existe um check-in pendente para esta aula.", "envio", 409) });
  assert.equal((await runCheckin({ source: "widget" }, h.deps(TUE_1945))).status, "duplicate");
});

test("runCheckin: falha de login é erro na etapa login", async () => {
  const h = harness();
  const site: GymSite = {
    async listSlots() {
      throw new SiteError("Login recusado: Invalid login credentials", "login", 400);
    },
    async requestCheckin() {},
  };
  const r = await runCheckin({ source: "widget" }, { ...h.deps(TUE_1945), site });
  assert.equal(r.status, "error");
  assert.equal(h.recorded[0]!.step, "login");
});

test("runCheckin: mensagens enormes são cortadas", async () => {
  const h = harness({ fail: new SiteError("x".repeat(2000), "envio", 500) });
  await runCheckin({ source: "widget" }, h.deps(TUE_1945));
  assert.ok(h.recorded[0]!.message.length <= 500);
});

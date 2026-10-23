import assert from "node:assert/strict";
import { test } from "node:test";
import { decideCheckin, parseCheckinBody } from "../src/checkin/decide.js";

const now = new Date("2026-10-23T22:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

test("notificação recente vira check-in", () => {
  assert.deepEqual(decideCheckin(minutesAgo(1), now), { action: "checkin" });
  assert.deepEqual(decideCheckin(minutesAgo(119), now), { action: "checkin" });
});

test("notificação com mais de 2h é ignorada", () => {
  assert.equal(decideCheckin(minutesAgo(121), now).action, "ignorar");
});

test("relógio do celular um pouco adiantado passa, muito adiantado não", () => {
  assert.equal(decideCheckin(minutesAgo(-3), now).action, "checkin");
  assert.equal(decideCheckin(minutesAgo(-10), now).action, "ignorar");
});

test("valida o corpo da requisição", () => {
  assert.deepEqual(parseCheckinBody({ source: "wellhub", notifiedAt: "2026-10-23T21:59:00Z" }), {
    source: "wellhub",
    notifiedAt: new Date("2026-10-23T21:59:00Z"),
  });
  assert.equal(parseCheckinBody(null), null);
  assert.equal(parseCheckinBody({ source: "wellhub" }), null);
  assert.equal(parseCheckinBody({ source: "Wellhub!", notifiedAt: "2026-10-23T21:59:00Z" }), null);
  assert.equal(parseCheckinBody({ source: "wellhub", notifiedAt: "ontem" }), null);
});

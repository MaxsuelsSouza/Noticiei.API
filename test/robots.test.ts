import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowed, parseRobots } from "../src/collect/robots.js";

const robots = `
User-agent: *
Disallow: /private
Allow: /private/feed
Disallow: /*.json$

User-agent: OtherBot
Disallow: /
`;

test("usa o grupo * quando não há grupo próprio", () => {
  const rules = parseRobots(robots);
  assert.equal(isAllowed(rules, "/blog/feed"), true);
  assert.equal(isAllowed(rules, "/private/x"), false);
  assert.equal(isAllowed(rules, "/private/feed"), true);
  assert.equal(isAllowed(rules, "/data.json"), false);
  assert.equal(isAllowed(rules, "/data.json?x=1"), true);
});

test("grupo com o nome do robô tem precedência", () => {
  const rules = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: NoticieiBot\nAllow: /");
  assert.equal(isAllowed(rules, "/feed"), true);
});

test("Disallow: / bloqueia tudo", () => {
  assert.equal(isAllowed(parseRobots("User-agent: *\nDisallow: /"), "/feed.xml"), false);
});

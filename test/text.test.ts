import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalUrl, stripHtml, titleHash, truncate } from "../src/text.js";

test("canonicalUrl remove rastreio, fragmento, www e barra final", () => {
  assert.equal(
    canonicalUrl("http://WWW.Example.com/post/?utm_source=x&b=2&a=1#comentarios"),
    "https://example.com/post?a=1&b=2",
  );
});

test("titleHash ignora caixa, acentos e pontuação", () => {
  assert.equal(titleHash("Novidades do C# 14!"), titleHash("novidades do c 14"));
  assert.equal(titleHash("Ação"), titleHash("acao"));
});

test("stripHtml remove tags e decodifica entidades", () => {
  assert.equal(stripHtml("<p>Tom &amp; Jerry&#39;s <b>show</b></p><script>x()</script>"), "Tom & Jerry's show");
});

test("truncate corta em palavra", () => {
  assert.equal(truncate("uma frase bem comprida aqui", 15), "uma frase bem…");
});

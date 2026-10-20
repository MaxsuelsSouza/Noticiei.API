import assert from "node:assert/strict";
import { test } from "node:test";
import { extractArticle, htmlToBlocks } from "../src/extract/article.js";

const paragraph = (n: number) =>
  `<p>Paragraph ${n} explains how message brokers decouple producers from consumers, why back-pressure matters, and what happens when a consumer falls behind the queue for a long time.</p>`;

const page = `<!doctype html><html><head><title>How Kafka works</title></head><body>
  <nav><a href="/">Home</a><a href="/blog">Blog</a><a href="/about">About</a></nav>
  <div class="cookie-banner">We use cookies. Accept all?</div>
  <article>
    <h1>How Kafka works</h1>
    ${paragraph(1)}${paragraph(2)}
    <h2>Partitions</h2>
    ${paragraph(3)}
    <pre><code>consumer.Subscribe("orders");
consumer.Consume();</code></pre>
    <ul><li>First point about offsets</li><li><p>Second point inside a paragraph</p></li></ul>
    ${paragraph(4)}${paragraph(5)}
  </article>
  <aside><h3>Related posts</h3><a href="/x">Something else</a></aside>
  <footer>© 2026 Example — Privacy — Terms</footer>
</body></html>`;

test("extrai só o artigo, sem menu, banner, aside e rodapé", () => {
  const article = extractArticle(page, "https://example.com/kafka");
  assert.ok(article);
  const text = article.blocks.map((b) => b.text).join("\n");
  assert.match(text, /Paragraph 1 explains/);
  assert.match(text, /Paragraph 5 explains/);
  assert.doesNotMatch(text, /cookies|Privacy|Related posts|Home/);
});

test("mantém títulos, código e listas como blocos separados", () => {
  const article = extractArticle(page, "https://example.com/kafka")!;
  assert.ok(article.blocks.some((b) => b.type === "heading" && b.text === "Partitions"));
  const code = article.blocks.find((b) => b.type === "code");
  assert.ok(code?.text.includes('consumer.Subscribe("orders");\nconsumer.Consume();'));
  assert.ok(article.blocks.some((b) => b.text === "Second point inside a paragraph"));
  assert.equal(article.blocks.filter((b) => b.text === "Second point inside a paragraph").length, 1);
  assert.ok(article.readingMinutes >= 1);
});

test("página sem artigo (paywall/curta) retorna null", () => {
  assert.equal(extractArticle("<html><body><p>Subscribe to read.</p></body></html>", "https://example.com/x"), null);
});

test("htmlToBlocks normaliza espaços e ignora blocos vazios", () => {
  assert.deepEqual(htmlToBlocks("<p>  Olá\n   mundo  </p><p> </p><h2>Fim</h2>"), [
    { type: "paragraph", text: "Olá mundo" },
    { type: "heading", text: "Fim" },
  ]);
});

test("remove chamadas de boilerplate", () => {
  const blocks = htmlToBlocks(
    "<p>LEIA TAMBÉM</p><p>Agora no g1</p><p>Read more: other story</p><p>Texto real da notícia.</p><p>Leia também o que disse o ministro sobre o tema em uma frase longa que continua bastante e não é chamada solta de link.</p>",
  );
  assert.deepEqual(blocks.map((b) => b.text), [
    "Texto real da notícia.",
    "Leia também o que disse o ministro sobre o tema em uma frase longa que continua bastante e não é chamada solta de link.",
  ]);
});

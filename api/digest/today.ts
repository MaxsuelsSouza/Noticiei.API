import { getDigest } from "../../src/digest/build.js";
import { isApp, json, unauthorized } from "../../src/http.js";

/** Digest mais recente (ou de ?date=YYYY-MM-DD). É o que o app e o widget leem. */
export async function GET(request: Request) {
  if (!isApp(request)) return unauthorized();

  const date = new URL(request.url).searchParams.get("date") ?? undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "date deve ser YYYY-MM-DD" }, 400);

  const digest = await getDigest(date);
  return digest ? json(digest) : json({ error: "nenhum digest montado ainda" }, 404);
}

import { isApp, json, unauthorized } from "../../src/http.js";
import { runDaily } from "../../src/pipeline.js";
import { getDigest } from "../../src/digest/build.js";

/** "Atualizar digest manualmente": coleta e monta o digest do dia. Com ?force=1, refaz o digest do dia. */
export async function POST(request: Request) {
  if (!isApp(request)) return unauthorized();

  const force = new URL(request.url).searchParams.get("force") === "1";
  const report = await runDaily({ force });
  return json({ report, digest: await getDigest() });
}

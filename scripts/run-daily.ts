// Roda a rotina diária localmente: npm run daily [-- --force]
import { runDaily } from "../src/pipeline.js";

const report = await runDaily({ force: process.argv.includes("--force") });
console.log(JSON.stringify(report, null, 2));

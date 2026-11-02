import { runAdaptacoes } from "../src/adaptacoes/coleta.js";

const report = await runAdaptacoes({ job: "adaptacoes-manual" });
console.log(JSON.stringify(report, null, 2));

import { runEditais } from "../src/editais/run.js";

const report = await runEditais({ job: "editais-manual" });
console.log(JSON.stringify(report, null, 2));

// Aplica, em ordem, os arquivos de db/migrations que ainda não rodaram: npm run db:migrate
import { migrate } from "../src/migrate.js";

const applied = await migrate();
for (const file of applied) console.log(`aplicada: ${file}`);
console.log("migrações em dia");

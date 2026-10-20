export const USER_AGENT = "NoticieiBot/1.0 (leitor pessoal de feeds)";
const AGENT_TOKEN = "noticieibot";

interface Rule {
  allow: boolean;
  path: string;
}

/**
 * Extrai as regras que valem para o nosso robô: o grupo com o nome dele, ou, se não houver, o grupo "*".
 */
export function parseRobots(content: string): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if ((field === "allow" || field === "disallow") && value) {
      current.rules.push({ allow: field === "allow", path: value });
    }
  }

  const own = groups.filter((g) => g.agents.some((a) => a === AGENT_TOKEN));
  const chosen = own.length > 0 ? own : groups.filter((g) => g.agents.includes("*"));
  return chosen.flatMap((g) => g.rules);
}

function ruleMatches(rulePath: string, path: string): boolean {
  const anchored = rulePath.endsWith("$");
  const pattern = (anchored ? rulePath.slice(0, -1) : rulePath)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

/** A regra mais específica (caminho mais longo) vence; em empate, allow vence. */
export function isAllowed(rules: Rule[], path: string): boolean {
  let best: Rule | null = null;
  for (const rule of rules) {
    if (!ruleMatches(rule.path, path)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

export class RobotsChecker {
  private cache = new Map<string, Promise<Rule[]>>();

  constructor(private fetchFn: typeof fetch = fetch) {}

  async allows(rawUrl: string): Promise<boolean> {
    const url = new URL(rawUrl);
    let rules = this.cache.get(url.origin);
    if (!rules) {
      rules = this.load(url.origin);
      this.cache.set(url.origin, rules);
    }
    return isAllowed(await rules, url.pathname + url.search);
  }

  private async load(origin: string): Promise<Rule[]> {
    try {
      const response = await this.fetchFn(`${origin}/robots.txt`, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(5000),
      });
      // Sem robots.txt (4xx) = tudo liberado. Erro do servidor = melhor não coletar agora.
      if (response.status >= 500) return [{ allow: false, path: "/" }];
      if (!response.ok) return [];
      return parseRobots(await response.text());
    } catch {
      return [];
    }
  }
}

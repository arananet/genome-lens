import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Wiki-backed agent memory (the "Karpathy LLM-wiki"): durable state lives as
// plain Markdown pages on disk. Node-only — never imported by the browser app.

export interface WikiPage {
  area: "glossary" | "memory";
  slug: string;
  meta: Record<string, string>;
  body: string;
}

function parseFrontMatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return { meta, body: match[2].trim() };
}

// When GENOME_LENS_DATA_DIR is set (Railway volume), the wiki lives there.
// Falls back to the repo-relative wiki/ directory for local development.
function defaultRoot(): string {
  const envDir = process.env["GENOME_LENS_DATA_DIR"];
  if (envDir) return join(envDir, "wiki");
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "wiki");
}

export class WikiMemory {
  constructor(private readonly root: string = defaultRoot()) {}

  listPages(area: WikiPage["area"]): string[] {
    const dir = join(this.root, area);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""));
  }

  readPage(area: WikiPage["area"], slug: string): WikiPage {
    const raw = readFileSync(join(this.root, area, `${slug}.md`), "utf8");
    const { meta, body } = parseFrontMatter(raw);
    return { area, slug, meta, body };
  }

  // Append a timestamped entry to the decision log, recording the Oracle verdict.
  appendDecision(agent: string, summary: string, verdict: string): void {
    const path = join(this.root, "memory", "decisions.md");
    const date = new Date().toISOString().slice(0, 10);
    const line = `- ${date} — \`${agent}\` — ${summary} Oracle: ${verdict}.`;
    const current = existsSync(path) ? readFileSync(path, "utf8") : "<!-- mesh:log -->\n";
    writeFileSync(path, `${current.replace(/\s*$/, "")}\n${line}\n`);
  }
}

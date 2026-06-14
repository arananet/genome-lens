// Loads the glossary pages from the LLM-wiki at build time. Each page is a
// Markdown file under wiki/glossary/ with a small YAML front-matter block.

export interface GlossaryPage {
  slug: string;
  term: string;
  title: string;
  category: string;
  body: string; // Markdown (front-matter stripped)
}

// Eager raw import of every glossary Markdown file.
const modules = import.meta.glob("../../wiki/glossary/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

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

let cache: GlossaryPage[] | null = null;

export function loadGlossary(): GlossaryPage[] {
  if (cache) return cache;
  const pages: GlossaryPage[] = [];
  for (const [path, raw] of Object.entries(modules)) {
    const slug = path.split("/").pop()!.replace(/\.md$/, "");
    const { meta, body } = parseFrontMatter(raw);
    pages.push({
      slug,
      term: meta.term ?? slug,
      title: meta.title ?? meta.term ?? slug,
      category: meta.category ?? "general",
      body,
    });
  }
  pages.sort((a, b) => a.term.localeCompare(b.term));
  cache = pages;
  return pages;
}

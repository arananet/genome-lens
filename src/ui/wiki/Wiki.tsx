import { useMemo, useState } from "react";
import { loadGlossary, type GlossaryPage } from "../../wiki/glossary";
import { renderMarkdown } from "../../wiki/markdown";

const CATEGORY_LABELS: Record<string, string> = {
  core: "Core concepts",
  interpreting: "Interpreting results",
  "data-quality": "Data quality",
  general: "General",
};

function PageBody({ page }: { page: GlossaryPage }) {
  const html = useMemo(() => renderMarkdown(page.body), [page.body]);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Wiki() {
  const pages = useMemo(() => loadGlossary(), []);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return pages;
    return pages.filter(
      (p) => p.term.toLowerCase().includes(query) || p.body.toLowerCase().includes(query),
    );
  }, [q, pages]);

  const byCategory = useMemo(() => {
    const map = new Map<string, GlossaryPage[]>();
    for (const p of filtered) {
      const arr = map.get(p.category) ?? [];
      arr.push(p);
      map.set(p.category, arr);
    }
    return map;
  }, [filtered]);

  const order = ["core", "interpreting", "data-quality", "general"];
  const categories = order.filter((c) => byCategory.has(c));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4">
      <h2 className="text-lg font-semibold">Glossary &amp; wiki</h2>
      <p className="mt-1 text-sm text-white/70">
        Plain-language definitions for the genomics terms used throughout
        genome-lens. Backed by the project&rsquo;s Markdown knowledge wiki.
      </p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search the glossary…"
        className="mt-3 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
      />

      <div className="mt-4 space-y-6">
        {categories.map((cat) => (
          <section key={cat}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">
              {CATEGORY_LABELS[cat] ?? cat}
            </h3>
            <div className="space-y-3">
              {byCategory.get(cat)!.map((p) => (
                <article
                  key={p.slug}
                  id={p.slug}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <h4 className="text-base font-semibold text-white">{p.title}</h4>
                  <div className="mt-1 text-sm">
                    <PageBody page={p} />
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
        {filtered.length === 0 && <p className="text-sm text-white/50">No matching terms.</p>}
      </div>
    </div>
  );
}

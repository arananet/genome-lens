import { useMemo, useState } from "react";
import { useGenomeStore } from "../../state/store";
import { CATEGORY_COLOR, CATEGORY_LABEL } from "../common/colors";
import { TierBadge } from "../common/TierBadge";

export function Search() {
  const findings = useGenomeStore((s) => s.findings);
  const select = useGenomeStore((s) => s.selectVariant);
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return findings;
    return findings.filter(
      (f) =>
        f.entry.rsid.toLowerCase().includes(query) ||
        f.entry.gene.toLowerCase().includes(query),
    );
  }, [q, findings]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4">
      <h2 className="text-lg font-semibold">Search</h2>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by rsid (e.g. rs4680) or gene (e.g. APOE)"
        className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
      />
      <ul className="mt-3 space-y-2">
        {results.map((f) => (
          <li key={f.entry.rsid}>
            <button
              onClick={() => select(f.entry.rsid)}
              className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-left hover:border-white/25"
            >
              <span className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: CATEGORY_COLOR[f.entry.category] }} />
                <span className="font-medium">{f.entry.gene}</span>
                <span className="text-white/50">· {f.entry.rsid}</span>
                <span className="text-xs text-white/40">{CATEGORY_LABEL[f.entry.category]}</span>
              </span>
              <span className="flex items-center gap-2">
                {f.covered ? (
                  <span className="text-sm text-white/70">{f.genotype}</span>
                ) : (
                  <span className="text-xs text-white/40">not covered</span>
                )}
                <TierBadge tier={f.entry.tier} />
              </span>
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="text-sm text-white/50">No matches.</li>}
      </ul>
    </div>
  );
}

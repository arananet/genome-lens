import { useMemo } from "react";
import { useGenomeStore } from "../../state/store";
import { CATEGORY_COLOR, CATEGORY_LABEL } from "../common/colors";
import type { KbCategory } from "../../kb/types";
import { ChromosomeTrack } from "./ChromosomeTrack";
import { Manhattan } from "./Manhattan";
import { CHROM_ORDER } from "./chromInfo";
import { MeshPanel } from "../mesh/MeshPanel";

export function TraceBrowser() {
  const findings = useGenomeStore((s) => s.findings);
  const genome = useGenomeStore((s) => s.genome);
  const selectVariant = useGenomeStore((s) => s.selectVariant);

  const covered = useMemo(() => findings.filter((f) => f.covered && f.variant), [findings]);
  const byChrom = useMemo(() => {
    const map = new Map<string, typeof covered>();
    for (const f of covered) {
      const c = f.variant!.chrom;
      const arr = map.get(c) ?? [];
      arr.push(f);
      map.set(c, arr);
    }
    return map;
  }, [covered]);

  const categories = Array.from(new Set(covered.map((f) => f.entry.category))) as KbCategory[];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4">
      {genome && <MeshPanel genome={genome} findings={findings} />}
      <h2 className="text-lg font-semibold">Genome trace</h2>
      <p className="mt-1 text-sm text-white/70">
        {covered.length} known variant{covered.length === 1 ? "" : "s"} matched in your file. Tap a
        marker to open its detail.
      </p>

      <div className="mt-3 flex flex-wrap gap-3">
        {categories.map((c) => (
          <span key={c} className="flex items-center gap-1.5 text-xs text-white/70">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: CATEGORY_COLOR[c] }} />
            {CATEGORY_LABEL[c]}
          </span>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <Manhattan findings={findings} onSelect={selectVariant} />
      </div>

      <div className="mt-5 space-y-4">
        {CHROM_ORDER.filter((c) => byChrom.has(c)).map((c) => (
          <ChromosomeTrack key={c} chrom={c} findings={byChrom.get(c)!} onSelect={selectVariant} />
        ))}
      </div>
    </div>
  );
}

import type { Finding } from "../../analysis/types";
import { CATEGORY_COLOR } from "../common/colors";
import { CHROM_LENGTHS_GRCH37 } from "./chromInfo";

// A single linear per-chromosome track: X axis = genomic position, markers for
// KB-matched SNPs colored by category.
export function ChromosomeTrack({
  chrom,
  findings,
  onSelect,
}: {
  chrom: string;
  findings: Finding[];
  onSelect: (rsid: string) => void;
}) {
  const length = CHROM_LENGTHS_GRCH37[chrom] ?? 1;
  const W = 1000;
  const H = 56;
  const padX = 10;
  const plotW = W - padX * 2;
  const y = H / 2;

  return (
    <div className="w-full">
      <div className="mb-1 text-xs font-medium text-white/70">Chromosome {chrom}</div>
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[520px]" role="img" aria-label={`Chromosome ${chrom} track`}>
          <line x1={padX} y1={y} x2={W - padX} y2={y} stroke="#ffffff20" strokeWidth={3} strokeLinecap="round" />
          {findings.map((f) => {
            const v = f.variant!;
            const x = padX + (v.pos / length) * plotW;
            return (
              <circle
                key={f.entry.rsid}
                cx={x}
                cy={y}
                r={6}
                fill={CATEGORY_COLOR[f.entry.category]}
                stroke="#0b1020"
                strokeWidth={1.5}
                className="cursor-pointer"
                onClick={() => onSelect(f.entry.rsid)}
              >
                <title>{`${f.entry.rsid} (${f.entry.gene})`}</title>
              </circle>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

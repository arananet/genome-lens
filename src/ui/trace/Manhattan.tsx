import { useMemo } from "react";
import type { Finding } from "../../analysis/types";
import { CATEGORY_COLOR } from "../common/colors";
import { CHROM_LENGTHS_GRCH37, CHROM_ORDER } from "./chromInfo";

// Manhattan-style overview: KB-matched markers laid out across all chromosomes.
// Vertical position encodes tier (A high, C low) so clinical-grade findings sit
// at the top. This is a navigation aid, not a p-value plot.
const TIER_Y: Record<string, number> = { A: 0.18, B: 0.5, C: 0.82 };

export function Manhattan({
  findings,
  onSelect,
}: {
  findings: Finding[];
  onSelect: (rsid: string) => void;
}) {
  const covered = useMemo(() => findings.filter((f) => f.covered && f.variant), [findings]);

  const total = CHROM_ORDER.reduce((sum, c) => sum + CHROM_LENGTHS_GRCH37[c], 0);
  const offsets: Record<string, number> = {};
  let acc = 0;
  for (const c of CHROM_ORDER) {
    offsets[c] = acc;
    acc += CHROM_LENGTHS_GRCH37[c];
  }

  const W = 1000;
  const H = 220;
  const padX = 8;
  const plotW = W - padX * 2;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[640px]" role="img" aria-label="Genome overview of matched variants">
        {/* alternating chromosome bands */}
        {CHROM_ORDER.map((c, i) => {
          const x = padX + (offsets[c] / total) * plotW;
          const w = (CHROM_LENGTHS_GRCH37[c] / total) * plotW;
          return (
            <g key={c}>
              <rect x={x} y={20} width={w} height={H - 40} fill={i % 2 ? "#ffffff08" : "#ffffff03"} />
              <text x={x + w / 2} y={H - 8} fill="#9aa3bd" fontSize={11} textAnchor="middle">
                {c}
              </text>
            </g>
          );
        })}
        {/* markers */}
        {covered.map((f) => {
          const v = f.variant!;
          const x = padX + ((offsets[v.chrom] + v.pos) / total) * plotW;
          const y = 20 + TIER_Y[f.entry.tier] * (H - 50);
          return (
            <circle
              key={f.entry.rsid}
              cx={x}
              cy={y}
              r={f.entry.tier === "A" ? 6 : f.entry.tier === "B" ? 5 : 4}
              fill={CATEGORY_COLOR[f.entry.category]}
              stroke="#0b1020"
              strokeWidth={1}
              className="cursor-pointer"
              onClick={() => onSelect(f.entry.rsid)}
            >
              <title>{`${f.entry.rsid} (${f.entry.gene}) — ${f.genotype ?? ""}`}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}

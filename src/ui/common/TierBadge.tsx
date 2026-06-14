import type { Tier } from "../../kb/types";

const STYLES: Record<Tier, { label: string; cls: string; title: string }> = {
  A: {
    label: "Tier A · Clinical-grade",
    cls: "bg-red-500/15 text-red-300 border-red-500/40",
    title: "ClinVar/ClinGen-curated. May be clinically actionable — confirm with a clinical-grade test.",
  },
  B: {
    label: "Tier B · Replicated",
    cls: "bg-blue-500/15 text-blue-300 border-blue-500/40",
    title: "Replicated association (multiple GWAS / meta-analysis), modest effect. Informational only.",
  },
  C: {
    label: "Tier C · Limited evidence",
    cls: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    title: "Weak / single-study / pharmacogenomic nuance. Interpret with caution.",
  },
};

export function TierBadge({ tier }: { tier: Tier }) {
  const s = STYLES[tier];
  return (
    <span
      title={s.title}
      className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

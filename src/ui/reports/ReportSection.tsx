import type { Finding } from "../../analysis/types";
import type { Tier } from "../../kb/types";
import { useGenomeStore } from "../../state/store";
import { TierBadge } from "../common/TierBadge";
import { Disclaimer } from "../common/Disclaimer";

const TIERS: Tier[] = ["A", "B", "C"];

function FindingRow({ finding }: { finding: Finding }) {
  const select = useGenomeStore((s) => s.selectVariant);
  const { entry } = finding;
  return (
    <button
      onClick={() => select(entry.rsid)}
      className="w-full rounded-lg border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-white/25 hover:bg-white/[0.06]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {entry.gene} <span className="text-white/50">· {entry.rsid}</span>
        </span>
        {finding.covered ? (
          <span className="text-sm text-white/70">{finding.genotype}</span>
        ) : (
          <span className="text-xs text-white/40">not covered</span>
        )}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-white/80">{finding.interpretation}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-amber-200/80">{entry.caveats}</p>
    </button>
  );
}

export function ReportSection({
  title,
  intro,
  findings,
}: {
  title: string;
  intro: string;
  findings: Finding[];
}) {
  const covered = findings.filter((f) => f.covered);
  const notCovered = findings.filter((f) => !f.covered);

  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-white/70">{intro}</p>
      <Disclaimer className="mt-3" />

      {TIERS.map((tier) => {
        const rows = covered.filter((f) => f.entry.tier === tier);
        if (rows.length === 0) return null;
        return (
          <div key={tier} className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <TierBadge tier={tier} />
              {tier === "A" && (
                <span className="text-xs text-white/60">
                  Confirm with a clinical-grade test and a clinician before acting.
                </span>
              )}
            </div>
            <div className="space-y-2">
              {rows.map((f) => (
                <FindingRow key={f.entry.rsid} finding={f} />
              ))}
            </div>
          </div>
        );
      })}

      {notCovered.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/40">
            Not covered in your file
          </p>
          <div className="mt-2 space-y-2">
            {notCovered.map((f) => (
              <FindingRow key={f.entry.rsid} finding={f} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

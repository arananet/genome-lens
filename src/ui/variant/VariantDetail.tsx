import { useMemo } from "react";
import { useGenomeStore } from "../../state/store";
import { CATEGORY_COLOR, CATEGORY_LABEL } from "../common/colors";
import { TierBadge } from "../common/TierBadge";
import { Disclaimer } from "../common/Disclaimer";
import { AiExplainer } from "./AiExplainer";

export function VariantDetail() {
  const selectedRsid = useGenomeStore((s) => s.selectedRsid);
  const findings = useGenomeStore((s) => s.findings);
  const close = useGenomeStore((s) => s.selectVariant);

  const finding = useMemo(
    () => findings.find((f) => f.entry.rsid === selectedRsid) ?? null,
    [findings, selectedRsid],
  );

  if (!finding) return null;
  const { entry } = finding;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={() => close(null)}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-[#11162a] p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: CATEGORY_COLOR[entry.category] }} />
              <span className="text-xs text-white/60">{CATEGORY_LABEL[entry.category]}</span>
            </div>
            <h3 className="mt-1 text-xl font-bold">
              {entry.rsid} <span className="text-white/60">· {entry.gene}</span>
            </h3>
          </div>
          <button
            onClick={() => close(null)}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <TierBadge tier={entry.tier} />
          {finding.covered ? (
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs">
              Genotype: <strong>{finding.genotype}</strong>
            </span>
          ) : (
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/70">
              Not covered
            </span>
          )}
          {finding.lowConfidence && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200">
              {finding.noCall ? "No-call" : "Low-confidence / imputed"}
            </span>
          )}
          {finding.indeterminate && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200">
              Indeterminate
            </span>
          )}
        </div>

        <p className="mt-3 text-sm leading-relaxed text-white/85">{finding.interpretation}</p>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Caveat</p>
          <p className="mt-1 text-sm leading-relaxed text-amber-200/90">{entry.caveats}</p>
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Sources</p>
          <ul className="mt-1 space-y-1">
            {entry.sources.map((s) => (
              <li key={`${s.db}-${s.id}`}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm text-indigo-300 underline decoration-dotted hover:text-indigo-200"
                >
                  {s.db}: {s.id}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4">
          <AiExplainer finding={finding} />
        </div>

        <Disclaimer className="mt-4" />
      </div>
    </div>
  );
}

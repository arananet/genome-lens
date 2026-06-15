import { useEffect, useMemo } from "react";
import type {
  ParsedHealthReport,
  GwasFinding,
  GwasVerdict,
} from "../../parse/parseHealthReport";

interface Props {
  report: ParsedHealthReport;
  fileName: string;
  onClose: () => void;
}

type VerdictStyle = { bg: string; border: string; text: string; label: string };

const VERDICT_STYLES: Record<string, VerdictStyle> = {
  elevated: {
    bg: "bg-red-500/10",
    border: "border-red-500/25",
    text: "text-red-400",
    label: "↑ Elevated risk",
  },
  flagged_pathogenic: {
    bg: "bg-red-500/10",
    border: "border-red-500/25",
    text: "text-red-400",
    label: "⚠ Pathogenic variant",
  },
  drug_harmful: {
    bg: "bg-red-500/10",
    border: "border-red-500/25",
    text: "text-red-400",
    label: "✕ Potential harm",
  },
  elevated_biomarker: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    text: "text-amber-400",
    label: "↑ Abnormal levels likely",
  },
  drug_abnormal: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    text: "text-amber-400",
    label: "⚠ Abnormal response",
  },
  reduced: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
    text: "text-emerald-400",
    label: "↓ Reduced risk",
  },
  reduced_biomarker: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
    text: "text-emerald-400",
    label: "↓ Favorable levels",
  },
  drug_positive: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
    text: "text-emerald-400",
    label: "✓ Positive response",
  },
  average: {
    bg: "bg-white/5",
    border: "border-white/10",
    text: "text-white/50",
    label: "— Average",
  },
  average_biomarker: {
    bg: "bg-white/5",
    border: "border-white/10",
    text: "text-white/50",
    label: "— Normal range",
  },
  drug_clear: {
    bg: "bg-white/5",
    border: "border-white/10",
    text: "text-white/50",
    label: "— No interaction",
  },
  clear: {
    bg: "bg-white/5",
    border: "border-white/10",
    text: "text-white/50",
    label: "— Clear",
  },
};

const PRINT_VERDICT: Record<string, string> = {
  elevated: "print:border-red-300 print:text-red-700",
  flagged_pathogenic: "print:border-red-300 print:text-red-700",
  drug_harmful: "print:border-red-300 print:text-red-700",
  elevated_biomarker: "print:border-yellow-400 print:text-yellow-700",
  drug_abnormal: "print:border-yellow-400 print:text-yellow-700",
  reduced: "print:border-green-400 print:text-green-700",
  reduced_biomarker: "print:border-green-400 print:text-green-700",
  drug_positive: "print:border-green-400 print:text-green-700",
  average: "print:border-gray-300 print:text-gray-500",
  average_biomarker: "print:border-gray-300 print:text-gray-500",
  drug_clear: "print:border-gray-300 print:text-gray-500",
  clear: "print:border-gray-300 print:text-gray-500",
};

function VerdictBadge({ verdict }: { verdict: GwasVerdict }) {
  const s = VERDICT_STYLES[verdict] ?? VERDICT_STYLES.clear;
  const p = PRINT_VERDICT[verdict] ?? "";
  return (
    <span
      className={`inline-block rounded border px-1.5 py-px text-[10px] font-bold whitespace-nowrap ${s.bg} ${s.border} ${s.text} ${p}`}
    >
      {s.label}
    </span>
  );
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span className="rounded bg-white/5 border border-white/8 px-1.5 py-px text-[9px] text-white/40 print:border-gray-200 print:text-gray-400">
      {method}
    </span>
  );
}

function FindingsTable({
  findings,
  showMethodology,
}: {
  findings: GwasFinding[];
  showMethodology?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/8 print:border-gray-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/8 print:border-gray-200 bg-white/3 print:bg-gray-50">
            <th className="text-left px-3 py-2 text-[9px] uppercase tracking-wider text-white/30 print:text-gray-500 font-medium">
              Condition
            </th>
            <th className="text-left px-3 py-2 text-[9px] uppercase tracking-wider text-white/30 print:text-gray-500 font-medium">
              Category
            </th>
            {showMethodology && (
              <th className="text-left px-3 py-2 text-[9px] uppercase tracking-wider text-white/30 print:text-gray-500 font-medium">
                Method
              </th>
            )}
            <th className="text-left px-3 py-2 text-[9px] uppercase tracking-wider text-white/30 print:text-gray-500 font-medium w-16">
              SNPs
            </th>
            <th className="text-left px-3 py-2 text-[9px] uppercase tracking-wider text-white/30 print:text-gray-500 font-medium">
              Verdict
            </th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f, i) => (
            <tr
              key={`${f.category}-${f.condition}`}
              className={`border-b border-white/5 last:border-0 print:border-gray-100 ${i % 2 === 1 ? "bg-white/[0.015] print:bg-gray-50/50" : ""}`}
            >
              <td className="px-3 py-2 text-white/75 print:text-gray-700 font-medium">
                {f.condition}
              </td>
              <td className="px-3 py-2 text-white/50 print:text-gray-500">
                {f.category}
              </td>
              {showMethodology && (
                <td className="px-3 py-2">
                  <MethodBadge method={f.methodology} />
                </td>
              )}
              <td className="px-3 py-2 font-mono text-white/40 print:text-gray-400">
                {f.snps.length}
              </td>
              <td className="px-3 py-2">
                <VerdictBadge verdict={f.verdict} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HealthReport({ report, fileName, onClose }: Props) {
  useEffect(() => {
    document.body.classList.add("printing-report");
    return () => document.body.classList.remove("printing-report");
  }, []);

  const reportDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const elevated = useMemo(
    () =>
      report.findings.filter((f) =>
        ["elevated", "flagged_pathogenic", "drug_harmful", "elevated_biomarker"].includes(
          f.verdict,
        ),
      ),
    [report.findings],
  );

  const reduced = useMemo(
    () =>
      report.findings.filter((f) =>
        ["reduced", "drug_positive", "reduced_biomarker"].includes(f.verdict),
      ),
    [report.findings],
  );

  const drugFindings = useMemo(
    () =>
      report.findings.filter((f) =>
        ["drug_harmful", "drug_abnormal", "drug_positive", "drug_clear"].includes(
          f.verdict,
        ),
      ),
    [report.findings],
  );

  const biomarkers = useMemo(
    () =>
      report.findings.filter((f) =>
        ["elevated_biomarker", "reduced_biomarker", "average_biomarker"].includes(
          f.verdict,
        ),
      ),
    [report.findings],
  );

  const averageFindings = useMemo(
    () => report.findings.filter((f) => f.verdict === "average"),
    [report.findings],
  );

  const hereditary = useMemo(() => {
    const flagged = report.findings.filter(
      (f) =>
        f.category === "Hereditary Diseases" && f.verdict === "flagged_pathogenic",
    );
    const clearedCount =
      report.totalConditions -
      report.findings.length +
      report.findings.filter(
        (f) => f.category === "Hereditary Diseases" && f.verdict === "clear",
      ).length;
    return { flagged, clearedCount };
  }, [report]);

  const totalSnps = useMemo(
    () => report.findings.reduce((sum, f) => sum + f.snps.length, 0),
    [report.findings],
  );

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of report.findings) {
      map.set(f.category, (map.get(f.category) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [report.findings]);

  return (
    <div className="clinical-report-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 backdrop-blur-sm p-4">
      {/* Toolbar */}
      <div className="print:hidden sticky top-4 z-10 mb-4 flex items-center gap-3 self-start">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Print / Save as PDF
        </button>
        <button
          onClick={onClose}
          className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/70 hover:bg-white/5"
        >
          Close
        </button>
      </div>

      {/* Report body */}
      <div
        className="w-full max-w-4xl rounded-xl border border-white/10 bg-[#0e1120] px-8 py-8 text-white space-y-8 print:bg-white print:text-black print:border-0 print:rounded-none print:px-12 print:py-10 print:max-w-none print:space-y-6"
        style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="border-b border-white/15 pb-6 print:border-gray-300">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight print:text-black">
                Genetic Health Report
              </h1>
              <p className="mt-1 text-sm text-white/50 print:text-gray-500">
                Population-relative risk analysis · GWAS &amp; multivariate methodology · Educational use only
              </p>
            </div>
            <div className="text-right text-xs text-white/35 print:text-gray-400">
              <p>{reportDate}</p>
              <p className="mt-0.5 font-mono">{fileName}</p>
            </div>
          </div>

          {/* Summary cards */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Conditions analyzed", value: report.totalConditions.toLocaleString() },
              { label: "Genetic variants tested", value: totalSnps.toLocaleString() },
              { label: "Elevated risk findings", value: elevated.length },
              { label: "Reduced risk findings", value: reduced.length },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-lg border border-white/8 bg-white/3 px-3 py-2.5 print:border-gray-200 print:bg-gray-50"
              >
                <p className="text-[9px] uppercase tracking-wider text-white/30 print:text-gray-400">
                  {label}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-white/90 print:text-gray-900">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Category breakdown ───────────────────────────────── */}
        <div>
          <p className="mb-3 text-[10px] uppercase tracking-wider font-medium text-white/30 print:text-gray-400">
            Coverage by medical system
          </p>
          <div className="flex flex-wrap gap-2">
            {categoryBreakdown.map(([cat, n]) => (
              <span
                key={cat}
                className="rounded-lg border border-white/8 bg-white/3 px-2.5 py-1.5 text-xs print:border-gray-200 print:bg-gray-50"
              >
                <span className="text-white/70 print:text-gray-700 font-medium">{cat}</span>
                <span className="ml-1.5 text-white/30 print:text-gray-400">{n}</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── Elevated risk ────────────────────────────────────── */}
        {elevated.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400" />
              <h2 className="text-sm font-bold uppercase tracking-wide text-white/80 print:text-gray-700">
                Elevated Risk Findings
              </h2>
              <span className="text-xs text-white/30 print:text-gray-400">
                {elevated.length} condition{elevated.length !== 1 ? "s" : ""}
              </span>
            </div>
            <FindingsTable findings={elevated} showMethodology />
          </div>
        )}

        {/* ── Reduced risk ─────────────────────────────────────── */}
        {reduced.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <h2 className="text-sm font-bold uppercase tracking-wide text-white/80 print:text-gray-700">
                Reduced Risk Findings
              </h2>
              <span className="text-xs text-white/30 print:text-gray-400">
                {reduced.length} condition{reduced.length !== 1 ? "s" : ""}
              </span>
            </div>
            <FindingsTable findings={reduced} showMethodology />
          </div>
        )}

        {/* ── Average / Population-typical ──────────────────────── */}
        {averageFindings.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-white/30" />
              <h2 className="text-sm font-bold uppercase tracking-wide text-white/80 print:text-gray-700">
                Population-Typical Risk
              </h2>
              <span className="text-xs text-white/30 print:text-gray-400">
                {averageFindings.length} condition{averageFindings.length !== 1 ? "s" : ""}
              </span>
            </div>
            <FindingsTable findings={averageFindings} showMethodology />
          </div>
        )}

        {/* ── Pharmacogenetics ──────────────────────────────────── */}
        {drugFindings.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-violet-400" />
              <h2 className="text-sm font-bold uppercase tracking-wide text-white/80 print:text-gray-700">
                Pharmacogenetics
              </h2>
              <span className="text-xs text-white/30 print:text-gray-400">
                {drugFindings.length} drug{drugFindings.length !== 1 ? "s" : ""}
              </span>
            </div>
            <FindingsTable findings={drugFindings} />
          </div>
        )}

        {/* ── Biomarkers ────────────────────────────────────────── */}
        {biomarkers.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-400" />
              <h2 className="text-sm font-bold uppercase tracking-wide text-white/80 print:text-gray-700">
                Biomarker Predispositions
              </h2>
              <span className="text-xs text-white/30 print:text-gray-400">
                {biomarkers.length} marker{biomarkers.length !== 1 ? "s" : ""}
              </span>
            </div>
            <FindingsTable findings={biomarkers} />
          </div>
        )}

        {/* ── Hereditary disease screening summary ──────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-400" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-white/80 print:text-gray-700">
              Hereditary Disease Screening
            </h2>
          </div>
          {hereditary.flagged.length > 0 ? (
            <>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 mb-3 print:border-yellow-300 print:bg-yellow-50">
                <p className="text-xs text-amber-200/80 print:text-yellow-800">
                  <span className="font-bold">{hereditary.flagged.length}</span> potential
                  pathogenic variant{hereditary.flagged.length !== 1 ? "s" : ""} detected
                  across hereditary disease genes. Confirmatory clinical sequencing is recommended.
                </p>
              </div>
              <FindingsTable findings={hereditary.flagged} />
            </>
          ) : (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 print:border-green-300 print:bg-green-50">
              <p className="text-xs text-emerald-300/80 print:text-green-800">
                No pathogenic variants detected in the analyzed regions of hereditary disease
                genes. Note: only partial gene coverage — pathogenic variants in
                non-analyzed regions cannot be excluded.
              </p>
            </div>
          )}
        </div>

        {/* ── Methodology legend ─────────────────────────────────── */}
        <div className="border-t border-white/10 pt-4 print:border-gray-200">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 print:text-gray-400 mb-2">
            Analysis methodology
          </p>
          <div className="space-y-0.5 text-[10px] text-white/35 print:text-gray-500">
            <p>
              <span className="font-bold">GWAS</span> — Genome-wide association study.
              Polygenic risk from population-level statistical associations across many loci.
            </p>
            <p>
              <span className="font-bold">Multivariate</span> — Multiple variants in one
              or more genes analyzed together for stronger correlation with predisposition.
            </p>
            <p>
              <span className="font-bold">Monovariate</span> — Single variant with
              strong direct correlation to the phenotype.
            </p>
          </div>
        </div>

        {/* ── Disclaimer ─────────────────────────────────────────── */}
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 print:border-yellow-300 print:bg-yellow-50">
          <p className="text-[10px] leading-relaxed text-amber-200/70 print:text-yellow-800">
            <span className="font-bold">Educational use only.</span> This report
            summarizes genetic predispositions derived from GWAS, multivariate, and
            monovariate analyses of published research. It is not a diagnostic or
            medical report. Risk levels reflect population-relative statistical
            associations, not individual clinical predictions. Environmental factors,
            lifestyle, and non-analyzed genetic regions significantly influence actual
            disease risk. Consult a qualified clinical geneticist or genetic counsellor
            before acting on any finding.
          </p>
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div className="border-t border-white/8 pt-3 print:border-gray-200">
          <p className="text-[9px] text-white/20 print:text-gray-400">
            Generated by genome-lens · {reportDate}
          </p>
        </div>
      </div>
    </div>
  );
}

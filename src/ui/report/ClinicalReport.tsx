import { useEffect, useMemo, useRef } from "react";
import type { Finding } from "../../analysis/types";
import type { ParsedGenome } from "../../parse/types";
import { reviewAllFindings, buildMeshSummary } from "../../analysis/mesh-review";
import { CATEGORY_COLOR, CATEGORY_LABEL } from "../common/colors";

interface Props {
  genome: ParsedGenome;
  findings: Finding[];
  fileName: string;
  onClose: () => void;
}

const SOURCE_LABEL: Record<string, string> = {
  "23andme": "23andMe (SNP array)",
  ancestry: "AncestryDNA (SNP array)",
  myheritage: "MyHeritage",
  vcf: "VCF (clinical sequencing)",
  unknown: "Unknown",
};

const TIER_LABEL: Record<string, string> = {
  A: "Tier A — Strongest evidence",
  B: "Tier B — Moderate evidence",
  C: "Tier C — Limited/preliminary evidence",
};

export function ClinicalReport({ genome, findings, fileName, onClose }: Props) {
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.add("printing-report");
    return () => document.body.classList.remove("printing-report");
  }, []);

  const verdicts = useMemo(() => reviewAllFindings(findings), [findings]);
  const summary = useMemo(
    () => buildMeshSummary(genome.variantCount, findings, verdicts),
    [genome.variantCount, findings, verdicts],
  );

  const covered = useMemo(
    () =>
      findings
        .filter((f) => f.covered && !f.noCall && !f.indeterminate)
        .sort((a, b) => {
          const t: Record<string, number> = { A: 0, B: 1, C: 2 };
          return t[a.entry.tier] - t[b.entry.tier] || a.entry.category.localeCompare(b.entry.category);
        }),
    [findings],
  );

  const reportDate = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  // Group by category
  const byCategory = useMemo(() => {
    const m = new Map<string, Finding[]>();
    for (const f of covered) {
      const arr = m.get(f.entry.category) ?? [];
      arr.push(f);
      m.set(f.entry.category, arr);
    }
    return m;
  }, [covered]);

  return (
    <div className="clinical-report-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 backdrop-blur-sm p-4">
      {/* Toolbar — hidden on print */}
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

      {/* Report content — the ref is for print targeting */}
      <div
        ref={reportRef}
        className="w-full max-w-3xl rounded-xl border border-white/10 bg-[#0e1120] px-8 py-8 text-white space-y-8 print:bg-white print:text-black print:border-0 print:rounded-none print:px-12 print:py-10 print:max-w-none print:space-y-6"
        style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="border-b border-white/15 pb-6 print:border-gray-300">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight print:text-black">
                Genomic Findings Report
              </h1>
              <p className="mt-1 text-sm text-white/50 print:text-gray-500">
                Educational summary · not a clinical diagnostic report
              </p>
            </div>
            <div className="text-right text-xs text-white/35 print:text-gray-400">
              <p>{reportDate}</p>
              <p className="mt-0.5 font-mono">{fileName}</p>
            </div>
          </div>

          {/* Summary row */}
          <div className="mt-5 grid grid-cols-4 gap-3">
            {[
              { label: "Variants scanned", value: genome.variantCount.toLocaleString() },
              { label: "KB entries matched", value: summary.matchedCount },
              { label: "Covered findings", value: summary.coveredCount },
              { label: "Source", value: SOURCE_LABEL[genome.source] ?? genome.source },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-lg border border-white/8 bg-white/3 px-3 py-2.5 print:border-gray-200 print:bg-gray-50"
              >
                <p className="text-[9px] uppercase tracking-wider text-white/30 print:text-gray-400">{label}</p>
                <p className="mt-0.5 text-sm font-semibold text-white/90 print:text-gray-900">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Findings by category ──────────────────────────────────────────── */}
        {covered.length === 0 ? (
          <p className="text-sm text-white/45 print:text-gray-500">
            No covered findings in this file.
          </p>
        ) : (
          Array.from(byCategory.entries()).map(([cat, flist]) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLOR[cat as keyof typeof CATEGORY_COLOR] ?? "#888" }}
                />
                <h2 className="text-sm font-bold uppercase tracking-wide text-white/80 print:text-gray-700">
                  {CATEGORY_LABEL[cat as keyof typeof CATEGORY_LABEL] ?? cat}
                </h2>
                <span className="text-xs text-white/30 print:text-gray-400">
                  {flist.length} finding{flist.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-white/8 print:border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/8 print:border-gray-200 bg-white/3 print:bg-gray-50">
                      <th className="text-left px-3 py-2 text-[9px] uppercase tracking-wider text-white/30 print:text-gray-500 font-medium">rsid</th>
                      <th className="text-left px-3 py-2 text-[9px] uppercase tracking-wider text-white/30 print:text-gray-500 font-medium">Gene</th>
                      <th className="text-left px-3 py-2 text-[9px] uppercase tracking-wider text-white/30 print:text-gray-500 font-medium">Tier</th>
                      <th className="text-left px-3 py-2 text-[9px] uppercase tracking-wider text-white/30 print:text-gray-500 font-medium">Genotype</th>
                      <th className="text-left px-3 py-2 text-[9px] uppercase tracking-wider text-white/30 print:text-gray-500 font-medium">Interpretation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flist.map((f, i) => (
                      <tr
                        key={f.entry.rsid}
                        className={`border-b border-white/5 last:border-0 print:border-gray-100 ${i % 2 === 1 ? "bg-white/[0.015] print:bg-gray-50/50" : ""}`}
                      >
                        <td className="px-3 py-2 font-mono text-white/70 print:text-gray-700">{f.entry.rsid}</td>
                        <td className="px-3 py-2 font-mono text-white/60 print:text-gray-600">{f.entry.gene}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded px-1.5 py-px text-[9px] font-bold border ${
                            f.entry.tier === "A"
                              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400 print:border-green-400 print:text-green-700"
                              : f.entry.tier === "B"
                                ? "bg-blue-500/10 border-blue-500/25 text-blue-400 print:border-blue-400 print:text-blue-700"
                                : "bg-white/5 border-white/10 text-white/40 print:border-gray-300 print:text-gray-500"
                          }`}>
                            {f.entry.tier}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-white/75 print:text-gray-700">{f.genotype ?? "—"}</td>
                        <td className="px-3 py-2 text-white/55 print:text-gray-600 leading-snug max-w-xs">{f.interpretation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Caveats per category */}
              {flist.some((f) => f.entry.caveats) && (
                <div className="mt-2 pl-4 border-l-2 border-white/10 print:border-gray-200 space-y-1">
                  {Array.from(new Set(flist.map((f) => f.entry.caveats))).map((c, i) => (
                    <p key={i} className="text-[10px] text-white/30 print:text-gray-400 leading-snug">{c}</p>
                  ))}
                </div>
              )}
            </div>
          ))
        )}

        {/* ── Tier legend ───────────────────────────────────────────────────── */}
        <div className="border-t border-white/10 pt-4 print:border-gray-200">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 print:text-gray-400 mb-2">
            Evidence tiers
          </p>
          <div className="space-y-0.5">
            {Object.entries(TIER_LABEL).map(([tier, label]) => (
              <p key={tier} className="text-[10px] text-white/35 print:text-gray-500">
                <span className="font-bold">{tier}</span> — {label.split(" — ")[1]}
              </p>
            ))}
          </div>
        </div>

        {/* ── Disclaimer ────────────────────────────────────────────────────── */}
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 print:border-yellow-300 print:bg-yellow-50">
          <p className="text-[10px] leading-relaxed text-amber-200/70 print:text-yellow-800">
            <span className="font-bold">Educational use only.</span> This report is generated from a
            consumer genomics file using a curated knowledge base of published research associations.
            It is not a diagnostic or medical report. Evidence tiers reflect the strength of
            published research, not clinical diagnostic validity. All genome processing is done
            locally in your browser — no raw genetic data is transmitted to any server.
            Consult a qualified clinical geneticist or genetic counsellor before acting on any
            finding in this report.
          </p>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div className="border-t border-white/8 pt-3 print:border-gray-200">
          <p className="text-[9px] text-white/20 print:text-gray-400">
            Generated by genome-lens · {reportDate} · Build: GRCh37
          </p>
        </div>
      </div>
    </div>
  );
}

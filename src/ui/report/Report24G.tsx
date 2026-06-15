import { useEffect, useMemo } from "react";
import type { Finding24G, ParsedReport24G, Verdict24G } from "../../parse/parse24Genetics";

interface Props {
  report: ParsedReport24G;
  fileName: string;
  onClose: () => void;
}

// Which verdicts belong to which report section.
const ELEVATED: Verdict24G[] = ["elevated", "flagged_pathogenic", "elevated_biomarker"];
const REDUCED: Verdict24G[] = ["reduced", "reduced_biomarker"];
const DRUG: Verdict24G[] = ["drug_harmful", "drug_abnormal", "drug_positive", "drug_clear"];
const BIOMARKER: Verdict24G[] = ["elevated_biomarker", "reduced_biomarker", "average_biomarker"];

function VerdictBadge({ verdict }: { verdict: Verdict24G }) {
  const map: Record<Verdict24G, { label: string; cls: string }> = {
    elevated: {
      label: "↑ Elevated",
      cls: "bg-amber-500/10 border-amber-500/30 text-amber-300 print:border-amber-500 print:text-amber-700",
    },
    flagged_pathogenic: {
      label: "⚠ Pathogenic variant detected",
      cls: "bg-red-500/10 border-red-500/30 text-red-300 print:border-red-500 print:text-red-700",
    },
    elevated_biomarker: {
      label: "↑ Abnormal levels likely",
      cls: "bg-amber-500/10 border-amber-500/30 text-amber-300 print:border-amber-500 print:text-amber-700",
    },
    reduced: {
      label: "↓ Reduced risk",
      cls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 print:border-green-500 print:text-green-700",
    },
    reduced_biomarker: {
      label: "↓ Favourable levels likely",
      cls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 print:border-green-500 print:text-green-700",
    },
    average: {
      label: "≈ Average",
      cls: "bg-white/5 border-white/15 text-white/55 print:border-gray-300 print:text-gray-600",
    },
    average_biomarker: {
      label: "≈ Normal levels",
      cls: "bg-white/5 border-white/15 text-white/55 print:border-gray-300 print:text-gray-600",
    },
    clear: {
      label: "✓ No variant detected",
      cls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 print:border-green-500 print:text-green-700",
    },
    drug_harmful: {
      label: "✕ Potential harm",
      cls: "bg-red-500/10 border-red-500/30 text-red-300 print:border-red-500 print:text-red-700",
    },
    drug_abnormal: {
      label: "⚠ Abnormal response likely",
      cls: "bg-amber-500/10 border-amber-500/30 text-amber-300 print:border-amber-500 print:text-amber-700",
    },
    drug_positive: {
      label: "✓ Positive response",
      cls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 print:border-green-500 print:text-green-700",
    },
    drug_clear: {
      label: "✓ Nothing notable",
      cls: "bg-white/5 border-white/15 text-white/55 print:border-gray-300 print:text-gray-600",
    },
  };
  const { label, cls } = map[verdict];
  return (
    <span className={`inline-block rounded px-1.5 py-px text-[10px] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

function SummaryCell({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/3 px-3 py-2.5 print:border-gray-200 print:bg-gray-50">
      <p className="text-[9px] uppercase tracking-wider text-white/30 print:text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-white/90 print:text-gray-900">{value}</p>
    </div>
  );
}

// A condition/category/variants/verdict table used by the risk sections.
function FindingsTable({ findings }: { findings: Finding24G[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/8 print:border-gray-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/8 print:border-gray-200 bg-white/3 print:bg-gray-50">
            <th className="text-left px-3 py-2 text-[9px] uppercase tracking-wider text-white/30 print:text-gray-500 font-medium">Condition</th>
            <th className="text-left px-3 py-2 text-[9px] uppercase tracking-wider text-white/30 print:text-gray-500 font-medium">Category</th>
            <th className="text-left px-3 py-2 text-[9px] uppercase tracking-wider text-white/30 print:text-gray-500 font-medium">Variants tested</th>
            <th className="text-left px-3 py-2 text-[9px] uppercase tracking-wider text-white/30 print:text-gray-500 font-medium">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f, i) => (
            <tr
              key={`${f.category}:${f.condition}`}
              className={`border-b border-white/5 last:border-0 print:border-gray-100 ${i % 2 === 1 ? "bg-white/[0.015] print:bg-gray-50/50" : ""}`}
            >
              <td className="px-3 py-2 text-white/80 print:text-gray-800">{f.condition}</td>
              <td className="px-3 py-2 text-white/50 print:text-gray-500">{f.category}</td>
              <td className="px-3 py-2 font-mono text-white/55 print:text-gray-600">{f.snps.length}</td>
              <td className="px-3 py-2"><VerdictBadge verdict={f.verdict} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Report24G({ report, fileName, onClose }: Props) {
  useEffect(() => {
    document.body.classList.add("printing-report");
    return () => document.body.classList.remove("printing-report");
  }, []);

  const reportDate = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const groups = useMemo(() => {
    const has = (set: Verdict24G[]) => (f: Finding24G) => set.includes(f.verdict);
    const elevated = report.findings.filter(has(ELEVATED));
    const reduced = report.findings.filter(has(REDUCED));
    const drugs = report.findings.filter((f) => f.category === "Pharmacogenetics" && DRUG.includes(f.verdict));
    const biomarkers = report.findings.filter(has(BIOMARKER));
    const hereditary = report.findings.filter((f) => f.category === "Hereditary Diseases" || f.category === "Oncogenic Mutations");
    const flagged = report.findings.filter((f) => f.verdict === "flagged_pathogenic");
    return { elevated, reduced, drugs, biomarkers, hereditary, flagged };
  }, [report.findings]);

  const counts = useMemo(() => {
    const c = (v: Verdict24G) => report.findings.filter((f) => f.verdict === v).length;
    return {
      elevatedRisk: c("elevated") + c("flagged_pathogenic") + c("drug_harmful") + c("elevated_biomarker"),
      reducedRisk: c("reduced") + c("drug_positive") + c("reduced_biomarker"),
      drugInteractions: c("drug_harmful") + c("drug_abnormal") + c("drug_positive"),
    };
  }, [report.findings]);

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

      <div
        className="w-full max-w-3xl rounded-xl border border-white/10 bg-[#0e1120] px-8 py-8 text-white space-y-8 print:bg-white print:text-black print:border-0 print:rounded-none print:px-12 print:py-10 print:max-w-none print:space-y-6"
        style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="border-b border-white/15 pb-6 print:border-gray-300">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight print:text-black">
                Genetic Health Report
              </h1>
              <p className="mt-1 text-sm text-white/50 print:text-gray-500">
                Population-relative risk analysis · Educational use only
              </p>
            </div>
            <div className="text-right text-xs text-white/35 print:text-gray-400">
              <p>{reportDate}</p>
              <p className="mt-0.5 font-mono">{fileName}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-3">
            <SummaryCell label="Conditions analyzed" value={report.totalConditions} />
            <SummaryCell label="Elevated risk" value={counts.elevatedRisk} />
            <SummaryCell label="Reduced risk" value={counts.reducedRisk} />
            <SummaryCell label="Drug interactions" value={counts.drugInteractions} />
          </div>
        </div>

        {/* ── Elevated / Flagged ──────────────────────────────────────────── */}
        {groups.elevated.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-amber-300/90 print:text-amber-700">
              ↑ Elevated Risk Findings
            </h2>
            <FindingsTable findings={groups.elevated} />
          </div>
        )}

        {/* ── Reduced ─────────────────────────────────────────────────────── */}
        {groups.reduced.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-emerald-300/90 print:text-green-700">
              ↓ Reduced Risk Findings
            </h2>
            <FindingsTable findings={groups.reduced} />
          </div>
        )}

        {/* ── Pharmacogenetics ────────────────────────────────────────────── */}
        {groups.drugs.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-indigo-300/90 print:text-indigo-700">
              Rx Pharmacogenetics
            </h2>
            <div className="overflow-x-auto rounded-lg border border-white/8 print:border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/8 print:border-gray-200 bg-white/3 print:bg-gray-50">
                    <th className="text-left px-3 py-2 text-[9px] uppercase tracking-wider text-white/30 print:text-gray-500 font-medium">Drug</th>
                    <th className="text-left px-3 py-2 text-[9px] uppercase tracking-wider text-white/30 print:text-gray-500 font-medium">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.drugs.map((f, i) => (
                    <tr
                      key={f.condition}
                      className={`border-b border-white/5 last:border-0 print:border-gray-100 ${i % 2 === 1 ? "bg-white/[0.015] print:bg-gray-50/50" : ""}`}
                    >
                      <td className="px-3 py-2 text-white/80 print:text-gray-800">{f.condition}</td>
                      <td className="px-3 py-2"><VerdictBadge verdict={f.verdict} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Biomarkers ──────────────────────────────────────────────────── */}
        {groups.biomarkers.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-white/80 print:text-gray-700">
              Biomarkers
            </h2>
            <FindingsTable findings={groups.biomarkers} />
          </div>
        )}

        {/* ── Hereditary / oncogenic screening summary ───────────────────── */}
        <div
          className={`rounded-lg border px-4 py-3 ${
            groups.flagged.length === 0
              ? "border-emerald-500/20 bg-emerald-500/5 print:border-green-300 print:bg-green-50"
              : "border-red-500/25 bg-red-500/5 print:border-red-400 print:bg-red-50"
          }`}
        >
          <p
            className={`text-[11px] leading-relaxed ${
              groups.flagged.length === 0
                ? "text-emerald-200/80 print:text-green-800"
                : "text-red-200/80 print:text-red-800"
            }`}
          >
            <span className="font-bold">Hereditary &amp; oncogenic screening:</span>{" "}
            {groups.hereditary.length} gene{groups.hereditary.length !== 1 ? "s" : ""} analyzed.{" "}
            {groups.flagged.length} pathogenic variant{groups.flagged.length !== 1 ? "s" : ""} detected.
            {groups.flagged.length > 0 && (
              <>
                {" "}Flagged: {groups.flagged.map((f) => f.condition).join(", ")}.
              </>
            )}
          </p>
        </div>

        {/* ── Disclaimer ──────────────────────────────────────────────────── */}
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 print:border-yellow-300 print:bg-yellow-50">
          <p className="text-[10px] leading-relaxed text-amber-200/70 print:text-yellow-800">
            <span className="font-bold">Educational use only.</span> This report summarises the
            pre-computed genetic verdicts contained in a 24Genetics health report. Verdicts describe
            risk relative to the general population, not a clinical diagnosis. This report is not
            valid for clinical or diagnostic use. Consult a qualified clinical geneticist or genetic
            counsellor before acting on any finding.
          </p>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="border-t border-white/8 pt-3 print:border-gray-200">
          <p className="text-[9px] text-white/20 print:text-gray-400">
            Generated by genome-lens · {reportDate} · Source: 24Genetics health report
          </p>
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import type { Finding } from "../../analysis/types";
import {
  reviewAllFindings,
  buildMeshSummary,
  type MeshSummary,
} from "../../analysis/mesh-review";
import type { ParsedGenome } from "../../parse/types";
import { useGenomeStore } from "../../state/store";
import { ObservabilityPanel } from "./ObservabilityPanel";

interface Props {
  genome: ParsedGenome;
  findings: Finding[];
}

type SynthState = "idle" | "loading" | "done" | "error";
type Verdict = "allow" | "revise" | "deny";

// ── Sub-components ────────────────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const styles: Record<Verdict, string> = {
    allow: "bg-emerald-500/10 border-emerald-500/25 text-emerald-400",
    revise: "bg-amber-500/10 border-amber-500/25 text-amber-400",
    deny: "bg-red-500/10 border-red-500/25 text-red-400",
  };
  const labels: Record<Verdict, string> = { allow: "✓ allow", revise: "⚠ revise", deny: "✕ deny" };
  return (
    <span
      className={`flex-shrink-0 rounded border px-1.5 py-px text-[10px] font-bold ${styles[verdict]}`}
    >
      {labels[verdict]}
    </span>
  );
}

function OracleHeader({
  allOk,
  allowCount,
  flaggedCount,
}: {
  allOk: boolean;
  allowCount: number;
  flaggedCount: number;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-center min-w-[7rem] ${
        allOk
          ? "border-emerald-500/30 bg-emerald-500/8"
          : "border-amber-500/30 bg-amber-500/8"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wider text-white/35 font-medium">Oracle</p>
      <p className={`text-sm font-bold mt-0.5 ${allOk ? "text-emerald-300" : "text-amber-300"}`}>
        {allowCount} allow
        {flaggedCount > 0 && (
          <span className="ml-1 text-amber-400 font-normal text-xs">· {flaggedCount} flag</span>
        )}
      </p>
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  "23andme": "23andMe",
  ancestry: "AncestryDNA",
  myheritage: "MyHeritage",
  unknown: "Unknown",
};

interface PipelineStep {
  id: string;
  icon: string;
  label: string;
  role: string;
  detail: string;
  verdict: Verdict;
  isOracle?: boolean;
}

function AgentPipeline({
  summary,
  allOk,
  genome,
  parseMs,
  matchMs,
}: {
  summary: MeshSummary;
  allOk: boolean;
  genome: ParsedGenome;
  parseMs: number;
  matchMs: number;
}) {
  const method = genome.method ? ` · ${genome.method}` : " · array-based SNP";
  const parserDetail = `${summary.parsedCount.toLocaleString()} SNP positions · ${SOURCE_LABEL[genome.source] ?? genome.source}${method} · ${parseMs}ms`;

  const steps: PipelineStep[] = [
    {
      id: "parser-smith",
      icon: "⚙",
      label: "parser-smith",
      role: "parse",
      detail: parserDetail,
      verdict: "allow",
    },
    {
      id: "kb-curator",
      icon: "📚",
      label: "kb-curator",
      role: "match",
      detail: `${summary.matchedCount} KB entries queried · ${summary.coveredCount} in file · ${matchMs}ms`,
      verdict: "allow",
    },
    {
      id: "privacy-warden",
      icon: "🔒",
      label: "privacy-warden",
      role: "guard",
      detail: "genome stays local · no upload",
      verdict: "allow",
    },
    {
      id: "oracle",
      icon: "◈",
      label: "Oracle",
      role: "review",
      detail: allOk
        ? `${summary.allowCount} findings allowed`
        : `${summary.allowCount} allow · ${summary.flaggedCount} flagged`,
      verdict: allOk ? "allow" : "revise",
      isOracle: true,
    },
    {
      id: "ui-polisher",
      icon: "✦",
      label: "ui-polisher",
      role: "render",
      detail: `${summary.coveredCount} findings displayed`,
      verdict: "allow",
    },
  ];

  return (
    <div>
      <p className="mb-2 text-[10px] uppercase tracking-wider font-medium text-white/30">
        Agent pipeline · {steps.length} agents
      </p>
      <div className="space-y-px">
        {steps.map((step, i) => (
          <div key={step.id}>
            <div
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border transition-colors ${
                step.isOracle
                  ? allOk
                    ? "border-emerald-500/20 bg-emerald-500/[0.05]"
                    : "border-amber-500/20 bg-amber-500/[0.05]"
                  : "border-white/5 bg-white/[0.02]"
              }`}
            >
              {/* Icon + connector */}
              <div className="flex flex-col items-center self-stretch">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs border ${
                    step.isOracle
                      ? allOk
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                      : "border-white/10 bg-white/5 text-white/60"
                  }`}
                >
                  {step.icon}
                </span>
              </div>

              {/* Labels */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={`text-xs font-mono font-semibold ${
                      step.isOracle
                        ? allOk
                          ? "text-emerald-200"
                          : "text-amber-200"
                        : "text-white/75"
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="text-[10px] text-white/25 uppercase tracking-wide">
                    {step.role}
                  </span>
                </div>
                <p className="text-xs text-white/45 mt-0.5 truncate">{step.detail}</p>
              </div>

              <VerdictBadge verdict={step.verdict} />
            </div>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div className="ml-[1.3125rem] h-px border-b border-dashed border-white/8" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryBreakdown({ breakdown }: { breakdown: MeshSummary["breakdown"] }) {
  const entries = Object.entries(breakdown) as [
    string,
    { A: number; B: number; C: number },
  ][];
  if (entries.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-[10px] uppercase tracking-wider font-medium text-white/30">
        Covered variants by category · tier A = strongest evidence
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {entries.map(([cat, tiers]) => {
          const total = tiers.A + tiers.B + tiers.C;
          const max = Math.max(tiers.A, tiers.B, tiers.C, 1);
          return (
            <div
              key={cat}
              className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2.5"
            >
              <p className="text-xs text-white/65 font-medium mb-2 truncate">{cat}</p>
              <div className="space-y-1">
                {(["A", "B", "C"] as const).map((tier) => {
                  const count = tiers[tier];
                  if (count === 0) return null;
                  return (
                    <div key={tier} className="flex items-center gap-1.5">
                      <span className="text-[10px] text-white/30 w-3 shrink-0">{tier}</span>
                      <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            tier === "A"
                              ? "bg-emerald-500"
                              : tier === "B"
                                ? "bg-blue-400"
                                : "bg-white/25"
                          }`}
                          style={{ width: `${(count / max) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-white/40 w-4 text-right shrink-0">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs font-semibold text-white/55 mt-2">
                {total} total
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MeshPanel({ genome, findings }: Props) {
  const [tab, setTab] = useState<"analysis" | "trace">("analysis");
  const [synthState, setSynthState] = useState<SynthState>("idle");
  const [synthesis, setSynthesis] = useState("");
  const [synthErr, setSynthErr] = useState("");

  const parseMs = useGenomeStore((s) => s.parseMs);
  const matchMs = useGenomeStore((s) => s.matchMs);
  const sessionStart = useGenomeStore((s) => s.sessionStart);
  const fileName = useGenomeStore((s) => s.fileName);

  const verdicts = useMemo(() => reviewAllFindings(findings), [findings]);
  const summary = useMemo(
    () => buildMeshSummary(genome.variantCount, findings, verdicts),
    [genome.variantCount, findings, verdicts],
  );

  const allOk = summary.flaggedCount === 0;

  async function synthesize() {
    setSynthState("loading");
    setSynthErr("");
    setSynthesis("");
    try {
      const res = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          totals: {
            parsed: summary.parsedCount,
            matched: summary.matchedCount,
            covered: summary.coveredCount,
          },
          breakdown: summary.breakdown,
        }),
      });
      const data = (await res.json()) as { synthesis?: string; error?: string };
      console.log("[MeshPanel/synthesize]", { status: res.status, ok: res.ok, data });
      if (!res.ok || data.error) throw new Error(data.error ?? `Server error ${res.status}`);
      const text = (data.synthesis ?? "").trim();
      if (!text) {
        throw new Error(
          "AI returned an empty response — the model may be temporarily unavailable. Try again in a moment.",
        );
      }
      setSynthesis(text);
      setSynthState("done");
    } catch (e) {
      setSynthErr(e instanceof Error ? e.message : "Request failed");
      setSynthState("error");
    }
  }

  return (
    <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-5">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white/90">Agent mesh analysis</p>
          <p className="text-xs text-white/40 mt-0.5">
            {summary.parsedCount.toLocaleString()} variants scanned ·{" "}
            {summary.coveredCount} findings
          </p>
        </div>
        <OracleHeader
          allOk={allOk}
          allowCount={summary.allowCount}
          flaggedCount={summary.flaggedCount}
        />
      </div>

      {/* Tab buttons */}
      <div className="flex gap-1 border-b border-white/8 pb-0">
        <button
          onClick={() => setTab("analysis")}
          className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
            tab === "analysis"
              ? "text-white/90 border-b-2 border-indigo-400 -mb-px"
              : "text-white/40 hover:text-white/65"
          }`}
        >
          Analysis
        </button>
        <button
          onClick={() => setTab("trace")}
          className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
            tab === "trace"
              ? "text-white/90 border-b-2 border-indigo-400 -mb-px"
              : "text-white/40 hover:text-white/65"
          }`}
        >
          Trace ✦
        </button>
      </div>

      {/* Trace tab */}
      {tab === "trace" && (
        <ObservabilityPanel
          genome={genome}
          findings={findings}
          verdicts={verdicts}
          summary={summary}
          parseMs={parseMs}
          matchMs={matchMs}
          sessionStart={sessionStart}
          fileName={fileName ?? ""}
        />
      )}

      {/* Analysis tab content */}
      {tab === "analysis" && (
        <>
          {/* Agent pipeline flow */}
          <AgentPipeline summary={summary} allOk={allOk} genome={genome} parseMs={parseMs} matchMs={matchMs} />

          {/* Category breakdown */}
          {summary.coveredCount > 0 && (
            <CategoryBreakdown breakdown={summary.breakdown} />
          )}

          {/* AI synthesis */}
          <div className="border-t border-white/10 pt-4">
            {synthState === "idle" && (
              <button
                onClick={synthesize}
                className="w-full rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2.5 text-sm font-medium text-indigo-200 hover:bg-indigo-500/20 transition-colors"
              >
                ✦ Synthesize with AI — plain-language overview
              </button>
            )}

            {synthState === "loading" && (
              <div className="flex items-center justify-center gap-2 py-3">
                <span className="inline-block h-3 w-3 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                <span className="text-sm text-white/45">Synthesizing…</span>
              </div>
            )}

            {synthState === "done" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
                    ✦ AI synthesis
                  </span>
                  <span className="text-[10px] text-white/25">
                    Cloudflare Workers AI · educational only, not medical advice
                  </span>
                </div>
                <div className="rounded-lg border border-indigo-500/15 bg-indigo-500/5 px-4 py-3">
                  <p className="text-sm leading-relaxed text-white/85 whitespace-pre-wrap">
                    {synthesis}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSynthState("idle");
                    setSynthesis("");
                  }}
                  className="text-xs text-white/30 hover:text-white/60 underline decoration-dotted"
                >
                  clear
                </button>
              </div>
            )}

            {synthState === "error" && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/8 px-3 py-3 space-y-2">
                <p className="text-xs text-red-300">{synthErr}</p>
                <button
                  onClick={() => setSynthState("idle")}
                  className="text-xs text-white/45 hover:text-white/75 underline decoration-dotted"
                >
                  retry
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

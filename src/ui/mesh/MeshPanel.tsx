import { useMemo, useState, useEffect, useRef } from "react";
import type { Finding } from "../../analysis/types";
import {
  reviewAllFindings,
  buildMeshSummary,
  type MeshSummary,
} from "../../analysis/mesh-review";
import type { ParsedGenome } from "../../parse/types";
import { useGenomeStore, type MeshEvent } from "../../state/store";
import { MeshCanvas } from "./MeshCanvas";
import { ObservabilityPanel } from "./ObservabilityPanel";

interface Props {
  genome: ParsedGenome;
  findings: Finding[];
}

type SynthState = "idle" | "loading" | "done" | "error";
type Verdict = "allow" | "revise" | "deny";

// ── Shared sub-components ─────────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const styles: Record<Verdict, string> = {
    allow: "bg-emerald-500/10 border-emerald-500/25 text-emerald-400",
    revise: "bg-amber-500/10 border-amber-500/25 text-amber-400",
    deny: "bg-red-500/10 border-red-500/25 text-red-400",
  };
  const labels: Record<Verdict, string> = { allow: "✓ allow", revise: "⚠ revise", deny: "✕ deny" };
  return (
    <span className={`flex-shrink-0 rounded border px-1.5 py-px text-[10px] font-bold ${styles[verdict]}`}>
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

// ── Real agent pipeline display ───────────────────────────────────────────────

const AGENT_META: Record<string, { icon: string; role: string }> = {
  "privacy-warden": { icon: "🔒", role: "guard" },
  "kb-curator": { icon: "📚", role: "enrich" },
  oracle: { icon: "◈", role: "review" },
  "parser-smith": { icon: "⚙", role: "parse" },
  "ui-polisher": { icon: "✦", role: "render" },
};

function MeshEventFeed({ events, status }: { events: MeshEvent[]; status: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  if (status === "idle") return null;

  const statusColor =
    status === "done" ? "text-emerald-400" :
    status === "error" ? "text-red-400" :
    "text-indigo-300";

  const statusLabel =
    status === "running" ? "Agent mesh running…" :
    status === "done" ? "Pipeline complete" :
    "Pipeline error";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-[10px] uppercase tracking-wider font-medium text-white/30">
          Live agent pipeline
        </p>
        <span className={`text-[10px] font-semibold ${statusColor}`}>
          {status === "running" && (
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-400 animate-pulse mr-1" />
          )}
          {statusLabel}
        </span>
      </div>

      <div className="rounded-xl border border-white/8 bg-black/20 max-h-72 overflow-y-auto text-xs font-mono space-y-px p-2">
        {events.map((event, i) => (
          <EventLine key={i} event={event} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function EventLine({ event }: { event: MeshEvent }) {
  if (event.type === "agent-start") {
    const meta = AGENT_META[event.agent];
    return (
      <div className="flex items-start gap-2 py-0.5">
        <span className="text-white/25 shrink-0 w-20">{event.agent}</span>
        <span className="text-indigo-300/80">{meta?.icon ?? "→"} {event.summary}</span>
      </div>
    );
  }
  if (event.type === "tool-call") {
    return (
      <div className="flex items-start gap-2 py-0.5 pl-2">
        <span className="text-white/25 shrink-0 w-20">tool</span>
        <span className="text-blue-300/70">
          → {event.tool}({Object.entries(event.input).map(([k, v]) => `${k}="${v}"`).join(", ")})
        </span>
      </div>
    );
  }
  if (event.type === "tool-result") {
    const r = event.result as Record<string, unknown> | null;
    const summary = r
      ? r.notFound
        ? "not found"
        : [
            r.clinvarSignificance ? `ClinVar: ${r.clinvarSignificance}` : null,
            r.gnomadAf != null ? `AF: ${(r.gnomadAf as number).toFixed(3)}` : null,
            r.summary ? `gene summary available` : null,
            r.fetched != null ? `batch: ${r.found}/${r.fetched} found` : null,
          ].filter(Boolean).join(" · ") || "ok"
      : "null";
    return (
      <div className="flex items-start gap-2 py-0.5 pl-2">
        <span className="text-white/25 shrink-0 w-20">result</span>
        <span className="text-emerald-300/60">← {summary}</span>
      </div>
    );
  }
  if (event.type === "oracle-ruling") {
    const verdictColor =
      event.verdict === "allow" ? "text-emerald-400" :
      event.verdict === "revise" ? "text-amber-400" :
      "text-red-400";
    const label = event.rsid ? `${event.rsid}` : (event.agent ?? "oracle");
    return (
      <div className="flex items-start gap-2 py-0.5">
        <span className="text-white/25 shrink-0 w-20">oracle</span>
        <span>
          <span className="text-white/50">{label}</span>
          {" → "}
          <span className={`font-bold ${verdictColor}`}>{event.verdict}</span>
          {event.reason && <span className="text-white/30 ml-1">({event.reason.slice(0, 60)})</span>}
        </span>
      </div>
    );
  }
  if (event.type === "agent-done") {
    return (
      <div className="flex items-start gap-2 py-0.5">
        <span className="text-white/25 shrink-0 w-20">{event.agent}</span>
        <span className="text-emerald-300/80">✓ {event.summary}</span>
      </div>
    );
  }
  if (event.type === "agent-text") {
    return (
      <div className="flex items-start gap-2 py-0.5 pl-2">
        <span className="text-white/25 shrink-0 w-20">reasoning</span>
        <span className="text-white/40 italic">{event.text.slice(0, 120)}</span>
      </div>
    );
  }
  if (event.type === "pipeline-done") {
    const s = event.stats;
    return (
      <div className="flex items-start gap-2 py-0.5 border-t border-white/8 mt-1 pt-1">
        <span className="text-white/25 shrink-0 w-20">pipeline</span>
        <span className="text-emerald-200 font-semibold">
          ✓ done — {s.enriched} enriched · {s.allowed} approved · {s.denied} denied · {s.toolCalls} tool calls
        </span>
      </div>
    );
  }
  if (event.type === "pipeline-blocked") {
    return (
      <div className="flex items-start gap-2 py-0.5">
        <span className="text-white/25 shrink-0 w-20">pipeline</span>
        <span className="text-red-400">✕ blocked — {event.reason}</span>
      </div>
    );
  }
  if (event.type === "error") {
    return (
      <div className="flex items-start gap-2 py-0.5">
        <span className="text-white/25 shrink-0 w-20">error</span>
        <span className="text-red-400">{event.message}</span>
      </div>
    );
  }
  return null;
}

// ── Enrichment summary cards ──────────────────────────────────────────────────

function EnrichmentCards({
  enrichments,
}: {
  enrichments: Record<string, { rsid: string; clinvarSignificance: string | null; gnomadAf: number | null; pharmgkbId: string | null }>;
}) {
  const entries = Object.values(enrichments).filter(
    (e) => e.clinvarSignificance || e.gnomadAf != null || e.pharmgkbId,
  );
  if (!entries.length) return null;

  return (
    <div>
      <p className="mb-2 text-[10px] uppercase tracking-wider font-medium text-white/30">
        Live enrichment from MyVariant.info · {entries.length} variants
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {entries.slice(0, 12).map((e) => (
          <div key={e.rsid} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 space-y-0.5">
            <p className="text-xs font-mono text-white/70">{e.rsid}</p>
            {e.clinvarSignificance && (
              <p className="text-[10px] text-white/45">
                ClinVar: <span className="text-white/65">{e.clinvarSignificance}</span>
              </p>
            )}
            {e.gnomadAf != null && (
              <p className="text-[10px] text-white/45">
                gnomAD AF: <span className="text-white/65">{e.gnomadAf.toFixed(4)}</span>
              </p>
            )}
            {e.pharmgkbId && (
              <p className="text-[10px] text-white/45">
                PharmGKB: <span className="text-blue-300/70">{e.pharmgkbId}</span>
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Local agent pipeline (browser-side Oracle) ────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  "23andme": "23andMe",
  ancestry: "AncestryDNA",
  myheritage: "MyHeritage",
  vcf: "VCF",
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

function LocalPipeline({
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
      detail: "genome stays local · only rsids sent to enrichment APIs",
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
        Local pipeline · browser-side Oracle
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
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={`text-xs font-mono font-semibold ${
                      step.isOracle
                        ? allOk ? "text-emerald-200" : "text-amber-200"
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
  const entries = Object.entries(breakdown) as [string, { A: number; B: number; C: number }][];
  if (!entries.length) return null;

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
            <div key={cat} className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2.5">
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
                            tier === "A" ? "bg-emerald-500" : tier === "B" ? "bg-blue-400" : "bg-white/25"
                          }`}
                          style={{ width: `${(count / max) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-white/40 w-4 text-right shrink-0">{count}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs font-semibold text-white/55 mt-2">{total} total</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MeshPanel({ genome, findings }: Props) {
  const [tab, setTab] = useState<"analysis" | "trace" | "mesh">("analysis");
  const [synthState, setSynthState] = useState<SynthState>("idle");
  const [synthesis, setSynthesis] = useState("");
  const [synthErr, setSynthErr] = useState("");

  const parseMs = useGenomeStore((s) => s.parseMs);
  const matchMs = useGenomeStore((s) => s.matchMs);
  const sessionStart = useGenomeStore((s) => s.sessionStart);
  const fileName = useGenomeStore((s) => s.fileName);
  const meshEvents = useGenomeStore((s) => s.meshEvents);
  const meshStatus = useGenomeStore((s) => s.meshStatus);
  const meshEnrichments = useGenomeStore((s) => s.meshEnrichments);

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
          totals: { parsed: summary.parsedCount, matched: summary.matchedCount, covered: summary.coveredCount },
          breakdown: summary.breakdown,
        }),
      });
      const data = (await res.json()) as { synthesis?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `Server error ${res.status}`);
      const text = (data.synthesis ?? "").trim();
      if (!text) throw new Error("AI returned an empty response — try again in a moment.");
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
            {meshStatus === "done" && Object.keys(meshEnrichments).length > 0 && (
              <span className="text-emerald-400/70 ml-1">
                · {Object.keys(meshEnrichments).length} enriched live
              </span>
            )}
          </p>
        </div>
        <OracleHeader allOk={allOk} allowCount={summary.allowCount} flaggedCount={summary.flaggedCount} />
      </div>

      {/* Tab buttons */}
      <div className="flex gap-1 border-b border-white/8 pb-0">
        {(["analysis", "trace", "mesh"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
              tab === t
                ? "text-white/90 border-b-2 border-indigo-400 -mb-px"
                : "text-white/40 hover:text-white/65"
            }`}
          >
            {t === "analysis" ? "Analysis" : t === "trace" ? "Trace ✦" : "Mesh 🕸"}
          </button>
        ))}
      </div>

      {/* Mesh tab */}
      {tab === "mesh" && (
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-wider font-medium text-white/30">
            Live agent mesh · canvas rendering
          </p>
          <div className="rounded-xl border border-white/8 bg-black/20 overflow-hidden">
            <MeshCanvas allOk={allOk} />
          </div>
          <p className="mt-2 text-[10px] text-white/20">
            Nodes animate in sequence as your file is processed · particles flow along active edges
          </p>
        </div>
      )}

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

      {/* Analysis tab */}
      {tab === "analysis" && (
        <>
          {/* Live agent pipeline feed (real SSE events) */}
          <MeshEventFeed events={meshEvents} status={meshStatus} />

          {/* Local pipeline + browser Oracle */}
          <LocalPipeline
            summary={summary}
            allOk={allOk}
            genome={genome}
            parseMs={parseMs}
            matchMs={matchMs}
          />

          {/* Live enrichment cards (populated after pipeline-done) */}
          {Object.keys(meshEnrichments).length > 0 && (
            <EnrichmentCards enrichments={meshEnrichments} />
          )}

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
                  <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">✦ AI synthesis</span>
                  <span className="text-[10px] text-white/25">educational only, not medical advice</span>
                </div>
                <div className="rounded-lg border border-indigo-500/15 bg-indigo-500/5 px-4 py-3">
                  <p className="text-sm leading-relaxed text-white/85 whitespace-pre-wrap">{synthesis}</p>
                </div>
                <button
                  onClick={() => { setSynthState("idle"); setSynthesis(""); }}
                  className="text-xs text-white/30 hover:text-white/60 underline decoration-dotted"
                >
                  clear
                </button>
              </div>
            )}
            {synthState === "error" && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/8 px-3 py-3 space-y-2">
                <p className="text-xs text-red-300">{synthErr}</p>
                <button onClick={() => setSynthState("idle")} className="text-xs text-white/45 hover:text-white/75 underline decoration-dotted">
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

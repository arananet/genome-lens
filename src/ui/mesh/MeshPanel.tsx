import { useMemo, useState, useEffect, useRef } from "react";
import type { Finding } from "../../analysis/types";
import {
  reviewAllFindings,
  buildMeshSummary,
  type MeshSummary,
} from "../../analysis/mesh-review";
import type { ParsedGenome } from "../../parse/types";
import { useGenomeStore, type MeshEvent, type ClinvarHit } from "../../state/store";
import { MeshCanvas } from "./MeshCanvas";
import { ObservabilityPanel } from "./ObservabilityPanel";

interface Props {
  genome: ParsedGenome;
  findings: Finding[];
}

type SynthState = "idle" | "loading" | "done" | "error";

// ── Shared sub-components ─────────────────────────────────────────────────────

function OracleHeader({
  allOk,
  allowCount,
  flaggedCount,
  live,
}: {
  allOk: boolean;
  allowCount: number;
  flaggedCount: number;
  live: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-center min-w-[7rem] ${
        allOk
          ? "border-emerald-500/30 bg-emerald-500/8"
          : "border-amber-500/30 bg-amber-500/8"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wider text-white/35 font-medium">
        {live ? "Oracle · live" : "Oracle"}
      </p>
      <p className={`text-sm font-bold mt-0.5 ${allOk ? "text-emerald-300" : "text-amber-300"}`}>
        {allowCount} allow
        {flaggedCount > 0 && (
          <span className="ml-1 text-amber-400 font-normal text-xs">· {flaggedCount} flag</span>
        )}
      </p>
    </div>
  );
}

// Live status pill driven entirely by the real SSE pipeline state.
function PipelineStatus({ status }: { status: string }) {
  if (status === "idle") return null;
  const meta: Record<string, { label: string; color: string; pulse: boolean }> = {
    running: { label: "Agent mesh running…", color: "text-indigo-300", pulse: true },
    done: { label: "Pipeline complete", color: "text-emerald-400", pulse: false },
    error: { label: "Pipeline error", color: "text-red-400", pulse: false },
  };
  const m = meta[status] ?? meta.running;
  return (
    <span className={`text-[10px] font-semibold ${m.color} flex items-center gap-1`}>
      {m.pulse && <span className="inline-block h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />}
      {m.label}
    </span>
  );
}

// ── Real agent pipeline display ───────────────────────────────────────────────

const AGENT_META: Record<string, { icon: string; role: string }> = {
  "privacy-warden": { icon: "🔒", role: "guard" },
  "kb-curator": { icon: "📚", role: "enrich" },
  oracle: { icon: "◈", role: "review" },
  "cf-synthesizer": { icon: "✦", role: "summarize" },
};

function MeshEventFeed({ events, status }: { events: MeshEvent[]; status: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  if (status === "idle") return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider font-medium text-white/30">
        Event log · KB enrichment pass (rsids only) + ClinVar pathogenic pass
      </p>

      <div className="rounded-xl border border-white/8 bg-black/20 max-h-56 overflow-y-auto text-xs font-mono space-y-px p-2">
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

// ── Local parse summary (one line — parsing/matching happens in-browser) ──────

const SOURCE_LABEL: Record<string, string> = {
  "23andme": "23andMe",
  ancestry: "AncestryDNA",
  myheritage: "MyHeritage",
  vcf: "VCF",
  unknown: "Unknown",
};

function LocalSummaryLine({
  summary,
  genome,
  parseMs,
  matchMs,
}: {
  summary: MeshSummary;
  genome: ParsedGenome;
  parseMs: number;
  matchMs: number;
}) {
  const method = genome.method ? ` · ${genome.method}` : " · array-based SNP";
  return (
    <p className="text-[11px] text-white/35">
      🔒 Parsed locally in your browser — {summary.parsedCount.toLocaleString()} SNP positions ·{" "}
      {SOURCE_LABEL[genome.source] ?? genome.source}
      {method} · {parseMs}ms parse · {matchMs}ms KB match · only rsids leave the browser.
    </p>
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

// ── Full-genome ClinVar pathogenic scan results ───────────────────────────────

function ClinvarHitCard({ hit }: { hit: ClinvarHit }) {
  const isPathogenic = /^pathogenic$/i.test(hit.significance);
  return (
    <div
      className={`rounded-lg border px-3 py-2 space-y-0.5 ${
        isPathogenic ? "border-red-500/30 bg-red-500/8" : "border-amber-500/30 bg-amber-500/8"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono text-white/80">{hit.rsid}</span>
        <span
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
            isPathogenic ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"
          }`}
        >
          {hit.significance}
        </span>
      </div>
      {hit.gene && (
        <p className="text-[10px] text-white/45">
          Gene: <span className="text-white/65">{hit.gene}</span>
        </p>
      )}
      {hit.condition && (
        <p className="text-[10px] text-white/45 truncate">{hit.condition}</p>
      )}
    </div>
  );
}

function ClinvarHitsPanel() {
  const clinvarHits = useGenomeStore((s) => s.clinvarHits);
  const clinvarScanStatus = useGenomeStore((s) => s.clinvarScanStatus);
  const clinvarScanProgress = useGenomeStore((s) => s.clinvarScanProgress);

  if (clinvarScanStatus === "idle") return null;

  const pct = clinvarScanProgress && clinvarScanProgress.total > 0
    ? Math.round((clinvarScanProgress.scanned / clinvarScanProgress.total) * 100)
    : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider font-medium text-white/30">
          Full-genome ClinVar pathogenic scan
        </p>
        {clinvarScanStatus === "running" && (
          <span className="text-[10px] text-indigo-300 flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
            {clinvarScanProgress
              ? `${clinvarScanProgress.scanned.toLocaleString()} / ${clinvarScanProgress.total.toLocaleString()} rsids`
              : "scanning…"}
          </span>
        )}
        {clinvarScanStatus === "done" && (
          <span className="text-[10px] text-emerald-400">✓ complete · {clinvarHits.length} hit{clinvarHits.length !== 1 ? "s" : ""}</span>
        )}
        {clinvarScanStatus === "error" && (
          <span className="text-[10px] text-red-400">scan error</span>
        )}
      </div>

      {clinvarScanStatus === "running" && clinvarScanProgress && (
        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {clinvarHits.length > 0 && (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {clinvarHits.map((hit, i) => (
            <ClinvarHitCard key={`${hit.rsid}-${i}`} hit={hit} />
          ))}
        </div>
      )}

      {clinvarScanStatus === "done" && clinvarHits.length === 0 && (
        <p className="text-xs text-emerald-400/70">
          No pathogenic or likely pathogenic variants detected in your genome.
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MeshPanel({ genome, findings }: Props) {
  const [showTrace, setShowTrace] = useState(false);
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

  // Prefer the real server-side Oracle tally (from pipeline-done) once it
  // arrives; fall back to the local browser-side review before/without it.
  const pipelineDone = useMemo(
    () => meshEvents.find((e) => e.type === "pipeline-done") as
      Extract<MeshEvent, { type: "pipeline-done" }> | undefined,
    [meshEvents],
  );
  const liveOracle = pipelineDone
    ? { allowCount: pipelineDone.stats.allowed, flaggedCount: pipelineDone.stats.denied }
    : null;
  const allOk = (liveOracle ?? summary).flaggedCount === 0;

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
    <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white/90">Agent mesh analysis</p>
            <PipelineStatus status={meshStatus} />
          </div>
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
        <OracleHeader
          allOk={allOk}
          allowCount={(liveOracle ?? summary).allowCount}
          flaggedCount={(liveOracle ?? summary).flaggedCount}
          live={!!liveOracle}
        />
      </div>

      {/* Mesh visualization — always visible, driven by the real SSE stream */}
      <div>
        <div className="rounded-xl border border-white/8 bg-black/20 overflow-hidden">
          <MeshCanvas />
        </div>
        <p className="mt-1.5 text-[10px] text-white/20">
          Pass 1: 17-entry curated KB · Pass 2: pathogenic hits from full-genome ClinVar scan (all {summary.parsedCount.toLocaleString()} variants)
        </p>
      </div>

      {/* Real-time event log */}
      <MeshEventFeed events={meshEvents} status={meshStatus} />

      <LocalSummaryLine summary={summary} genome={genome} parseMs={parseMs} matchMs={matchMs} />

      {/* Live enrichment cards (populated after pipeline-done) */}
      {Object.keys(meshEnrichments).length > 0 && (
        <EnrichmentCards enrichments={meshEnrichments} />
      )}

      {/* Full-genome ClinVar pathogenic scan results */}
      <ClinvarHitsPanel />

      {/* Category breakdown */}
      {summary.coveredCount > 0 && <CategoryBreakdown breakdown={summary.breakdown} />}

      {/* Trace — deep technical view, collapsed by default */}
      <div className="border-t border-white/10 pt-3">
        <button
          onClick={() => setShowTrace((v) => !v)}
          className="text-xs font-medium text-white/40 hover:text-white/70 transition-colors"
        >
          {showTrace ? "▾" : "▸"} Trace ✦ — per-finding verdicts, sources, timing
        </button>
        {showTrace && (
          <div className="mt-3">
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
          </div>
        )}
      </div>

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
    </div>
  );
}

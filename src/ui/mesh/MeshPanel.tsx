import { useMemo, useState } from "react";
import type { Finding } from "../../analysis/types";
import { reviewAllFindings, buildMeshSummary } from "../../analysis/mesh-review";
import type { ParsedGenome } from "../../parse/types";

interface Props {
  genome: ParsedGenome;
  findings: Finding[];
}

type SynthState = "idle" | "loading" | "done" | "error";

const AGENT_ROWS = [
  { role: "parser-smith", icon: "⚙", label: "Parser" },
  { role: "kb-curator", icon: "📚", label: "KB curator" },
  { role: "privacy-warden", icon: "🔒", label: "Privacy warden" },
] as const;

export function MeshPanel({ genome, findings }: Props) {
  const [synthState, setSynthState] = useState<SynthState>("idle");
  const [synthesis, setSynthesis] = useState("");
  const [synthErr, setSynthErr] = useState("");

  const verdicts = useMemo(() => reviewAllFindings(findings), [findings]);
  const summary = useMemo(
    () => buildMeshSummary(genome.variantCount, findings, verdicts),
    [genome.variantCount, findings, verdicts],
  );

  const allOk = summary.flaggedCount === 0;

  async function synthesize() {
    setSynthState("loading");
    setSynthErr("");
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
      if (!res.ok || data.error) throw new Error(data.error ?? `Server error ${res.status}`);
      setSynthesis(data.synthesis ?? "");
      setSynthState("done");
    } catch (e) {
      setSynthErr(e instanceof Error ? e.message : "Request failed");
      setSynthState("error");
    }
  }

  return (
    <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white/90">Agent mesh analysis</p>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
            allOk
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/40 bg-amber-500/10 text-amber-300"
          }`}
        >
          Oracle: {allOk ? `${summary.allowCount} allow` : `${summary.flaggedCount} flagged`}
        </span>
      </div>

      <div className="space-y-2">
        <AgentRow
          icon={AGENT_ROWS[0].icon}
          label={AGENT_ROWS[0].label}
          detail={`Parsed ${summary.parsedCount.toLocaleString()} variants from your file`}
        />
        <AgentRow
          icon={AGENT_ROWS[1].icon}
          label={AGENT_ROWS[1].label}
          detail={`Matched ${summary.matchedCount} knowledge-base entries · ${summary.coveredCount} present in your file`}
        />
        <AgentRow
          icon={AGENT_ROWS[2].icon}
          label={AGENT_ROWS[2].label}
          detail="Genome data stayed on your device · no upload"
        />
      </div>

      {summary.coveredCount > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-white/50 uppercase tracking-wide">
            Covered variants by category
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(summary.breakdown) as [string, { A: number; B: number; C: number }][]).map(
              ([cat, tiers]) => {
                const total = tiers.A + tiers.B + tiers.C;
                return (
                  <span
                    key={cat}
                    className="rounded-full bg-white/5 border border-white/10 px-2.5 py-0.5 text-xs text-white/70"
                  >
                    {cat} · {total}
                  </span>
                );
              },
            )}
          </div>
        </div>
      )}

      <div className="border-t border-white/10 pt-3">
        {synthState === "idle" && (
          <button
            onClick={synthesize}
            className="w-full rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-200 hover:bg-indigo-500/20 transition-colors"
          >
            Synthesize with AI — get a plain-language overview ✦
          </button>
        )}
        {synthState === "loading" && (
          <p className="text-center text-sm text-white/50 py-1">Synthesizing…</p>
        )}
        {synthState === "done" && (
          <div className="space-y-2">
            <p className="text-xs text-white/40 uppercase tracking-wide font-medium">AI synthesis</p>
            <p className="text-sm leading-relaxed text-white/85">{synthesis}</p>
            <button
              onClick={() => { setSynthState("idle"); setSynthesis(""); }}
              className="text-xs text-white/40 hover:text-white/70 underline decoration-dotted"
            >
              clear
            </button>
          </div>
        )}
        {synthState === "error" && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
            <p className="text-xs text-red-300">{synthErr}</p>
            <button
              onClick={() => setSynthState("idle")}
              className="mt-1 text-xs text-white/50 hover:text-white/80 underline decoration-dotted"
            >
              retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentRow({ icon, label, detail }: { icon: string; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-base leading-none">{icon}</span>
      <div className="min-w-0">
        <span className="text-xs font-semibold text-white/70">{label}</span>
        <span className="mx-1.5 text-white/20">·</span>
        <span className="text-xs text-white/55">{detail}</span>
      </div>
    </div>
  );
}

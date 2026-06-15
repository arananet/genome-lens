import { useMemo, useState } from "react";
import type { Finding } from "../../analysis/types";
import { aiConfigured, contextFromFinding, explainVariant } from "../../ai/explain";
import { oracle } from "../../mesh/oracle";
import type { AgentAction } from "../../mesh/types";

// Opt-in per-request AI explainer.
// Before sending, the Oracle reviews the request in-browser to confirm no
// genome data is transmitted. The ruling is shown as a coloured badge.
export function AiExplainer({ finding }: { finding: Finding }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [showPayload, setShowPayload] = useState(false);

  const ctx = useMemo(() => contextFromFinding(finding), [finding]);

  const oracleAction: AgentAction = useMemo(
    () => ({
      agent: "privacy-warden",
      kind: "data-egress",
      summary: `Explain ${ctx.rsid} via Cloudflare Workers AI`,
      // transmitsGenome: false — we send only the single variant's public context
      // (rsid, gene, genotype, KB note), not the raw genome file.
      payload: { transmitsGenome: false },
    }),
    [ctx],
  );

  const ruling = useMemo(() => oracle.rule(oracleAction), [oracleAction]);

  if (!aiConfigured()) return null;

  async function run() {
    setState("loading");
    setErr("");
    try {
      const out = await explainVariant(ctx);
      setText(out);
      setState("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed");
      setState("error");
    }
  }

  const verdictBadge = {
    allow: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
    revise: "bg-amber-500/15 border-amber-500/40 text-amber-300",
    deny: "bg-red-500/15 border-red-500/40 text-red-300",
  }[ruling.verdict];

  const verdictIcon = { allow: "✓", revise: "⚠", deny: "✗" }[ruling.verdict];
  const verdictLabel = { allow: "Allow", revise: "Revise", deny: "Deny" }[ruling.verdict];

  return (
    <div className="rounded-lg border border-white/10 bg-white/3 p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-white/90">Plain-language explanation (AI)</p>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${verdictBadge}`}>
          <span aria-hidden="true">{verdictIcon}</span>
          Oracle: {verdictLabel}
        </span>
      </div>

      {ruling.verdict !== "allow" && (
        <p className="text-xs text-amber-200/80">
          {ruling.reason ?? "Oracle blocked this request."}
        </p>
      )}

      {ruling.verdict === "allow" && (
        <>
          <p className="text-xs text-white/55">
            Only this variant's public knowledge-base context is sent — never your genome file.
          </p>

          <div>
            <button
              onClick={() => setShowPayload((v) => !v)}
              className="text-xs text-indigo-400 hover:text-indigo-300 underline decoration-dotted"
            >
              {showPayload ? "hide" : "show"} what's sent
            </button>
            {showPayload && (
              <pre className="mt-1 overflow-x-auto rounded bg-black/40 p-2 text-[10px] leading-snug text-white/60">
                {JSON.stringify(ctx, null, 2)}
              </pre>
            )}
          </div>

          {state === "idle" && (
            <button
              onClick={run}
              className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 active:bg-indigo-700 transition-colors"
            >
              Explain in plain language
            </button>
          )}

          {state === "loading" && (
            <p className="text-sm text-white/60 text-center py-1">Thinking…</p>
          )}

          {state === "done" && (
            <div className="rounded-md bg-white/5 px-3 py-3 space-y-3">
              {(() => {
                const parts = text.split(/\n\n+/);
                const what = parts[0]?.trim() ?? "";
                const how  = parts.slice(1).join("\n\n").trim();
                return (
                  <>
                    {what && (
                      <div>
                        <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-white/30">
                          What this means
                        </p>
                        <p className="text-sm leading-relaxed text-white/88">{what}</p>
                      </div>
                    )}
                    {how && (
                      <>
                        <div className="border-t border-white/8" />
                        <div>
                          <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-indigo-400/80">
                            How to reduce risk / improve
                          </p>
                          <p className="text-sm leading-relaxed text-white/85">{how}</p>
                        </div>
                      </>
                    )}
                  </>
                );
              })()}
              <button
                onClick={() => { setState("idle"); setText(""); }}
                className="text-xs text-white/30 hover:text-white/60 underline decoration-dotted"
              >
                ask again
              </button>
            </div>
          )}

          {state === "error" && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
              <p className="text-xs text-red-300">{err}</p>
              <button
                onClick={() => setState("idle")}
                className="mt-1 text-xs text-white/50 hover:text-white/80 underline decoration-dotted"
              >
                retry
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

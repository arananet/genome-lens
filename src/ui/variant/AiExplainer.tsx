import { useState } from "react";
import type { Finding } from "../../analysis/types";
import { aiConfigured, contextFromFinding, explainVariant } from "../../ai/explain";

// Opt-in, per-request AI explainer. Before sending, it shows EXACTLY what will
// be transmitted (the public variant context) and requires an explicit click.
// The raw genome file is never sent.
export function AiExplainer({ finding }: { finding: Finding }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");

  if (!aiConfigured()) {
    return (
      <p className="text-xs text-white/50">
        AI explainer not configured for this deployment (set VITE_AI_WORKER_URL).
      </p>
    );
  }

  const ctx = contextFromFinding(finding);

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

  return (
    <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3">
      <p className="text-sm font-medium text-indigo-200">Explain this in plain language (AI)</p>
      <p className="mt-1 text-xs text-white/60">
        Opt-in. Only this variant’s public context is sent to Cloudflare Workers AI — never your
        genome file:
      </p>
      <pre className="mt-2 overflow-x-auto rounded bg-black/40 p-2 text-[11px] leading-snug text-white/70">
{JSON.stringify(ctx, null, 2)}
      </pre>

      {state === "idle" && (
        <button
          onClick={run}
          className="mt-2 rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-400"
        >
          Send this & explain
        </button>
      )}
      {state === "loading" && <p className="mt-2 text-sm text-white/70">Thinking…</p>}
      {state === "done" && (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/85">{text}</p>
      )}
      {state === "error" && (
        <p className="mt-2 text-sm text-red-300">Could not get an explanation: {err}</p>
      )}
    </div>
  );
}

import type { Finding } from "../analysis/types";

// Endpoint that proxies Workers AI. Defaults to /api/explain (served by the
// Express server on Railway). Override at build time with VITE_AI_WORKER_URL.
export const AI_WORKER_URL: string = import.meta.env.VITE_AI_WORKER_URL ?? "/api/explain";

export function aiConfigured(): boolean {
  return AI_WORKER_URL.trim().length > 0;
}

// The ONLY data sent to the worker: a single variant's already-public context.
// The raw genome file is never transmitted.
export interface VariantContext {
  rsid: string;
  gene: string;
  category: string;
  tier: string;
  genotype: string | null;
  interpretation: string;
  caveats: string;
}

export function contextFromFinding(f: Finding): VariantContext {
  return {
    rsid: f.entry.rsid,
    gene: f.entry.gene,
    category: f.entry.category,
    tier: f.entry.tier,
    genotype: f.genotype,
    interpretation: f.interpretation,
    caveats: f.entry.caveats,
  };
}

// Request a plain-language explanation from the worker. Sends only the public
// variant context above. Returns the model's text.
export async function explainVariant(ctx: VariantContext, signal?: AbortSignal): Promise<string> {
  const res = await fetch(AI_WORKER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ variant: ctx }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`AI service returned ${res.status}`);
  }
  const data = (await res.json()) as { explanation?: string; error?: string };
  if (data.error) throw new Error(data.error);
  return data.explanation ?? "";
}

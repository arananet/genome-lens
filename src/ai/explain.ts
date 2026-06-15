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
  copies: number | null;
  effect: { metric: string; value?: number; unit?: string } | null;
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
    copies: f.copies,
    effect: f.entry.effect ?? null,
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
  const data = (await res.json()) as { explanation?: string; error?: string };
  if (!res.ok || data.error) {
    throw new Error(data.error ?? `AI service returned ${res.status}`);
  }
  return data.explanation ?? "";
}

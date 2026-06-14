// Cloudflare Worker: plain-language explainer backed by Workers AI.
//
// Privacy contract: this worker only ever receives a single variant's PUBLIC
// context (rsid, gene, genotype, the knowledge-base interpretation + caveats).
// It never receives the user's raw genome file. It does not log request bodies.

export interface Env {
  AI: Ai;
  // Comma-separated list of allowed origins for CORS (e.g. your Railway URL).
  ALLOWED_ORIGINS?: string;
}

interface VariantContext {
  rsid: string;
  gene: string;
  category: string;
  tier: string;
  genotype: string | null;
  interpretation: string;
  caveats: string;
}

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowOrigin =
    allowed.includes("*") || (origin && allowed.includes(origin)) ? origin ?? "*" : allowed[0] ?? "*";
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json",
  };
}

function buildPrompt(v: VariantContext): string {
  return [
    "You are a careful science communicator explaining a single genetic variant to a layperson.",
    "Rules: educational only, never diagnostic. Do not invent statistics, odds ratios, or risks.",
    "Stay within the provided context. Be honest about uncertainty and small effect sizes.",
    "Keep it to 3-5 short sentences. End by reminding the reader to confirm any actionable finding with a clinician.",
    "",
    `Variant: ${v.rsid} in gene ${v.gene}.`,
    `Category: ${v.category}. Evidence tier: ${v.tier}.`,
    `Reported genotype: ${v.genotype ?? "not covered"}.`,
    `Knowledge-base interpretation: ${v.interpretation}`,
    `Caveat: ${v.caveats}`,
  ].join("\n");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin");
    const headers = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
    }

    let body: { variant?: VariantContext };
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers });
    }

    const v = body.variant;
    if (!v || !v.rsid || !v.gene) {
      return new Response(JSON.stringify({ error: "Missing variant context" }), { status: 400, headers });
    }

    try {
      const result = (await env.AI.run(MODEL, {
        messages: [
          { role: "system", content: "You explain genetics honestly and never diagnose." },
          { role: "user", content: buildPrompt(v) },
        ],
        max_tokens: 320,
      })) as { response?: string };

      return new Response(JSON.stringify({ explanation: result.response ?? "" }), { status: 200, headers });
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI inference failed";
      return new Response(JSON.stringify({ error: message }), { status: 502, headers });
    }
  },
};

// Minimal Workers AI binding type (avoids depending on @cloudflare/workers-types).
interface Ai {
  run(model: string, input: unknown): Promise<unknown>;
}

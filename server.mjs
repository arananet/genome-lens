// Express server for Railway: serves the Vite SPA and proxies AI requests
// to Cloudflare Workers AI using CF_ACCOUNT_ID + CF_API_TOKEN from the environment.
import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  ensureDataDirs,
  seedWiki,
  synthCacheKey,
  readSynthCache,
  writeSynthCache,
  listResults,
  readOracleLog,
  listGlossary,
  readGlossaryPage,
} from "./storage.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 3000;
const MODEL = "@cf/nvidia/nemotron-3-120b-a12b";

// ── Startup: ensure volume directories exist and seed wiki ────────────────────

ensureDataDirs();
seedWiki();

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "dist")));

// ── AI endpoints ──────────────────────────────────────────────────────────────

app.post("/api/explain", async (req, res) => {
  const v = req.body?.variant;
  if (!v?.rsid || !v?.gene) {
    return res.status(400).json({ error: "Missing variant context" });
  }

  const result = await cfAiRun({
    messages: [
      {
        role: "system",
        content:
          "You are a careful science communicator. Explain genetics honestly, never diagnose, never invent statistics.",
      },
      { role: "user", content: buildExplainPrompt(v) },
    ],
  });
  if (result.error) return res.status(result.status).json({ error: result.error });
  return res.json({ explanation: result.data?.response ?? "" });
});

app.post("/api/synthesize", async (req, res) => {
  const { totals, breakdown } = req.body ?? {};
  if (!totals || !breakdown) {
    return res.status(400).json({ error: "Missing totals or breakdown" });
  }

  // Return cached result for identical requests
  const cacheKey = synthCacheKey(req.body);
  const cached = readSynthCache(cacheKey);
  if (cached) {
    console.log(`[synthesize] cache hit: ${cacheKey}`);
    return res.json({ synthesis: cached.synthesis, cached: true });
  }

  const result = await cfAiRun({
    messages: [
      {
        role: "system",
        content:
          "You are a science communicator. Summarise genomics findings in plain language. Educational only, never diagnostic, no risk percentages.",
      },
      { role: "user", content: buildSynthesisPrompt(totals, breakdown) },
    ],
  });
  if (result.error) return res.status(result.status).json({ error: result.error });

  const synthesis = result.data?.response ?? "";
  // Cache only the AI text — no user-derived genomic counts stored permanently.
  writeSynthCache(cacheKey, {
    key: cacheKey,
    createdAt: new Date().toISOString(),
    synthesis,
  });

  return res.json({ synthesis });
});

// ── Storage read endpoints ────────────────────────────────────────────────────

app.get("/api/oracle/log", (_req, res) => {
  res.json({ log: readOracleLog(50) });
});

app.get("/api/results", (_req, res) => {
  res.json({ results: listResults(50) });
});

app.get("/api/wiki/glossary", (_req, res) => {
  res.json({ glossary: listGlossary() });
});

app.get("/api/wiki/glossary/:slug", (req, res) => {
  const page = readGlossaryPage(req.params.slug);
  if (!page) return res.status(404).json({ error: "Not found" });
  return res.json(page);
});

// ── SPA fallback (must come last) ─────────────────────────────────────────────

app.get("*", (_req, res) => {
  res.sendFile(join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => console.log(`genome-lens on :${PORT}`));

// ── Cloudflare Workers AI helper ──────────────────────────────────────────────

async function cfAiRun(body) {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  if (!accountId || !apiToken) {
    return { error: "AI service not configured on this server", status: 503 };
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`;
  let cfRes;
  try {
    cfRes = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { error: `Network error: ${err.message}`, status: 502 };
  }

  if (!cfRes.ok) {
    const text = await cfRes.text().catch(() => "");
    return { error: `Cloudflare API ${cfRes.status}: ${text}`, status: 502 };
  }

  const json = await cfRes.json();
  console.log(
    "[CF API]",
    JSON.stringify({
      success: json.success,
      resultKeys: Object.keys(json.result ?? {}),
      sample: String(json.result?.response ?? "").slice(0, 120),
    }),
  );
  return { data: json.result };
}

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildExplainPrompt(v) {
  return [
    `Explain this genetic variant in 3-5 short sentences for a layperson.`,
    `Variant: ${v.rsid} in gene ${v.gene}.`,
    `Category: ${v.category}. Evidence tier: ${v.tier}.`,
    `Reported genotype: ${v.genotype ?? "not covered"}.`,
    `Knowledge-base note: ${v.interpretation}`,
    `Caveat: ${v.caveats}`,
    `End with a reminder to confirm any actionable finding with a clinician.`,
  ].join("\n");
}

function buildSynthesisPrompt(totals, breakdown) {
  const lines = [
    `Write 2-3 sentences summarising what a personal genomics scan found.`,
    `Scanned ${totals.parsed?.toLocaleString() ?? "?"} variants; ${totals.covered ?? "?"} matched the knowledge base.`,
    "Categories and evidence-tier counts (Tier A = strongest evidence):",
  ];
  for (const [cat, tiers] of Object.entries(breakdown)) {
    const total = (tiers.A ?? 0) + (tiers.B ?? 0) + (tiers.C ?? 0);
    lines.push(`  ${cat}: ${total} (A:${tiers.A ?? 0} B:${tiers.B ?? 0} C:${tiers.C ?? 0})`);
  }
  lines.push("Remind the reader this is a screening tool, not medical advice.");
  return lines.join("\n");
}

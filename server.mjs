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
          "You are a precise science communicator for a personal genomics tool. Be concrete and specific — never vague. Give actionable, evidence-grounded lifestyle guidance. Never diagnose. Never invent statistics or odds ratios.",
      },
      { role: "user", content: buildExplainPrompt(v) },
    ],
  });
  if (result.error) return res.status(result.status).json({ error: result.error });
  return res.json({ explanation: result.responseText ?? "" });
});

app.post("/api/phenotype-rank", async (req, res) => {
  const { phenotype, findings } = req.body ?? {};
  if (typeof phenotype !== "string" || phenotype.trim().length === 0) {
    return res.status(400).json({ error: "phenotype must be a non-empty string" });
  }
  if (!Array.isArray(findings) || findings.length === 0 || findings.length > 50) {
    return res.status(400).json({ error: "findings must be an array of 1-50 items" });
  }

  const findingLines = findings.map((f, i) =>
    `${i + 1}. rsid=${f.rsid} gene=${f.gene} category=${f.category} tier=${f.tier} note="${f.interpretation}"`
  ).join("\n");

  const result = await cfAiRun({
    messages: [
      {
        role: "system",
        content: "You are a clinical genomics assistant. Output ONLY valid JSON. No explanations outside the JSON.",
      },
      {
        role: "user",
        content: [
          `A patient presents with: "${phenotype.trim()}"`,
          ``,
          `Rank each of the following genetic findings by relevance to that phenotype.`,
          `Return a JSON array where each element has:`,
          `  "rsid": string`,
          `  "relevanceScore": number from 0 (no relevance) to 10 (highly relevant)`,
          `  "reason": one sentence explaining the relevance or lack thereof`,
          ``,
          `Findings:`,
          findingLines,
          ``,
          `Output ONLY the JSON array, no other text.`,
        ].join("\n"),
      },
    ],
  });

  if (result.error) return res.status(result.status ?? 502).json({ error: result.error });

  try {
    const text = (result.responseText ?? "").trim();
    // Strip markdown code fences if present
    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const ranked = JSON.parse(clean);
    if (!Array.isArray(ranked)) throw new Error("Not an array");
    return res.json({ ranked });
  } catch {
    return res.status(502).json({ error: "AI returned invalid JSON", raw: result.responseText?.slice(0, 200) });
  }
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

  const synthesis = result.responseText ?? "";
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
  const result = json.result ?? json;
  const responseText = extractResponseText(result);
  console.log(
    "[CF API]",
    JSON.stringify({
      success: json.success,
      resultKeys: typeof result === "object" ? Object.keys(result) : typeof result,
      responseText: responseText.slice(0, 200),
    }),
  );
  return { data: result, responseText };
}

// ── Response text extraction ──────────────────────────────────────────────────
// Different CF Workers AI models return text in different fields.

function extractResponseText(result) {
  if (!result) return "";
  // Standard chat models (llama, nemotron, gemma)
  if (typeof result.response === "string") return result.response;
  // Some models use generated_text
  if (typeof result.generated_text === "string") return result.generated_text;
  // OpenAI-compatible choices format
  const choice = Array.isArray(result.choices) ? result.choices[0] : null;
  if (choice?.message?.content) return String(choice.message.content);
  if (typeof choice?.text === "string") return choice.text;
  // Array result
  if (Array.isArray(result) && result[0]?.response) return String(result[0].response);
  return "";
}

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildExplainPrompt(v) {
  const tierDesc = { A: "strong, replicated evidence", B: "moderate evidence", C: "limited or preliminary evidence" }[v.tier] ?? "limited evidence";

  const copiesLine = (v.copies !== null && v.copies !== undefined)
    ? `This person carries ${v.copies} cop${v.copies === 1 ? "y" : "ies"} of the effect allele.`
    : "";

  const effectLine = v.effect?.metric === "OR" && v.effect.value !== undefined
    ? `Published odds ratio: ${v.effect.value}${v.effect.unit ? " " + v.effect.unit : ""}.`
    : v.effect?.metric === "beta" && v.effect.value !== undefined
      ? `Published effect size (beta): ${v.effect.value}${v.effect.unit ? " " + v.effect.unit : ""}.`
      : "";

  return [
    `You are explaining a personal genomics result to a curious non-expert. Be specific and genuinely useful — never vague.`,
    ``,
    `DATA:`,
    `Variant: ${v.rsid}  Gene: ${v.gene}  Category: ${v.category}`,
    `Genotype: ${v.genotype ?? "not tested"}. ${copiesLine}`,
    `Evidence tier: ${v.tier} (${tierDesc}).`,
    effectLine,
    `Knowledge-base finding: ${v.interpretation}`,
    `KB caveat: ${v.caveats}`,
    ``,
    `TASK: Write exactly two paragraphs separated by a single blank line.`,
    ``,
    `Paragraph 1 — WHAT THIS MEANS:`,
    `State concretely what this specific genotype implies for this person — not what the gene does in general. Does this result suggest higher risk, lower risk, or typical? By roughly how much if the evidence supports a number? If the person carries 0 copies of the effect allele, explain what not having it means. 3-4 sentences.`,
    ``,
    `Paragraph 2 — HOW TO REDUCE RISK OR IMPROVE:`,
    `Give 3-4 specific, actionable recommendations tailored to this variant's category and gene. NOT generic advice. Examples: for fitness/body-composition — name specific training types, frequency, or nutritional strategies linked to this gene. For disease-risk — name screening schedules, dietary patterns (Mediterranean, low-saturated-fat, etc.), or specific behaviours with known benefit. For pharmacogenomic — describe what the prescriber should know. For vision — protective behaviours with evidence. End with one sentence: state the evidence tier and recommend professional confirmation before changing medications or undergoing clinical screening.`,
    ``,
    `Rules: plain language, no markdown, no bullet lists, no invented statistics, no headers inside the text.`,
  ].filter(Boolean).join("\n");
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

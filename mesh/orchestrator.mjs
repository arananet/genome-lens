// Real agent orchestrator using Cloudflare Workers AI + direct genomics API calls.
// No Anthropic SDK — everything goes through the CF credentials already in use.
//
// Pipeline:
//   privacy-warden  → Oracle check: no genotypes in request
//   kb-curator      → concurrent batched MyVariant.info + parallel MyGene.info
//   oracle          → deterministic rule check on each enriched finding
//   cf-synthesizer  → CF Workers AI: brief plain-language enrichment summary
//
// Privacy: only rsids + public KB metadata (gene, category, tier) leave the browser.
// No genotypes, no raw file content, ever.

import { batchLookupVariants, lookupGene } from "./tools.mjs";
import { oracleRule } from "./oracle.mjs";

const CF_MODEL = "@cf/nvidia/nemotron-3-120b-a12b";

// MyVariant.info supports up to 1000 ids per POST; we batch at 200 with up to 5 concurrent.
const LOOKUP_BATCH_SIZE   = 200;
const LOOKUP_CONCURRENCY  = 5;
// Oracle bulk mode: don't flood the SSE stream with per-rsid events when set is large.
const ORACLE_BULK_THRESHOLD = 20;
// Cap gene lookups; run them all in parallel.
const GENE_LOOKUP_CAP = 20;

async function cfAiRun(accountId, apiToken, messages) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_MODEL}`;
  let r;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
  } catch (err) {
    return { error: `Network error: ${err.message}` };
  }
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    return { error: `CF API ${r.status}: ${text}` };
  }
  const json = await r.json();
  const result = json.result ?? json;
  const text =
    typeof result?.response === "string" ? result.response :
    typeof result?.generated_text === "string" ? result.generated_text :
    (Array.isArray(result?.choices) ? result.choices[0]?.message?.content ?? "" : "");
  return { text };
}

// Batch rsids into groups of LOOKUP_BATCH_SIZE and run LOOKUP_CONCURRENCY groups at a time.
async function concurrentBatchLookup(rsids) {
  const batches = [];
  for (let i = 0; i < rsids.length; i += LOOKUP_BATCH_SIZE) {
    batches.push(rsids.slice(i, i + LOOKUP_BATCH_SIZE));
  }

  const variantData = {};
  for (let i = 0; i < batches.length; i += LOOKUP_CONCURRENCY) {
    const group = batches.slice(i, i + LOOKUP_CONCURRENCY);
    const results = await Promise.all(group.map((b) => batchLookupVariants(b)));
    for (const result of results) {
      Object.assign(variantData, result);
    }
  }
  return variantData;
}

export async function* orchestrateMeshAnalysis(findingSummaries) {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  const hasCF = accountId && apiToken;

  // ── Step 1: privacy-warden pre-check ──────────────────────────────────────
  yield {
    type: "agent-start",
    agent: "privacy-warden",
    summary: `Checking ${findingSummaries.length} finding summaries — no genotypes allowed`,
  };

  const requestBody = findingSummaries.map((f) => f.rsid).join(",");
  const privacyRuling = oracleRule({
    agent: "privacy-warden",
    kind: "data-egress",
    summary: "Send rsids to MyVariant.info and MyGene.info",
    payload: { body: requestBody, transmitsGenome: false },
  });

  yield {
    type: "oracle-ruling",
    agent: "privacy-warden",
    verdict: privacyRuling.verdict,
    reason: privacyRuling.reason ?? "rsids are public identifiers — no genomic data transmitted.",
  };

  if (privacyRuling.verdict === "deny") {
    yield { type: "pipeline-blocked", reason: privacyRuling.reason };
    return;
  }

  // ── Step 2: kb-curator — concurrent batched variant lookup ─────────────────
  const rsids = findingSummaries.map((f) => f.rsid);
  const batchCount = Math.ceil(rsids.length / LOOKUP_BATCH_SIZE);

  yield {
    type: "agent-start",
    agent: "kb-curator",
    summary: `Querying MyVariant.info for ${rsids.length} variants in ${batchCount} batch${batchCount > 1 ? "es" : ""} (${Math.min(batchCount, LOOKUP_CONCURRENCY)} concurrent)…`,
  };

  yield {
    type: "tool-call",
    agent: "kb-curator",
    tool: "batch_lookup_variants",
    input: {
      rsids: rsids.length <= 6 ? rsids.join(",") : `${rsids.length} rsids`,
      fields: "clinvar,gnomad.af,pharmgkb,dbsnp.gene",
    },
  };

  const variantData = await concurrentBatchLookup(rsids);
  const found = Object.values(variantData).filter((v) => v && !v.notFound).length;

  yield {
    type: "tool-result",
    agent: "kb-curator",
    tool: "batch_lookup_variants",
    result: { fetched: rsids.length, found },
  };

  // ── Step 2b: parallel gene lookups ────────────────────────────────────────
  const geneSymbols = [
    ...new Set(
      findingSummaries
        .filter((f) =>
          f.category === "pharmacogenomics" ||
          f.category === "disease-risk" ||
          f.category === "health/disease",
        )
        .map((f) => f.gene)
        .filter(Boolean),
    ),
  ].slice(0, GENE_LOOKUP_CAP);

  const geneData = {};
  if (geneSymbols.length > 0) {
    yield {
      type: "tool-call",
      agent: "kb-curator",
      tool: "lookup_gene",
      input: { symbols: geneSymbols.join(","), count: geneSymbols.length },
    };

    const geneResults = await Promise.all(
      geneSymbols.map(async (symbol) => ({ symbol, result: await lookupGene(symbol) })),
    );
    for (const { symbol, result } of geneResults) {
      geneData[symbol] = result;
    }

    yield {
      type: "tool-result",
      agent: "kb-curator",
      tool: "lookup_gene",
      result: {
        fetched: geneSymbols.length,
        found: geneResults.filter((g) => g.result).length,
      },
    };
  }

  const toolCalls = 1 + (geneSymbols.length > 0 ? 1 : 0);

  yield {
    type: "agent-done",
    agent: "kb-curator",
    summary: `${toolCalls} MCP call${toolCalls > 1 ? "s" : ""} — ${found}/${rsids.length} variants annotated · ${Object.keys(geneData).length} genes fetched`,
  };

  // ── Step 3: Oracle reviews each enriched finding ───────────────────────────
  yield {
    type: "agent-start",
    agent: "oracle",
    summary: `Reviewing ${found} enriched findings against invariants…`,
  };

  const oracleResults = [];
  const approvedEnrichments = {};
  const bulk = found > ORACLE_BULK_THRESHOLD;

  for (const rsid of rsids) {
    const enrich = variantData[rsid];
    if (!enrich || enrich.notFound) continue;

    const ruling = oracleRule({
      agent: "kb-curator",
      kind: "kb-entry",
      summary: `Enriched finding for ${rsid}`,
      payload: {
        sources: [{ db: "MyVariant.info" }],
        tier: findingSummaries.find((f) => f.rsid === rsid)?.tier ?? "C",
        ...enrich,
      },
    });

    oracleResults.push({ rsid, verdict: ruling.verdict, reason: ruling.reason });
    if (ruling.verdict !== "deny") {
      approvedEnrichments[rsid] = enrich;
    }

    // In individual mode, yield per-rsid events; in bulk mode save events for denied only.
    if (!bulk) {
      yield {
        type: "oracle-ruling",
        rsid,
        verdict: ruling.verdict,
        reason: ruling.reason,
        invariant: ruling.invariant,
      };
    } else if (ruling.verdict === "deny") {
      yield {
        type: "oracle-ruling",
        rsid,
        verdict: ruling.verdict,
        reason: ruling.reason,
        invariant: ruling.invariant,
      };
    }
  }

  const allowCount = oracleResults.filter((r) => r.verdict === "allow").length;
  const denyCount  = oracleResults.filter((r) => r.verdict === "deny").length;

  if (bulk) {
    yield {
      type: "oracle-ruling",
      agent: "oracle",
      verdict: allowCount > denyCount ? "allow" : "revise",
      reason: `${allowCount} approved · ${denyCount} denied (bulk review of ${oracleResults.length} variants)`,
    };
  }

  // ── Step 4: CF Workers AI summary of enrichment ────────────────────────────
  if (hasCF && found > 0) {
    yield {
      type: "agent-start",
      agent: "cf-synthesizer",
      summary: "Generating enrichment summary via Cloudflare Workers AI…",
    };

    const topFindings = Object.entries(approvedEnrichments)
      .slice(0, 15)
      .map(([rsid, e]) => {
        const parts = [];
        if (e.clinvarSignificance) parts.push(`ClinVar: ${e.clinvarSignificance}`);
        if (e.gnomadAf != null) parts.push(`gnomAD AF: ${e.gnomadAf.toFixed(3)}`);
        if (e.pharmgkbId) parts.push("PharmGKB data available");
        return `${rsid} (${parts.join(", ") || "no annotation"})`;
      })
      .join("; ");

    const cfResult = await cfAiRun(accountId, apiToken, [
      {
        role: "system",
        content:
          "You are a genomics data summariser. Briefly describe what the live database enrichment revealed about a set of genetic variants. 1-2 sentences. Educational only, not diagnostic.",
      },
      {
        role: "user",
        content: `Summarise the enrichment for these variants: ${topFindings}`,
      },
    ]);

    if (cfResult.text) {
      yield { type: "agent-text", agent: "cf-synthesizer", text: cfResult.text };
    }
    if (cfResult.error) {
      yield { type: "agent-text", agent: "cf-synthesizer", text: `(CF AI unavailable: ${cfResult.error})` };
    }
  }

  yield {
    type: "pipeline-done",
    enrichments: approvedEnrichments,
    geneData,
    oracleResults,
    stats: { enriched: found, allowed: allowCount, denied: denyCount, toolCalls },
  };
}

// Real agent orchestrator using Anthropic Claude API with tool use.
// Yields SSE-ready event objects as it runs the multi-agent pipeline.
//
// Pipeline:
//   privacy-warden  → validate no genome data in request
//   kb-curator      → enrich findings via live genomics APIs (Claude + tool use)
//   oracle          → rule each enriched finding against the five invariants
//
// Privacy invariant: only rsids + public KB metadata (gene, category, tier)
// are sent to any external service. No genotypes, no raw file content.

import Anthropic from "@anthropic-ai/sdk";
import { TOOL_DEFS, executeTool, batchLookupVariants } from "./tools.mjs";
import { oracleRule } from "./oracle.mjs";

const MODEL = "claude-opus-4-8";
const MAX_TOOL_ROUNDS = 8;

const KB_CURATOR_SYSTEM = `\
You are kb-curator, a genomics knowledge-base enrichment agent in the genome-lens pipeline.
Your job: call the provided tools to look up live data for the given genetic findings.

Rules:
- Call lookup_variant for each rsid to get ClinVar significance, gnomAD allele frequency, PharmGKB data.
- Call lookup_gene for genes where a functional summary would add useful context (pharmacogenomics, disease genes).
- Make all calls you need, then stop. Do not generate explanatory prose — only tool calls.
- Never invent data. If a tool returns null, accept it and move on.
- Keep your tool calls efficient: batch by thinking about which rsids are highest priority (tier A > B > C).`;

// Async generator: yields event objects the SSE endpoint writes as "data:" lines.
export async function* orchestrateMeshAnalysis(findingSummaries) {
  // ── Validate config ────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    yield {
      type: "error",
      message: "ANTHROPIC_API_KEY is not configured. Set it as a Railway environment variable to enable real agent analysis.",
    };
    return;
  }

  const client = new Anthropic({ apiKey });

  // ── Step 1: privacy-warden pre-check ──────────────────────────────────────
  yield { type: "agent-start", agent: "privacy-warden", summary: `Checking ${findingSummaries.length} finding summaries for data-egress compliance…` };

  // Construct the body we're about to send (rsids only — public identifiers)
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

  // ── Step 1b: Pre-batch all variants from myvariant.info in one request ────
  // This primes the enrichment map before Claude starts calling tools,
  // so Claude's individual tool calls return near-instantly from cache.
  const rsids = findingSummaries.map((f) => f.rsid);
  yield { type: "agent-start", agent: "kb-curator", summary: `Pre-fetching ${rsids.length} variants from MyVariant.info…` };

  const batchResults = await batchLookupVariants(rsids);
  const batchHits = Object.values(batchResults).filter((v) => v && !v.notFound).length;
  yield {
    type: "tool-result",
    agent: "kb-curator",
    tool: "batch_lookup_variants",
    result: { fetched: rsids.length, found: batchHits },
  };

  // ── Step 2: kb-curator agent — Claude with real tool use ─────────────────
  const findingList = findingSummaries
    .map((f) => `- ${f.rsid} (gene: ${f.gene}, category: ${f.category}, tier: ${f.tier})`)
    .join("\n");

  const messages = [
    {
      role: "user",
      content: `Enrich the following genetic findings using the available tools.

Priority order: tier A first, then B, then C. Call lookup_variant for each rsid.
Call lookup_gene for genes in the pharmacogenomics or disease categories where a summary adds context.

Findings:
${findingList}

Make all necessary tool calls now.`,
    },
  ];

  const enrichments = { ...batchResults }; // Start with batch results
  const geneEnrichments = {};
  let toolCallCount = 0;

  let round = 0;
  let continueLoop = true;

  while (continueLoop && round < MAX_TOOL_ROUNDS) {
    round++;
    let response;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        thinking: { type: "adaptive" },
        system: KB_CURATOR_SYSTEM,
        tools: TOOL_DEFS,
        messages,
      });
    } catch (err) {
      yield { type: "error", message: `Claude API error: ${err.message}` };
      return;
    }

    // Emit text blocks (reasoning output)
    for (const block of response.content) {
      if (block.type === "text" && block.text?.trim()) {
        yield { type: "agent-text", agent: "kb-curator", text: block.text };
      }
    }

    // Collect and execute tool calls
    const toolBlocks = response.content.filter((b) => b.type === "tool_use");
    if (toolBlocks.length === 0) {
      continueLoop = false;
      break;
    }

    const toolResults = [];
    for (const block of toolBlocks) {
      toolCallCount++;
      yield { type: "tool-call", agent: "kb-curator", tool: block.name, input: block.input };

      const result = await executeTool(block.name, block.input);

      yield { type: "tool-result", agent: "kb-curator", tool: block.name, result };

      // Merge into enrichment maps
      if (block.name === "lookup_variant" && result && !result.notFound) {
        enrichments[block.input.rsid] = { ...enrichments[block.input.rsid], ...result };
      }
      if (block.name === "lookup_gene" && result) {
        geneEnrichments[block.input.symbol] = result;
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result ?? { error: "not found" }),
      });
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    if (response.stop_reason !== "tool_use") {
      continueLoop = false;
    }
  }

  const enrichedCount = Object.values(enrichments).filter((v) => v && !v.notFound).length;
  yield {
    type: "agent-done",
    agent: "kb-curator",
    summary: `${toolCallCount} tool calls · ${enrichedCount} variants enriched from live databases`,
  };

  // ── Step 3: Oracle reviews each enriched finding ───────────────────────────
  yield { type: "agent-start", agent: "oracle", summary: `Reviewing ${enrichedCount} enriched findings against invariants…` };

  const oracleResults = [];
  for (const rsid of rsids) {
    const enrich = enrichments[rsid];
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
    yield {
      type: "oracle-ruling",
      rsid,
      verdict: ruling.verdict,
      reason: ruling.reason,
      invariant: ruling.invariant,
    };
  }

  // Filter to Oracle-approved enrichments only
  const approvedEnrichments = {};
  for (const r of oracleResults) {
    if (r.verdict !== "deny") {
      approvedEnrichments[r.rsid] = enrichments[r.rsid];
    }
  }
  const geneData = geneEnrichments;

  const allowCount = oracleResults.filter((r) => r.verdict === "allow").length;
  const denyCount = oracleResults.filter((r) => r.verdict === "deny").length;

  yield {
    type: "pipeline-done",
    enrichments: approvedEnrichments,
    geneData,
    oracleResults,
    stats: { enriched: enrichedCount, allowed: allowCount, denied: denyCount, toolCalls: toolCallCount },
  };
}

// kb-curator agent — owns MCP tools (biothings-mcp) and LLM interpretation.
// The orchestrator delegates to this agent; the agent decides how to fetch
// and interpret data using its own MCP connections and LLM calls.

import { batchLookupVariants, lookupGene, mcpAvailable } from "../tools.mjs";

const CURATOR_BATCH_SIZE = 15;

export async function curatorFetchVariants(rsids, concurrentBatchLookup) {
  return concurrentBatchLookup(rsids);
}

export async function curatorFetchGenes(geneSymbols) {
  const geneData = {};
  const results = await Promise.all(
    geneSymbols.map(async (symbol) => ({ symbol, result: await lookupGene(symbol) })),
  );
  for (const { symbol, result } of results) {
    geneData[symbol] = result;
  }
  return { geneData, found: results.filter((g) => g.result).length };
}

export async function curatorDraftInterpretations(accountId, apiToken, cfAiRun, annotatedVariants, geneData) {
  const curatorBatches = [];
  for (let i = 0; i < annotatedVariants.length; i += CURATOR_BATCH_SIZE) {
    curatorBatches.push(annotatedVariants.slice(i, i + CURATOR_BATCH_SIZE));
  }

  const curatorNotes = {};
  for (const batch of curatorBatches) {
    const notes = await llmCuratorDraft(accountId, apiToken, cfAiRun, batch, geneData);
    Object.assign(curatorNotes, notes);
  }
  return curatorNotes;
}

export async function curatorRevise(accountId, apiToken, cfAiRun, rsid, originalText, reviseReason) {
  return llmReviseAttempt(accountId, apiToken, cfAiRun, rsid, originalText, reviseReason);
}

export { mcpAvailable };

// ── LLM calls (private to this agent) ───────────────────────────────────────

async function llmCuratorDraft(accountId, apiToken, cfAiRun, variantBatch, geneData) {
  const lines = variantBatch.map(({ rsid, data, gene }) => {
    const parts = [`${rsid}`];
    if (gene) parts.push(`gene=${gene}`);
    if (data.clinvarSignificance) parts.push(`ClinVar: ${data.clinvarSignificance}`);
    if (data.gnomadAf != null) parts.push(`gnomAD AF: ${data.gnomadAf.toFixed(4)}`);
    if (data.pharmgkbId) parts.push(`PharmGKB: ${data.pharmgkbId}`);
    const geneInfo = geneData[gene];
    if (geneInfo?.summary) parts.push(`gene function: ${geneInfo.summary.slice(0, 120)}`);
    return parts.join(" · ");
  });

  const result = await cfAiRun(accountId, apiToken, [
    {
      role: "system",
      content: [
        "You are a genomics knowledge curator. Given raw database annotations for genetic variants,",
        "draft brief educational interpretations. For EACH variant listed, write one line in the format:",
        "RSID: interpretation",
        "Keep each interpretation to 1-2 sentences. Focus on what the databases report.",
        "RULES: never diagnose, never state personal risk percentages, never invent statistics,",
        "never promise treatment or improvement. State associations and evidence quality only.",
      ].join(" "),
    },
    {
      role: "user",
      content: `Draft interpretations for these ${lines.length} variants:\n\n${lines.join("\n")}`,
    },
  ]);

  if (result.error) return {};

  const notes = {};
  const text = result.text ?? "";
  for (const line of text.split("\n")) {
    const match = line.match(/^(rs\d+)\s*:\s*(.+)/i);
    if (match) {
      notes[match[1]] = match[2].trim();
    }
  }
  return notes;
}

async function llmReviseAttempt(accountId, apiToken, cfAiRun, rsid, originalText, reviseReason) {
  const result = await cfAiRun(accountId, apiToken, [
    {
      role: "system",
      content: [
        "You are a genomics knowledge curator. You previously drafted an interpretation",
        "for a genetic variant, but the Oracle governance reviewer flagged it.",
        "Revise your text to address the concern. Keep it educational, 1-2 sentences.",
        "Never diagnose, never state risk percentages, never promise improvement.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Variant: ${rsid}`,
        `Your original text: "${originalText}"`,
        `Oracle feedback: "${reviseReason}"`,
        `Please provide a revised interpretation:`,
      ].join("\n"),
    },
  ]);
  if (result.error) return null;
  return (result.text ?? "").trim() || null;
}

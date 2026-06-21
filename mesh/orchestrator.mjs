// Real agent orchestrator — every agent is a genuine LLM call via Cloudflare
// Workers AI, not just regex/API plumbing. The Oracle combines deterministic
// invariant checks (hard floor, never overridden) with LLM-powered review
// that can trigger a real revise-and-resubmit loop.
//
// Pipeline:
//   privacy-warden  → regex pre-filter + LLM privacy audit
//   kb-curator      → concurrent MCP lookups + LLM interpretation drafting
//   oracle          → deterministic invariants + LLM nuance review + revise loop
//   cf-synthesizer  → LLM narrative synthesis from enriched data
//   ui-polisher     → LLM final copy polish for educational tone
//
// Privacy: only rsids + public KB metadata (gene, category, tier) leave the browser.
// No genotypes, no raw file content, ever.

import { batchLookupVariants } from "./tools.mjs";
import { oracleRule } from "./oracle.mjs";
import {
  curatorFetchVariants,
  curatorFetchGenes,
  curatorDraftInterpretations,
  curatorRevise,
  mcpAvailable,
} from "./agents/kb-curator.mjs";

const CF_MODEL = "@cf/nvidia/nemotron-3-120b-a12b";

const LOOKUP_BATCH_SIZE   = 200;
const LOOKUP_CONCURRENCY  = 5;
const ORACLE_BULK_THRESHOLD = 20;
const GENE_LOOKUP_CAP = 20;
const MAX_REVISE_ATTEMPTS = 1;

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

// ── LLM-powered privacy audit ────────────────────────────────────────────────

async function llmPrivacyAudit(accountId, apiToken, payload) {
  const result = await cfAiRun(accountId, apiToken, [
    {
      role: "system",
      content: [
        "You are a privacy auditor for a genomics application.",
        "Your job: inspect the payload below and determine whether it contains",
        "personal genotype data (e.g. 'AA', 'CT', specific allele calls),",
        "health records, or personally identifiable information.",
        "Respond with EXACTLY one word: SAFE or UNSAFE.",
        "If UNSAFE, add a colon and the reason. Example: 'UNSAFE: contains genotype AA for rs1234'.",
      ].join(" "),
    },
    { role: "user", content: `Payload to audit:\n${payload.slice(0, 2000)}` },
  ]);
  if (result.error) return { safe: true, note: `(LLM audit unavailable: ${result.error})` };
  const answer = (result.text ?? "").trim();
  if (/^UNSAFE/i.test(answer)) {
    return { safe: false, note: answer.replace(/^UNSAFE:?\s*/i, "").trim() || "LLM flagged payload as unsafe" };
  }
  return { safe: true, note: "LLM privacy audit passed" };
}

// ── LLM-powered Oracle review ────────────────────────────────────────────────

async function llmOracleReview(accountId, apiToken, agentTexts) {
  const numbered = agentTexts.map((t, i) => `[${i + 1}] ${t.rsid}: ${t.text}`).join("\n");
  const result = await cfAiRun(accountId, apiToken, [
    {
      role: "system",
      content: [
        "You are the Oracle, a strict governance reviewer for a genomics application.",
        "Review each numbered text below against these invariants:",
        "1. No diagnostic claims — no 'you have', 'you will develop', no personal risk percentages",
        "2. No vision improvement promises — never promise to fix/restore/improve eyesight",
        "3. Educational tone only — state associations, not causation",
        "4. No fabricated statistics — every number must come from the cited data",
        "5. No leaked genotypes — no personal allele calls like 'your genotype is AA'",
        "",
        "For each numbered item, respond with ONE line in the format:",
        "[N] ALLOW or [N] REVISE: reason or [N] DENY: reason",
        "Be strict but fair. Mere mention of a condition or gene function is fine.",
      ].join("\n"),
    },
    { role: "user", content: numbered },
  ]);

  if (result.error) return agentTexts.map((t) => ({ rsid: t.rsid, verdict: "allow", reason: `(LLM review unavailable: ${result.error})` }));

  const verdicts = [];
  const lines = (result.text ?? "").split("\n");
  for (const t of agentTexts) {
    const idx = agentTexts.indexOf(t) + 1;
    const line = lines.find((l) => l.includes(`[${idx}]`));
    if (!line) {
      verdicts.push({ rsid: t.rsid, verdict: "allow", reason: "No LLM verdict returned" });
      continue;
    }
    if (/DENY/i.test(line)) {
      verdicts.push({ rsid: t.rsid, verdict: "deny", reason: line.replace(/.*DENY:?\s*/i, "").trim() || "LLM denied" });
    } else if (/REVISE/i.test(line)) {
      verdicts.push({ rsid: t.rsid, verdict: "revise", reason: line.replace(/.*REVISE:?\s*/i, "").trim() || "LLM flagged for revision" });
    } else {
      verdicts.push({ rsid: t.rsid, verdict: "allow", reason: "" });
    }
  }
  return verdicts;
}

// ── Main orchestrator ────────────────────────────────────────────────────────

export async function* orchestrateMeshAnalysis(findingSummaries) {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  const hasCF = accountId && apiToken;

  // ── Step 1: privacy-warden — regex pre-filter + LLM audit ─────────────────
  yield {
    type: "agent-start",
    agent: "privacy-warden",
    summary: `Checking ${findingSummaries.length} finding summaries — no genotypes allowed`,
  };

  const requestBody = findingSummaries.map((f) => `${f.rsid},${f.gene},${f.category},${f.tier}`).join(";");

  // Hard floor: deterministic regex check
  const regexRuling = oracleRule({
    agent: "privacy-warden",
    kind: "data-egress",
    summary: "Send rsids to MyVariant.info and MyGene.info",
    payload: { body: requestBody, transmitsGenome: false },
  });

  if (regexRuling.verdict === "deny") {
    yield {
      type: "oracle-ruling",
      agent: "privacy-warden",
      verdict: "deny",
      reason: regexRuling.reason,
    };
    yield { type: "pipeline-blocked", reason: regexRuling.reason };
    return;
  }

  // LLM layer: catch subtle privacy leaks the regex misses
  if (hasCF) {
    yield {
      type: "agent-text",
      agent: "privacy-warden",
      text: "Running LLM privacy audit on outbound payload…",
    };
    const audit = await llmPrivacyAudit(accountId, apiToken, requestBody);
    yield {
      type: "oracle-ruling",
      agent: "privacy-warden",
      verdict: audit.safe ? "allow" : "deny",
      reason: audit.note,
    };
    if (!audit.safe) {
      yield { type: "pipeline-blocked", reason: `LLM privacy audit: ${audit.note}` };
      return;
    }
  } else {
    yield {
      type: "oracle-ruling",
      agent: "privacy-warden",
      verdict: "allow",
      reason: "rsids are public identifiers — no genomic data transmitted.",
    };
  }

  // ── Step 2: kb-curator agent — owns MCP tools + LLM interpretation ────────
  const rsids = findingSummaries.map((f) => f.rsid);
  const batchCount = Math.ceil(rsids.length / LOOKUP_BATCH_SIZE);
  const usingMcp = await mcpAvailable();

  yield {
    type: "agent-start",
    agent: "kb-curator",
    summary: `Querying MyVariant.info via ${usingMcp ? "MCP (biothings-mcp)" : "direct HTTP"} for ${rsids.length} variants in ${batchCount} batch${batchCount > 1 ? "es" : ""} (${Math.min(batchCount, LOOKUP_CONCURRENCY)} concurrent)…`,
  };

  yield {
    type: "tool-call",
    agent: "kb-curator",
    tool: usingMcp ? "mcp:biothings_query_many_variants" : "http:myvariant.info/v1/variant",
    input: {
      rsids: rsids.length <= 6 ? rsids.join(",") : `${rsids.length} rsids`,
      fields: "clinvar,gnomad.af,pharmgkb,dbsnp.gene",
      transport: usingMcp ? "MCP (stdio)" : "HTTP POST",
    },
  };

  // Curator agent fetches variant data using its own MCP tools (or HTTP fallback)
  const variantData = await curatorFetchVariants(rsids, concurrentBatchLookup);
  const found = Object.values(variantData).filter((v) => v && !v.notFound).length;

  yield {
    type: "tool-result",
    agent: "kb-curator",
    tool: usingMcp ? "mcp:biothings_query_many_variants" : "http:myvariant.info/v1/variant",
    result: { fetched: rsids.length, found },
  };

  // Curator agent fetches gene data using its own MCP tools (or HTTP fallback)
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

  let geneData = {};
  if (geneSymbols.length > 0) {
    yield {
      type: "tool-call",
      agent: "kb-curator",
      tool: usingMcp ? "mcp:biothings_query_genes" : "http:mygene.info/v3/query",
      input: {
        symbols: geneSymbols.join(","),
        count: geneSymbols.length,
        transport: usingMcp ? "MCP (stdio)" : "HTTP GET",
      },
    };

    const geneResult = await curatorFetchGenes(geneSymbols);
    geneData = geneResult.geneData;

    yield {
      type: "tool-result",
      agent: "kb-curator",
      tool: usingMcp ? "mcp:biothings_query_genes" : "http:mygene.info/v3/query",
      result: { fetched: geneSymbols.length, found: geneResult.found },
    };
  }

  const toolCalls = 1 + (geneSymbols.length > 0 ? 1 : 0);

  // Curator agent drafts LLM interpretations from its own fetched data
  let curatorNotes = {};
  if (hasCF && found > 0) {
    const annotatedVariants = rsids
      .filter((rsid) => variantData[rsid] && !variantData[rsid].notFound)
      .map((rsid) => ({
        rsid,
        data: variantData[rsid],
        gene: findingSummaries.find((f) => f.rsid === rsid)?.gene ?? "",
      }));

    yield {
      type: "agent-text",
      agent: "kb-curator",
      text: `Drafting LLM interpretations for ${annotatedVariants.length} variants…`,
    };

    curatorNotes = await curatorDraftInterpretations(accountId, apiToken, cfAiRun, annotatedVariants, geneData);

    yield {
      type: "agent-text",
      agent: "kb-curator",
      text: `Drafted ${Object.keys(curatorNotes).length} interpretations via Cloudflare Workers AI`,
    };
  }

  yield {
    type: "agent-done",
    agent: "kb-curator",
    summary: `${toolCalls} ${usingMcp ? "MCP" : "HTTP"} call${toolCalls > 1 ? "s" : ""} — ${found}/${rsids.length} variants annotated · ${Object.keys(geneData).length} genes fetched · ${Object.keys(curatorNotes).length} LLM interpretations`,
  };

  // ── Step 3: Oracle — deterministic invariants + LLM review + revise loop ──
  yield {
    type: "agent-start",
    agent: "oracle",
    summary: `Reviewing ${found} enriched findings — regex invariants + LLM governance…`,
  };

  const oracleResults = [];
  const approvedEnrichments = {};
  const bulk = found > ORACLE_BULK_THRESHOLD;

  // Pass 3a: deterministic regex invariants (hard floor — never overridden)
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

    if (ruling.verdict === "deny") {
      oracleResults.push({ rsid, verdict: "deny", reason: ruling.reason, source: "invariant" });
      if (!bulk) {
        yield { type: "oracle-ruling", rsid, verdict: "deny", reason: ruling.reason, invariant: ruling.invariant };
      }
      continue;
    }

    // Attach curator note if available
    if (curatorNotes[rsid]) {
      enrich.curatorNote = curatorNotes[rsid];
    }

    approvedEnrichments[rsid] = enrich;
    oracleResults.push({ rsid, verdict: ruling.verdict, reason: ruling.reason, source: "invariant" });

    if (!bulk) {
      yield { type: "oracle-ruling", rsid, verdict: ruling.verdict, reason: ruling.reason, invariant: ruling.invariant };
    }
  }

  // Pass 3b: LLM Oracle review of curator-generated text
  if (hasCF && Object.keys(curatorNotes).length > 0) {
    const textsToReview = Object.entries(curatorNotes)
      .filter(([rsid]) => approvedEnrichments[rsid])
      .map(([rsid, text]) => ({ rsid, text }));

    if (textsToReview.length > 0) {
      yield {
        type: "agent-text",
        agent: "oracle",
        text: `LLM reviewing ${textsToReview.length} curator-drafted interpretations…`,
      };

      const llmVerdicts = await llmOracleReview(accountId, apiToken, textsToReview);

      let reviseCount = 0;
      let denyCount = 0;

      for (const v of llmVerdicts) {
        if (v.verdict === "deny") {
          delete approvedEnrichments[v.rsid];
          denyCount++;
          const existing = oracleResults.find((r) => r.rsid === v.rsid);
          if (existing) { existing.verdict = "deny"; existing.reason = v.reason; existing.source = "llm"; }
          yield { type: "oracle-ruling", rsid: v.rsid, verdict: "deny", reason: `LLM: ${v.reason}` };
        } else if (v.verdict === "revise") {
          reviseCount++;
          yield {
            type: "oracle-ruling",
            rsid: v.rsid,
            verdict: "revise",
            reason: `LLM: ${v.reason}`,
          };

          // Real revise loop: delegate to curator agent to re-draft
          const revised = await curatorRevise(accountId, apiToken, cfAiRun, v.rsid, curatorNotes[v.rsid], v.reason);
          if (revised) {
            // Re-check revised text with regex invariants
            const recheck = oracleRule({
              agent: "kb-curator",
              kind: "report-copy",
              summary: `Revised interpretation for ${v.rsid}`,
              payload: { text: revised, category: findingSummaries.find((f) => f.rsid === v.rsid)?.category ?? "trait" },
            });

            if (recheck.verdict === "deny") {
              delete approvedEnrichments[v.rsid];
              yield { type: "oracle-ruling", rsid: v.rsid, verdict: "deny", reason: `Revised text still violates: ${recheck.reason}` };
            } else {
              approvedEnrichments[v.rsid].curatorNote = revised;
              yield {
                type: "agent-text",
                agent: "kb-curator",
                text: `Revised ${v.rsid}: "${revised.slice(0, 80)}…"`,
              };
              yield { type: "oracle-ruling", rsid: v.rsid, verdict: "allow", reason: "Revised text accepted" };
            }
          } else {
            yield {
              type: "agent-text",
              agent: "kb-curator",
              text: `Revision attempt for ${v.rsid} failed — keeping original`,
            };
          }
        }
      }

      if (reviseCount > 0 || denyCount > 0) {
        yield {
          type: "agent-text",
          agent: "oracle",
          text: `LLM review: ${reviseCount} revised, ${denyCount} denied, ${textsToReview.length - reviseCount - denyCount} approved`,
        };
      }
    }
  }

  const allowCount = oracleResults.filter((r) => approvedEnrichments[r.rsid]).length;
  const denyCount  = oracleResults.filter((r) => !approvedEnrichments[r.rsid] && variantData[r.rsid] && !variantData[r.rsid].notFound).length;

  if (bulk) {
    yield {
      type: "oracle-ruling",
      agent: "oracle",
      verdict: denyCount === 0 ? "allow" : "revise",
      reason: `${allowCount} approved · ${denyCount} denied (invariants + LLM review of ${oracleResults.length} variants)`,
    };
  }

  // ── Step 4: cf-synthesizer — LLM narrative from enriched data ─────────────
  if (hasCF && Object.keys(approvedEnrichments).length > 0) {
    yield {
      type: "agent-start",
      agent: "cf-synthesizer",
      summary: "Generating enrichment narrative via Cloudflare Workers AI…",
    };

    const topFindings = Object.entries(approvedEnrichments)
      .slice(0, 15)
      .map(([rsid, e]) => {
        const parts = [];
        if (e.clinvarSignificance) parts.push(`ClinVar: ${e.clinvarSignificance}`);
        if (e.gnomadAf != null) parts.push(`gnomAD AF: ${e.gnomadAf.toFixed(3)}`);
        if (e.pharmgkbId) parts.push("PharmGKB data available");
        if (e.curatorNote) parts.push(`curator: ${e.curatorNote.slice(0, 80)}`);
        return `${rsid} (${parts.join(", ") || "no annotation"})`;
      })
      .join("; ");

    const cfResult = await cfAiRun(accountId, apiToken, [
      {
        role: "system",
        content: [
          "You are a genomics narrative synthesizer for an educational tool.",
          "Write a 2-3 paragraph overview of what the database enrichment revealed",
          "about this set of genetic variants. Be specific — reference the actual",
          "ClinVar classifications, allele frequencies, and pharmacogenomic associations found.",
          "Educational only, never diagnostic. Never state personal risk percentages.",
          "Never promise treatment, cure, or improvement.",
        ].join(" "),
      },
      {
        role: "user",
        content: `Synthesize findings for these variants:\n${topFindings}`,
      },
    ]);

    if (cfResult.text) {
      yield { type: "agent-text", agent: "cf-synthesizer", text: cfResult.text };
    }
    if (cfResult.error) {
      yield { type: "agent-text", agent: "cf-synthesizer", text: `(CF AI unavailable: ${cfResult.error})` };
    }

    // ── Step 5: ui-polisher — LLM final copy polish ───────────────────────────
    if (cfResult.text) {
      yield {
        type: "agent-start",
        agent: "ui-polisher",
        summary: "Polishing narrative for clarity and educational tone…",
      };

      const polishResult = await cfAiRun(accountId, apiToken, [
        {
          role: "system",
          content: [
            "You are a UI text polisher for a genomics education app.",
            "Take the text below and polish it for:",
            "1. Reading level: aim for grade 10 (clear to non-experts)",
            "2. Remove any jargon that wasn't explained inline",
            "3. Ensure educational, non-diagnostic tone throughout",
            "4. Keep it concise — no longer than the original",
            "5. Never add diagnostic claims, risk percentages, or improvement promises",
            "Return ONLY the polished text, nothing else.",
          ].join(" "),
        },
        { role: "user", content: cfResult.text },
      ]);

      if (polishResult.text) {
        // Run the polished text through the regex invariants
        const polishCheck = oracleRule({
          agent: "ui-polisher",
          kind: "report-copy",
          summary: "Polished UI text",
          payload: { text: polishResult.text, category: "trait" },
        });

        if (polishCheck.verdict === "deny") {
          yield {
            type: "oracle-ruling",
            agent: "ui-polisher",
            verdict: "deny",
            reason: `Polished text violates invariant: ${polishCheck.reason}. Using unpolished version.`,
          };
          yield { type: "agent-text", agent: "ui-polisher", text: cfResult.text };
        } else {
          yield { type: "agent-text", agent: "ui-polisher", text: polishResult.text };
          yield {
            type: "oracle-ruling",
            agent: "ui-polisher",
            verdict: "allow",
            reason: "Polished text passes all invariants",
          };
        }
      } else {
        yield { type: "agent-text", agent: "ui-polisher", text: `(polish unavailable: ${polishResult.error ?? "empty response"})` };
      }
    }
  }

  yield {
    type: "pipeline-done",
    enrichments: approvedEnrichments,
    geneData,
    oracleResults,
    stats: { enriched: Object.keys(approvedEnrichments).length, allowed: allowCount, denied: denyCount, toolCalls },
  };
}

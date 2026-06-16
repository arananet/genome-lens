// Real genomics API tools — direct HTTP calls to MyVariant.info and MyGene.info.
// No mock data, no stubs. Two entry points:
//   batchLookupVariants  — enrich a small curated set (17-30 rsids) with ClinVar/gnomAD/PharmGKB
//   scanVariantsForPathogenic — scan the entire genome (600K+ rsids) for ClinVar P/LP variants

const UA = "genome-lens/1.0 (educational; not for clinical use)";
const TIMEOUT = 8_000;
const SCAN_TIMEOUT = 30_000;

async function safeFetch(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { ...opts, headers: { "User-Agent": UA, ...opts.headers }, signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function safeFetchScan(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), SCAN_TIMEOUT);
  try {
    const r = await fetch(url, { ...opts, headers: { "User-Agent": UA, ...opts.headers }, signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ── Curated-set enrichment (used by kb-curator agent in mesh-analyze) ─────────

// Batch variant lookup — one POST to myvariant.info for up to 30 rsids.
// Returns a map of rsid → enrichment (ClinVar significance, gnomAD AF, PharmGKB).
export async function batchLookupVariants(rsids) {
  if (!rsids.length) return {};
  const data = await safeFetch("https://myvariant.info/v1/variant", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ids: rsids.join(","),
      fields: "clinvar.rcv.clinical_significance,gnomad.af.af,pharmgkb.id,dbsnp.gene.symbol",
      assembly: "hg19",
    }).toString(),
  });
  if (!Array.isArray(data)) return {};

  const out = {};
  for (const item of data) {
    const rsid = item.query ?? item._id;
    if (!rsid) continue;
    out[rsid] = {
      rsid,
      clinvarSignificance: item.clinvar?.rcv?.clinical_significance ?? null,
      gnomadAf: item.gnomad?.af?.af ?? null,
      pharmgkbId: item.pharmgkb?.id ?? null,
      geneSymbol: item.dbsnp?.gene?.symbol ?? null,
      notFound: item.notfound === true,
    };
  }
  return out;
}

export async function lookupVariant(rsid) {
  const map = await batchLookupVariants([rsid]);
  return map[rsid] ?? null;
}

// Gene summary lookup via mygene.info.
export async function lookupGene(symbol) {
  const data = await safeFetch(
    `https://mygene.info/v3/query?q=symbol:${encodeURIComponent(symbol)}&fields=name,summary&species=human&size=1`,
  );
  if (!data?.hits?.length) return null;
  const h = data.hits[0];
  return {
    symbol,
    name: h.name ?? null,
    summary: h.summary ? h.summary.slice(0, 300) : null,
  };
}

// ── Full-genome pathogenic scan (used by /api/clinvar-scan) ──────────────────
// Scans ALL rsids from the uploaded genome through MyVariant.info in batches
// of 1000 (the API maximum) with up to 8 concurrent requests.
// Only returns Pathogenic / Likely pathogenic ClinVar variants.

const PATHOGENIC_RE = /^(pathogenic|likely\s+pathogenic)/i;
const SCAN_BATCH = 1000;
const SCAN_CONCURRENCY = 8;

function extractPathogenicFromItem(item) {
  if (item.notfound) return null;
  const cv = item.clinvar;
  if (!cv) return null;

  // rcv can be a single object or an array (multiple ClinVar submissions)
  const rcvList = Array.isArray(cv.rcv) ? cv.rcv : (cv.rcv ? [cv.rcv] : []);

  let bestSig = null;
  let bestCondition = null;

  for (const rcv of rcvList) {
    const raw = rcv?.clinical_significance;
    if (!raw) continue;
    const sigStr = Array.isArray(raw) ? raw[0] : raw;
    if (!PATHOGENIC_RE.test(sigStr)) continue;
    // Prefer the plain "Pathogenic" label over "Likely pathogenic"
    if (!bestSig || (/^pathogenic$/i.test(sigStr) && !/^pathogenic$/i.test(bestSig))) {
      bestSig = sigStr;
      const cond = rcv.conditions;
      bestCondition =
        cond?.name ??
        (Array.isArray(cond?.synonyms) ? cond.synonyms[0] : null) ??
        (typeof cond === "string" ? cond : null) ??
        null;
    }
  }

  if (!bestSig) return null;

  return {
    rsid: item.query ?? item._id,
    gene: cv.gene?.symbol ?? item.dbsnp?.gene?.symbol ?? null,
    significance: bestSig,
    condition: bestCondition,
    clinvarId: typeof cv.variant_id === "number" ? cv.variant_id : null,
  };
}

async function fetchPathogenicBatch(batchRsids) {
  const data = await safeFetchScan("https://myvariant.info/v1/variant", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ids: batchRsids.join(","),
      fields: [
        "clinvar.rcv.clinical_significance",
        "clinvar.rcv.conditions.name",
        "clinvar.rcv.conditions.synonyms",
        "clinvar.gene.symbol",
        "clinvar.variant_id",
        "dbsnp.gene.symbol",
      ].join(","),
      assembly: "hg19",
    }).toString(),
  });
  if (!Array.isArray(data)) return [];

  const hits = [];
  for (const item of data) {
    const hit = extractPathogenicFromItem(item);
    if (hit) hits.push(hit);
  }
  return hits;
}

// onBatch({ scanned, total, batchHits }) fires after every 1000-rsid batch.
export async function scanVariantsForPathogenic(rsids, onBatch) {
  const batches = [];
  for (let i = 0; i < rsids.length; i += SCAN_BATCH) {
    batches.push(rsids.slice(i, i + SCAN_BATCH));
  }

  let scanned = 0;

  for (let i = 0; i < batches.length; i += SCAN_CONCURRENCY) {
    const group = batches.slice(i, i + SCAN_CONCURRENCY);
    const results = await Promise.all(group.map(fetchPathogenicBatch));

    for (let j = 0; j < group.length; j++) {
      scanned += group[j].length;
      const batchHits = results[j];
      if (onBatch) await onBatch({ scanned, total: rsids.length, batchHits });
    }
  }
}

// ── Tool schemas for Claude API (used by orchestrator) ────────────────────────

export const TOOL_DEFS = [
  {
    name: "lookup_variant",
    description:
      "Query MyVariant.info for a single rsid. Returns ClinVar clinical significance, " +
      "gnomAD population allele frequency, PharmGKB drug-interaction ID, and the associated gene symbol. " +
      "Returns null if the variant is not found.",
    input_schema: {
      type: "object",
      properties: {
        rsid: { type: "string", description: "The variant rsid, e.g. rs4680" },
      },
      required: ["rsid"],
    },
  },
  {
    name: "lookup_gene",
    description:
      "Query MyGene.info for a gene symbol. Returns the full gene name and a short functional summary. " +
      "Use this to enrich the context for a finding's gene, especially for pharmacogenomics or disease entries.",
    input_schema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "HGNC gene symbol, e.g. COMT" },
      },
      required: ["symbol"],
    },
  },
];

export async function executeTool(name, input) {
  if (name === "lookup_variant") return lookupVariant(input.rsid);
  if (name === "lookup_gene") return lookupGene(input.symbol);
  return null;
}

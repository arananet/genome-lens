// Real genomics API tools — direct HTTP calls to the same APIs that
// biothings-mcp (myvariant.info / mygene.info) and gget-mcp wrap.
// No mock data: everything returned is live from public databases.

const UA = "genome-lens/1.0 (educational; not for clinical use)";
const TIMEOUT = 8000;

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

// Batch variant lookup — one POST to myvariant.info for all rsids at once.
// Returns a map of rsid → enrichment or null.
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

// Single-variant lookup (used by Claude as a tool).
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

// Tool schemas for the Claude API
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

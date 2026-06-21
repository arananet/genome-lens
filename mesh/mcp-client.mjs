// MCP client for biothings-mcp — spawns the server via stdio and exposes
// variant/gene lookup tools through the Model Context Protocol.
// Falls back gracefully: if uvx or biothings-mcp isn't available, callers
// get null and should use direct HTTP instead.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let _client = null;
let _transport = null;
let _initPromise = null;
let _failed = false;

const FIELDS_VARIANT =
  "clinvar.rcv.clinical_significance,gnomad.af.af,pharmgkb.id,dbsnp.gene.symbol";
const FIELDS_GENE = "name,summary";

async function _init() {
  if (_failed) return null;
  if (_client) return _client;

  try {
    _transport = new StdioClientTransport({
      command: "uvx",
      args: ["biothings-mcp"],
    });

    _client = new Client(
      { name: "genome-lens", version: "1.0" },
      { capabilities: {} },
    );

    await _client.connect(_transport);
    console.log("[mcp-client] Connected to biothings-mcp via stdio");
    return _client;
  } catch (err) {
    console.warn(`[mcp-client] Failed to start biothings-mcp: ${err.message}`);
    _failed = true;
    _client = null;
    _transport = null;
    return null;
  }
}

function getClient() {
  if (_failed) return Promise.resolve(null);
  if (!_initPromise) _initPromise = _init();
  return _initPromise;
}

function extractJson(result) {
  const content = result?.content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (block.type === "text") {
      try {
        return JSON.parse(block.text);
      } catch {
        if (block.text?.startsWith("Error")) return null;
      }
    }
  }
  return null;
}

export async function mcpBatchLookupVariants(rsids) {
  const client = await getClient();
  if (!client || !rsids.length) return null;

  try {
    const result = await client.callTool({
      name: "biothings_query_many_variants",
      arguments: {
        query_list: rsids.join(","),
        scopes: "dbsnp.rsid",
        fields: FIELDS_VARIANT,
      },
    });

    const data = extractJson(result);
    if (!data) return null;

    const items = Array.isArray(data) ? data : data.result ?? data.hits ?? [];
    if (!items.length) return null;

    const out = {};
    for (const item of items) {
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
  } catch (err) {
    console.warn(`[mcp-client] biothings_query_many_variants failed: ${err.message}`);
    return null;
  }
}

export async function mcpLookupGene(symbol) {
  const client = await getClient();
  if (!client) return null;

  try {
    const result = await client.callTool({
      name: "biothings_query_genes",
      arguments: {
        q: `symbol:${symbol}`,
        fields: FIELDS_GENE,
        species: "human",
        size: 1,
      },
    });

    const data = extractJson(result);
    if (!data) return null;

    const hits = data.hits ?? [];
    if (!hits.length) return null;
    const h = hits[0];
    return {
      symbol,
      name: h.name ?? null,
      summary: h.summary ? h.summary.slice(0, 300) : null,
    };
  } catch (err) {
    console.warn(`[mcp-client] biothings_query_genes failed: ${err.message}`);
    return null;
  }
}

export async function mcpAvailable() {
  const client = await getClient();
  return client !== null;
}

export async function closeMcpClient() {
  if (_transport) {
    try { await _transport.close(); } catch {}
  }
  _client = null;
  _transport = null;
  _initPromise = null;
}

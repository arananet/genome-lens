// Maps knowledge-base source database names to their MCP server and tool.
// These are the holy-bio-mcp servers configured in .claude/settings.json.

export interface McpToolRef {
  server: string;       // e.g. "biothings-mcp"
  tool: string;         // e.g. "myvariant_getvariant"
  databases: string[];  // human-readable names
  suiteUrl: string;
}

export const MCP_SERVERS: McpToolRef[] = [
  {
    server: "biothings-mcp",
    tool: "myvariant / mygene / mydisease",
    databases: ["MyVariant.info", "MyGene.info", "MyDisease.info", "MyChem.info"],
    suiteUrl: "https://github.com/longevity-genie/biothings-mcp",
  },
  {
    server: "gget-mcp",
    tool: "gget_info / gget_search / gget_alphafold",
    databases: ["Ensembl", "NCBI", "UniProt", "ClinVar", "AlphaFold", "COSMIC"],
    suiteUrl: "https://github.com/longevity-genie/gget-mcp",
  },
  {
    server: "opengenes-mcp",
    tool: "opengenes_search",
    databases: ["OpenGenes"],
    suiteUrl: "https://github.com/longevity-genie/opengenes-mcp",
  },
  {
    server: "synergy-age-mcp",
    tool: "synergy_age_search",
    databases: ["SynergyAge"],
    suiteUrl: "https://github.com/longevity-genie/synergy-age-mcp",
  },
];

// Map from DB name (as it appears in KbEntry.sources[].db) to MCP server name.
const DB_TO_MCP: Record<string, string> = {
  ClinVar: "gget-mcp",
  Ensembl: "gget-mcp",
  NCBI: "gget-mcp",
  UniProt: "gget-mcp",
  AlphaFold: "gget-mcp",
  COSMIC: "gget-mcp",
  dbSNP: "biothings-mcp",
  "GWAS Catalog": "biothings-mcp",
  PharmGKB: "biothings-mcp",
  SNPedia: "biothings-mcp",
  OpenGenes: "opengenes-mcp",
  SynergyAge: "synergy-age-mcp",
};

export function mcpServerForDb(db: string): string | null {
  return DB_TO_MCP[db] ?? null;
}

export function mcpServersForEntry(sources: { db: string }[]): string[] {
  const servers = new Set<string>();
  for (const s of sources) {
    const mcp = mcpServerForDb(s.db);
    if (mcp) servers.add(mcp);
  }
  return [...servers];
}

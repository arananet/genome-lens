import type { Finding } from "../../analysis/types";
import type { FindingVerdict, MeshSummary } from "../../analysis/mesh-review";
import type { ParsedGenome } from "../../parse/types";
import { MCP_SERVERS, mcpServersForEntry } from "../../mesh/mcp-tools";

interface Props {
  genome: ParsedGenome;
  findings: Finding[];
  verdicts: FindingVerdict[];
  summary: MeshSummary;
  parseMs: number;
  matchMs: number;
  sessionStart: number;
  fileName: string;
}

const SOURCE_LABEL: Record<string, string> = {
  "23andme": "23andMe",
  ancestry: "AncestryDNA",
  myheritage: "MyHeritage",
  unknown: "Unknown",
};

type Verdict = "allow" | "revise" | "deny";

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const styles: Record<Verdict, string> = {
    allow: "bg-emerald-500/10 border-emerald-500/25 text-emerald-400",
    revise: "bg-amber-500/10 border-amber-500/25 text-amber-400",
    deny: "bg-red-500/10 border-red-500/25 text-red-400",
  };
  const labels: Record<Verdict, string> = {
    allow: "✓ allow",
    revise: "⚠ revise",
    deny: "✕ deny",
  };
  return (
    <span
      className={`flex-shrink-0 rounded border px-1.5 py-px text-[10px] font-bold ${styles[verdict]}`}
    >
      {labels[verdict]}
    </span>
  );
}

function TierChip({ tier }: { tier: "A" | "B" | "C" }) {
  const styles = {
    A: "bg-emerald-500/10 border-emerald-500/25 text-emerald-400",
    B: "bg-blue-500/10 border-blue-500/25 text-blue-400",
    C: "bg-white/5 border-white/10 text-white/40",
  };
  return (
    <span className={`rounded border px-1.5 py-px text-[10px] font-bold ${styles[tier]}`}>
      {tier}
    </span>
  );
}

export function ObservabilityPanel({
  genome,
  findings,
  verdicts,
  summary,
  parseMs,
  matchMs,
  sessionStart,
  fileName,
}: Props) {
  const coveredFindings = findings
    .filter((f) => f.covered)
    .sort((a, b) => {
      const tierOrder = { A: 0, B: 1, C: 2 };
      const tDiff = tierOrder[a.entry.tier] - tierOrder[b.entry.tier];
      if (tDiff !== 0) return tDiff;
      return a.entry.category.localeCompare(b.entry.category);
    });

  const verdictMap = new Map(verdicts.map((v) => [v.rsid, v]));

  const method = genome.method ?? "array-based SNP";
  const sourceLabel = SOURCE_LABEL[genome.source] ?? genome.source;

  const sessionDate = new Date(sessionStart);
  const sessionTimeStr = sessionStart > 0 ? sessionDate.toLocaleTimeString() : "—";

  // Compute which MCP servers are actually used across covered findings
  const usedMcpServers = new Set<string>();
  for (const f of coveredFindings) {
    for (const s of mcpServersForEntry(f.entry.sources)) {
      usedMcpServers.add(s);
    }
  }

  // Count findings per MCP server
  const mcpFindingCounts = new Map<string, number>();
  for (const f of coveredFindings) {
    const servers = mcpServersForEntry(f.entry.sources);
    for (const s of servers) {
      mcpFindingCounts.set(s, (mcpFindingCounts.get(s) ?? 0) + 1);
    }
  }

  const oracleVerdict: Verdict = summary.flaggedCount > 0 ? "revise" : "allow";

  const timelineRows = [
    {
      t: 0,
      icon: "⚙",
      agent: "parser-smith",
      role: "parse",
      output: `${genome.variantCount.toLocaleString()} SNP positions from ${sourceLabel} (${method})`,
      timing: `${parseMs}ms`,
      verdict: "allow" as Verdict,
    },
    {
      t: parseMs,
      icon: "📚",
      agent: "kb-curator",
      role: "match",
      output: `${summary.matchedCount} KB entries queried · ${summary.coveredCount} in file`,
      timing: `${matchMs}ms`,
      verdict: "allow" as Verdict,
    },
    {
      t: parseMs + matchMs,
      icon: "◈",
      agent: "Oracle",
      role: "review",
      output: `${verdicts.length} findings reviewed · ${summary.allowCount} allow${summary.flaggedCount > 0 ? ` · ${summary.flaggedCount} flagged` : ""}`,
      timing: "—",
      verdict: oracleVerdict,
    },
    {
      t: parseMs + matchMs + 1,
      icon: "✦",
      agent: "ui-polisher",
      role: "render",
      output: `${summary.coveredCount} findings displayed`,
      timing: "—",
      verdict: "allow" as Verdict,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Section A: Session timeline */}
      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wider font-medium text-white/30">
          Session timeline
        </p>
        <p className="mb-3 text-[10px] text-white/25">
          File: <span className="font-mono text-white/40">{fileName}</span> · Session started {sessionTimeStr}
        </p>
        <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/8">
                <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-white/25 font-medium w-16">
                  t (ms)
                </th>
                <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-white/25 font-medium">
                  Agent
                </th>
                <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-white/25 font-medium hidden sm:table-cell">
                  Output
                </th>
                <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-white/25 font-medium w-16 hidden sm:table-cell">
                  Time
                </th>
                <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-white/25 font-medium w-20">
                  Verdict
                </th>
              </tr>
            </thead>
            <tbody>
              {timelineRows.map((row, i) => (
                <tr
                  key={row.agent}
                  className={`border-b border-white/5 last:border-0 ${i % 2 === 0 ? "" : "bg-white/[0.015]"}`}
                >
                  <td className="px-3 py-2.5 font-mono text-white/35">+{row.t}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{row.icon}</span>
                      <div>
                        <span className="font-mono font-semibold text-white/75">{row.agent}</span>
                        <span className="ml-1.5 text-[10px] text-white/25 uppercase tracking-wide">
                          {row.role}
                        </span>
                        <p className="text-[10px] text-white/40 mt-0.5 sm:hidden">{row.output}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-white/45 hidden sm:table-cell">{row.output}</td>
                  <td className="px-3 py-2.5 font-mono text-white/35 hidden sm:table-cell">{row.timing}</td>
                  <td className="px-3 py-2.5">
                    <VerdictBadge verdict={row.verdict} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section B: Oracle decisions */}
      {coveredFindings.length > 0 && (
        <div>
          <p className="mb-3 text-[10px] uppercase tracking-wider font-medium text-white/30">
            Oracle decisions · {coveredFindings.length} covered findings
          </p>
          <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden overflow-x-auto">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-white/25 font-medium">rsid</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-white/25 font-medium">Gene</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-white/25 font-medium w-10">Tier</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-white/25 font-medium">Category</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-white/25 font-medium">Genotype</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-white/25 font-medium">Verdict</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-white/25 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {coveredFindings.map((f, i) => {
                  const v = verdictMap.get(f.entry.rsid);
                  const verdict = (v?.verdict ?? "allow") as Verdict;
                  return (
                    <tr
                      key={f.entry.rsid}
                      className={`border-b border-white/5 last:border-0 ${i % 2 === 0 ? "" : "bg-white/[0.015]"}`}
                    >
                      <td className="px-3 py-2 font-mono text-white/70">{f.entry.rsid}</td>
                      <td className="px-3 py-2 font-mono text-white/55">{f.entry.gene}</td>
                      <td className="px-3 py-2">
                        <TierChip tier={f.entry.tier} />
                      </td>
                      <td className="px-3 py-2 text-white/45">{f.entry.category}</td>
                      <td className="px-3 py-2 font-mono text-white/60">{f.genotype ?? "—"}</td>
                      <td className="px-3 py-2">
                        <VerdictBadge verdict={verdict} />
                      </td>
                      <td className="px-3 py-2 text-white/35 text-[10px]">
                        {verdict !== "allow" && v?.reason ? v.reason : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section C: MCP tool registry */}
      <div>
        <p className="mb-3 text-[10px] uppercase tracking-wider font-medium text-white/30">
          MCP tool registry · knowledge-base data sources
        </p>
        <p className="mb-3 text-[10px] text-white/25">
          Parser handled:{" "}
          <span className="text-white/45 font-mono">{sourceLabel}</span> format ·{" "}
          <span className="text-white/45 font-mono">{method}</span>
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MCP_SERVERS.map((srv) => {
            const count = mcpFindingCounts.get(srv.server) ?? 0;
            const active = usedMcpServers.has(srv.server);
            return (
              <div
                key={srv.server}
                className={`rounded-lg border px-3 py-3 space-y-2 ${
                  active
                    ? "border-indigo-500/20 bg-indigo-500/[0.04]"
                    : "border-white/5 bg-white/[0.02]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono font-bold text-xs text-white/80">{srv.server}</p>
                    <p className="text-[10px] text-white/35 mt-0.5">{srv.tool}</p>
                  </div>
                  {active && (
                    <span className="flex-shrink-0 rounded border border-indigo-500/25 bg-indigo-500/10 px-1.5 py-px text-[10px] font-bold text-indigo-400">
                      {count} finding{count !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {srv.databases.map((db) => (
                    <span
                      key={db}
                      className="rounded bg-white/5 border border-white/8 px-1.5 py-px text-[10px] text-white/45"
                    >
                      {db}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-white/25">
                  {active
                    ? `${count} covered finding${count !== 1 ? "s" : ""} sourced from this server's databases`
                    : "No findings from this server in current file"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

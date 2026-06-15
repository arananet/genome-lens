import { oracle } from "../mesh/oracle";
import type { AgentAction } from "../mesh/types";
import type { KbCategory } from "../kb/types";
import type { Finding } from "./types";

export type Verdict = "allow" | "revise" | "deny";

export interface FindingVerdict {
  rsid: string;
  verdict: Verdict;
  reason?: string;
}

export interface MeshSummary {
  parsedCount: number;
  matchedCount: number;
  coveredCount: number;
  allowCount: number;
  flaggedCount: number;
  breakdown: Partial<Record<KbCategory, { A: number; B: number; C: number }>>;
}

export function reviewFinding(finding: Finding): FindingVerdict {
  if (!finding.covered) return { rsid: finding.entry.rsid, verdict: "allow" };

  const action: AgentAction = {
    agent: "ui-polisher",
    kind: "report-copy",
    summary: `Display interpretation for ${finding.entry.rsid}`,
    payload: {
      text: finding.interpretation,
      category: finding.entry.category,
    },
  };

  const ruling = oracle.rule(action);
  return { rsid: finding.entry.rsid, verdict: ruling.verdict, reason: ruling.reason };
}

export function reviewAllFindings(findings: Finding[]): FindingVerdict[] {
  return findings.map(reviewFinding);
}

export function buildMeshSummary(
  parsedCount: number,
  findings: Finding[],
  verdicts: FindingVerdict[],
): MeshSummary {
  const covered = findings.filter((f) => f.covered);
  const allowCount = verdicts.filter((v) => v.verdict === "allow").length;
  const flaggedCount = verdicts.length - allowCount;

  const breakdown: MeshSummary["breakdown"] = {};
  for (const f of covered) {
    const cat = f.entry.category;
    const tier = f.entry.tier;
    if (!breakdown[cat]) breakdown[cat] = { A: 0, B: 0, C: 0 };
    breakdown[cat]![tier] = (breakdown[cat]![tier] ?? 0) + 1;
  }

  return {
    parsedCount,
    matchedCount: findings.length,
    coveredCount: covered.length,
    allowCount,
    flaggedCount,
    breakdown,
  };
}

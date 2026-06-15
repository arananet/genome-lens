import { Oracle, oracle as defaultOracle } from "./oracle";
import { WikiMemory } from "./memory";
import type { AgentAction, OracleRuling } from "./types";

export interface SubmitResult {
  ruling: OracleRuling;
  committed: boolean;
}

// The mesh coordinates agents under Oracle governance and shared wiki memory.
// An agent submits an action; the Oracle rules; allowed actions are recorded to
// the decision log. Revised/denied actions are reported back, never committed.
export class AgentMesh {
  constructor(
    private readonly memory: WikiMemory = new WikiMemory(),
    private readonly oracle: Oracle = defaultOracle,
    private readonly record = true,
  ) {}

  submit(action: AgentAction): SubmitResult {
    const ruling = this.oracle.rule(action);
    const committed = ruling.verdict === "allow";
    if (committed && this.record) {
      this.memory.appendDecision(action.agent, action.kind, "allow");
    }
    return { ruling, committed };
  }
}

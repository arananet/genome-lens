// Agent mesh types. This layer is development/governance tooling — it is NOT
// bundled into the browser app and never touches a user's genome.

export type AgentRole =
  | "kb-curator"
  | "parser-smith"
  | "glossary-scribe"
  | "ui-polisher"
  | "privacy-warden";

export type ActionKind =
  | "kb-entry" // propose/edit a knowledge-base entry
  | "glossary-page" // write a glossary wiki page
  | "report-copy" // author user-facing report text
  | "data-egress" // send something off-device
  | "note"; // append a memory note

export interface AgentAction {
  agent: AgentRole;
  kind: ActionKind;
  summary: string;
  payload: Record<string, unknown>;
}

export type Verdict = "allow" | "revise" | "deny";

export interface OracleRuling {
  verdict: Verdict;
  invariant?: string; // id of the invariant that was triggered
  reason?: string;
}

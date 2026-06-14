import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Oracle } from "../src/mesh/oracle";
import { WikiMemory } from "../src/mesh/memory";
import { AgentMesh } from "../src/mesh/mesh";
import type { AgentAction } from "../src/mesh/types";

const oracle = new Oracle();

describe("Oracle governance", () => {
  it("allows a well-formed knowledge-base entry", () => {
    const action: AgentAction = {
      agent: "kb-curator",
      kind: "kb-entry",
      summary: "Add rs1815739 (ACTN3).",
      payload: { tier: "B", sources: [{ db: "dbSNP", id: "rs1815739", url: "https://x" }] },
    };
    expect(oracle.rule(action).verdict).toBe("allow");
  });

  it("denies a knowledge-base entry with no sources", () => {
    const action: AgentAction = {
      agent: "kb-curator",
      kind: "kb-entry",
      summary: "Add unsourced claim.",
      payload: { tier: "B", sources: [] },
    };
    const ruling = oracle.rule(action);
    expect(ruling.verdict).toBe("deny");
    expect(ruling.invariant).toBe("evidence-required");
  });

  it("denies egress of a personal genotype", () => {
    const action: AgentAction = {
      agent: "privacy-warden",
      kind: "data-egress",
      summary: "Send analytics.",
      payload: { body: "user rs9939609 = AA" },
    };
    const ruling = oracle.rule(action);
    expect(ruling.verdict).toBe("deny");
    expect(ruling.invariant).toBe("local-only");
  });

  it("revises diagnostic / risk-percentage report copy", () => {
    const action: AgentAction = {
      agent: "ui-polisher",
      kind: "report-copy",
      summary: "Risk copy.",
      payload: { text: "You have a 80% risk of this condition." },
    };
    const ruling = oracle.rule(action);
    expect(ruling.verdict).toBe("revise");
    expect(ruling.invariant).toBe("no-diagnosis");
  });

  it("denies vision-improvement promises", () => {
    const action: AgentAction = {
      agent: "ui-polisher",
      kind: "report-copy",
      summary: "Vision copy.",
      payload: { category: "vision", text: "This supplement will improve your eyesight." },
    };
    const ruling = oracle.rule(action);
    expect(ruling.verdict).toBe("deny");
    expect(ruling.invariant).toBe("no-vision-improvement");
  });
});

describe("WikiMemory + mesh", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wiki-"));
    mkdirSync(join(root, "glossary"), { recursive: true });
    mkdirSync(join(root, "memory"), { recursive: true });
    writeFileSync(
      join(root, "glossary", "snp.md"),
      "---\nterm: SNP\ntitle: SNP\ncategory: core\n---\nA single position.\n",
    );
    writeFileSync(join(root, "memory", "decisions.md"), "<!-- mesh:log -->\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reads a glossary page with front-matter parsed", () => {
    const mem = new WikiMemory(root);
    expect(mem.listPages("glossary")).toContain("snp");
    const page = mem.readPage("glossary", "snp");
    expect(page.meta.term).toBe("SNP");
    expect(page.body).toContain("single position");
  });

  it("commits allowed actions to the decision log and skips denied ones", () => {
    const mem = new WikiMemory(root);
    const mesh = new AgentMesh(mem, oracle);

    const allowed = mesh.submit({
      agent: "kb-curator",
      kind: "kb-entry",
      summary: "Add rs6025 (Factor V Leiden).",
      payload: { tier: "A", sources: [{ db: "ClinVar", id: "rs6025", url: "https://x" }] },
    });
    expect(allowed.committed).toBe(true);

    const denied = mesh.submit({
      agent: "kb-curator",
      kind: "kb-entry",
      summary: "Add unsourced claim.",
      payload: { tier: "A", sources: [] },
    });
    expect(denied.committed).toBe(false);

    const log = readFileSync(join(root, "memory", "decisions.md"), "utf8");
    expect(log).toContain("Add rs6025");
    expect(log).not.toContain("Add unsourced claim");
  });
});

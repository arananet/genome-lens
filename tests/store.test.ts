import { beforeEach, describe, expect, it } from "vitest";
import { useGenomeStore } from "../src/state/store";
import { FIXTURE_23ANDME } from "./fixtures";

beforeEach(async () => {
  await useGenomeStore.getState().wipeAll();
});

describe("genome store", () => {
  it("loads a parsed genome and populates findings", async () => {
    const file = new File([FIXTURE_23ANDME], "genome.txt", { type: "text/plain" });
    await useGenomeStore.getState().loadFile(file);
    const s = useGenomeStore.getState();
    expect(s.status).toBe("ready");
    expect(s.genome?.variantCount).toBe(6);
    expect(s.findings.length).toBeGreaterThan(0);
    expect(s.view).toBe("trace");
  });

  it("sets an error for an unrecognized file", async () => {
    const file = new File(["name,value\nfoo,1\n"], "junk.csv", { type: "text/csv" });
    await useGenomeStore.getState().loadFile(file);
    const s = useGenomeStore.getState();
    expect(s.status).toBe("error");
    expect(s.genome).toBeNull();
  });

  it("wipes all in-memory state", async () => {
    const file = new File([FIXTURE_23ANDME], "genome.txt", { type: "text/plain" });
    await useGenomeStore.getState().loadFile(file);
    await useGenomeStore.getState().wipeAll();
    const s = useGenomeStore.getState();
    expect(s.genome).toBeNull();
    expect(s.findings).toEqual([]);
    expect(s.view).toBe("upload");
    expect(s.persistEnabled).toBe(false);
  });
});

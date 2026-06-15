import { create } from "zustand";
import { matchGenome } from "../analysis/match";
import type { Finding } from "../analysis/types";
import { parseGenomeFile } from "../parse";
import { ParseError, type ParsedGenome } from "../parse/types";
import { wipePersisted } from "./persist";

export type View = "upload" | "trace" | "karyotype" | "reports" | "search" | "wiki";

interface GenomeState {
  genome: ParsedGenome | null;
  findings: Finding[];
  fileName: string | null;
  status: "idle" | "parsing" | "ready" | "error";
  error: string | null;

  view: View;
  selectedRsid: string | null;

  noticeAcknowledged: boolean;

  loadFile: (file: File) => Promise<void>;
  setView: (view: View) => void;
  selectVariant: (rsid: string | null) => void;
  acknowledgeNotice: () => void;
  wipeAll: () => Promise<void>;
}

function applyGenome(genome: ParsedGenome) {
  return {
    genome,
    findings: matchGenome(genome),
    status: "ready" as const,
    error: null,
  };
}

export const useGenomeStore = create<GenomeState>((set) => ({
  genome: null,
  findings: [],
  fileName: null,
  status: "idle",
  error: null,

  view: "upload",
  selectedRsid: null,

  noticeAcknowledged: false,

  async loadFile(file) {
    set({ status: "parsing", error: null, fileName: file.name });
    try {
      const genome = await parseGenomeFile(file);
      set({ ...applyGenome(genome), view: "trace" });
    } catch (err) {
      const message =
        err instanceof ParseError
          ? err.message
          : "Could not read this file. Please upload a 23andMe, AncestryDNA, or MyHeritage raw export.";
      set({ status: "error", error: message, genome: null, findings: [] });
    }
  },

  setView(view) {
    set({ view });
  },

  selectVariant(rsid) {
    set({ selectedRsid: rsid });
  },

  acknowledgeNotice() {
    set({ noticeAcknowledged: true });
  },

  async wipeAll() {
    await wipePersisted(); // clears any legacy IndexedDB data
    set({
      genome: null,
      findings: [],
      fileName: null,
      status: "idle",
      error: null,
      view: "upload",
      selectedRsid: null,
    });
  },
}));

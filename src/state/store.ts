import { create } from "zustand";
import { matchGenome } from "../analysis/match";
import type { Finding } from "../analysis/types";
import { parseGenomeFile } from "../parse";
import { ParseError, type ParsedGenome } from "../parse/types";
import {
  isPersistEnabled,
  loadPersistedGenome,
  persistGenome,
  wipePersisted,
} from "./persist";

export type View = "upload" | "trace" | "karyotype" | "reports" | "search" | "wiki";

interface GenomeState {
  genome: ParsedGenome | null;
  findings: Finding[];
  fileName: string | null;
  status: "idle" | "parsing" | "ready" | "error";
  error: string | null;

  view: View;
  selectedRsid: string | null;

  persistEnabled: boolean;
  noticeAcknowledged: boolean;

  loadFile: (file: File) => Promise<void>;
  setView: (view: View) => void;
  selectVariant: (rsid: string | null) => void;
  setPersist: (enabled: boolean) => Promise<void>;
  acknowledgeNotice: () => void;
  hydrateFromPersistence: () => Promise<void>;
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

export const useGenomeStore = create<GenomeState>((set, get) => ({
  genome: null,
  findings: [],
  fileName: null,
  status: "idle",
  error: null,

  view: "upload",
  selectedRsid: null,

  persistEnabled: false,
  noticeAcknowledged: false,

  async loadFile(file) {
    set({ status: "parsing", error: null, fileName: file.name });
    try {
      const genome = await parseGenomeFile(file);
      set({ ...applyGenome(genome), view: "trace" });
      if (get().persistEnabled) {
        await persistGenome(genome);
      }
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

  async setPersist(enabled) {
    set({ persistEnabled: enabled });
    const { genome } = get();
    if (enabled && genome) {
      await persistGenome(genome);
    } else if (!enabled) {
      await wipePersisted();
    }
  },

  acknowledgeNotice() {
    set({ noticeAcknowledged: true });
  },

  async hydrateFromPersistence() {
    const enabled = await isPersistEnabled();
    if (!enabled) return;
    const genome = await loadPersistedGenome();
    if (genome) {
      set({ persistEnabled: true, ...applyGenome(genome), view: "trace", fileName: "(restored)" });
    }
  },

  async wipeAll() {
    await wipePersisted();
    set({
      genome: null,
      findings: [],
      fileName: null,
      status: "idle",
      error: null,
      view: "upload",
      selectedRsid: null,
      persistEnabled: false,
    });
  },
}));

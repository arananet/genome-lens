import { useMemo, useState } from "react";
import { useGenomeStore } from "../../state/store";
import type { Finding } from "../../analysis/types";
import type { KbCategory } from "../../kb/types";
import { ReportSection } from "./ReportSection";

type Theme = "health" | "fitness" | "body" | "vision";

const THEMES: { id: Theme; label: string; categories: KbCategory[]; intro: string }[] = [
  {
    id: "health",
    label: "Health & disease",
    categories: ["disease-risk", "pharmacogenomic", "trait"],
    intro:
      "Known associations and their strength. Array data is not a clinical genome and polygenic risk is not destiny. Tier A findings warrant a clinical-grade confirmatory test and a conversation with a clinician.",
  },
  {
    id: "fitness",
    label: "Fitness",
    categories: ["fitness"],
    intro:
      "Read these as a nudge, not a verdict. Training response is dominated by training — consistency, type, and recovery — far more than by genotype.",
  },
  {
    id: "body",
    label: "Body composition",
    categories: ["body-composition"],
    intro:
      "These variants are real but small-effect. Energy balance, diet quality, sleep, and activity dominate. No variant causes body fat; at most you may find something slightly harder or easier.",
  },
  {
    id: "vision",
    label: "Vision",
    categories: ["vision"],
    intro:
      "This reports risk variants for myopia and AMD. There is no genetic intervention that improves eyesight. Evidence-based levers: more outdoor/daylight time (protective against myopia progression), and for AMD-risk carriers, not smoking, a healthy diet, and discussing AREDS-type guidance with an ophthalmologist.",
  },
];

export function Reports() {
  const findings = useGenomeStore((s) => s.findings);
  const [theme, setTheme] = useState<Theme>("health");

  const byTheme = useMemo(() => {
    const map = new Map<Theme, Finding[]>();
    for (const t of THEMES) {
      map.set(
        t.id,
        findings.filter((f) => t.categories.includes(f.entry.category)),
      );
    }
    return map;
  }, [findings]);

  const active = THEMES.find((t) => t.id === theme)!;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4">
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${
              theme === t.id ? "bg-indigo-500 text-white" : "bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ReportSection title={active.label} intro={active.intro} findings={byTheme.get(active.id) ?? []} />
    </div>
  );
}

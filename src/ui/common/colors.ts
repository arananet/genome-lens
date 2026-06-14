import type { KbCategory, Tier } from "../../kb/types";

// Shared category colors for 2D markers, 3D markers, and badges.
export const CATEGORY_COLOR: Record<KbCategory, string> = {
  pharmacogenomic: "#a78bfa",
  "disease-risk": "#f87171",
  trait: "#60a5fa",
  fitness: "#34d399",
  "body-composition": "#fbbf24",
  vision: "#22d3ee",
};

export const CATEGORY_LABEL: Record<KbCategory, string> = {
  pharmacogenomic: "Pharmacogenomic",
  "disease-risk": "Disease risk",
  trait: "Trait",
  fitness: "Fitness",
  "body-composition": "Body composition",
  vision: "Vision",
};

// Marker size by tier for the 3D view (A is the largest / most prominent).
export const TIER_SIZE: Record<Tier, number> = { A: 1.6, B: 1.2, C: 0.9 };

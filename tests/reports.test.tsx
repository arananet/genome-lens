import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReportSection } from "../src/ui/reports/ReportSection";
import { Reports } from "../src/ui/reports/Reports";
import { GLOBAL_DISCLAIMER } from "../src/ui/common/Disclaimer";
import { matchGenome } from "../src/analysis/match";
import { useGenomeStore } from "../src/state/store";
import { parseGenomeText } from "../src/parse";
import { FIXTURE_MYHERITAGE } from "./fixtures";

describe("ReportSection", () => {
  it("renders the global disclaimer and per-finding caveats", () => {
    const findings = matchGenome(parseGenomeText(FIXTURE_MYHERITAGE)).filter(
      (f) => f.entry.rsid === "rs1061170",
    );
    render(<ReportSection title="Vision" intro="intro text" findings={findings} />);
    expect(screen.getByText(GLOBAL_DISCLAIMER)).toBeInTheDocument();
    // The CFH caveat mentions there is no genetic intervention that improves eyesight.
    expect(screen.getByText(/no genetic intervention that improves eyesight/i)).toBeInTheDocument();
  });
});

describe("Reports vision tab", () => {
  it("never promises vision improvement", () => {
    const findings = matchGenome(parseGenomeText(FIXTURE_MYHERITAGE));
    useGenomeStore.setState({ findings });
    render(<Reports />);
    fireEvent.click(screen.getByText("Vision"));
    // Phrase appears in both the section intro and the CFH caveat.
    expect(screen.getAllByText(/no genetic intervention that improves eyesight/i).length).toBeGreaterThan(0);
    // Sanity: the improvement-promise phrasing must not appear.
    expect(screen.queryByText(/improve your (eyesight|vision)/i)).toBeNull();
  });
});

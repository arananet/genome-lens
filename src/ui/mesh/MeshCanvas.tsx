import { useEffect, useRef } from "react";
import { useGenomeStore } from "../../state/store";
import { MeshViz } from "./MeshViz";

interface Props {
  allOk: boolean;
}

export function MeshCanvas({ allOk }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vizRef = useRef<MeshViz | null>(null);
  const status = useGenomeStore((s) => s.status);
  const parseMs = useGenomeStore((s) => s.parseMs);
  const matchMs = useGenomeStore((s) => s.matchMs);

  useEffect(() => {
    if (!canvasRef.current) return;
    const viz = new MeshViz(canvasRef.current);
    vizRef.current = viz;
    return () => viz.destroy();
  }, []);

  useEffect(() => {
    const viz = vizRef.current;
    if (!viz) return;

    if (status === "idle") {
      viz.resetAll();
      return;
    }

    if (status === "parsing") {
      viz.setStatus("parser-smith", "running");
      viz.activateEdge("data-in", "parser-smith", true);
      viz.burst("data-in", "parser-smith", 6);
      return;
    }

    if (status === "ready") {
      const timers: ReturnType<typeof setTimeout>[] = [];
      const schedule = (at: number, fn: () => void) => timers.push(setTimeout(fn, at));
      const p = Math.min(parseMs, 600);

      schedule(0, () => {
        viz.setStatus("data-in", "done");
        viz.setStatus("parser-smith", "running");
        viz.activateEdge("data-in", "parser-smith", true);
        viz.burst("data-in", "parser-smith", 8);
      });
      schedule(p, () => {
        viz.setStatus("parser-smith", "done");
        viz.activateEdge("data-in", "parser-smith", false);
        viz.activateEdge("parser-smith", "kb-curator", true);
        viz.burst("parser-smith", "kb-curator", 6);
      });
      schedule(p + 200, () => {
        viz.setStatus("kb-curator", "running");
        viz.activateEdge("kb-curator", "biothings-mcp", true);
        viz.activateEdge("kb-curator", "gget-mcp", true);
        viz.activateEdge("kb-curator", "opengenes-mcp", true);
        viz.activateEdge("kb-curator", "synergy-age-mcp", true);
        viz.burst("kb-curator", "biothings-mcp", 4);
        viz.burst("kb-curator", "gget-mcp", 4);
        viz.burst("kb-curator", "opengenes-mcp", 3);
        viz.burst("kb-curator", "synergy-age-mcp", 3);
      });
      schedule(p + 450, () => {
        viz.setStatus("kb-curator", "done");
        for (const id of ["biothings-mcp", "gget-mcp", "opengenes-mcp", "synergy-age-mcp"]) {
          viz.activateEdge("kb-curator", id, false);
          viz.setStatus(id, "done");
        }
      });
      schedule(p + 500, () => {
        viz.setStatus("privacy-warden", "running");
        viz.activateEdge("kb-curator", "privacy-warden", true);
        viz.burst("kb-curator", "privacy-warden", 5);
      });
      schedule(p + 650, () => {
        viz.setStatus("privacy-warden", "done");
        viz.activateEdge("kb-curator", "privacy-warden", false);
        viz.activateEdge("privacy-warden", "oracle", true);
        viz.burst("privacy-warden", "oracle", 5);
      });
      schedule(p + 800, () => {
        viz.setStatus("oracle", "running");
      });
      schedule(p + 1000, () => {
        viz.setStatus("oracle", allOk ? "allow" : "revise");
        viz.activateEdge("privacy-warden", "oracle", false);
        viz.activateEdge("oracle", "ui-polisher", true);
        viz.burst("oracle", "ui-polisher", 5);
      });
      schedule(p + 1100, () => {
        viz.setStatus("ui-polisher", "running");
      });
      schedule(p + 1300, () => {
        viz.setStatus("ui-polisher", "done");
        viz.activateEdge("oracle", "ui-polisher", false);
        viz.activateEdge("ui-polisher", "data-out", true);
        viz.burst("ui-polisher", "data-out", 4);
      });
      schedule(p + 1600, () => {
        viz.setStatus("data-out", "done");
        viz.activateEdge("ui-polisher", "data-out", false);
      });

      return () => timers.forEach(clearTimeout);
    }
  }, [status, parseMs, matchMs, allOk]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full"
      style={{ height: "280px", display: "block" }}
    />
  );
}

import { useEffect, useRef } from "react";
import { useGenomeStore, type MeshEvent } from "../../state/store";
import { MeshViz } from "./MeshViz";

// Drives the canvas directly from the real SSE event stream emitted by
// mesh/orchestrator.mjs — no synthetic timers. Each MeshEvent maps to a
// node/edge transition reflecting what the server actually did.
export function MeshCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vizRef = useRef<MeshViz | null>(null);
  const processedRef = useRef(0);

  const meshEvents = useGenomeStore((s) => s.meshEvents);
  const meshStatus = useGenomeStore((s) => s.meshStatus);
  const clinvarScanStatus = useGenomeStore((s) => s.clinvarScanStatus);
  const clinvarScanProgress = useGenomeStore((s) => s.clinvarScanProgress);

  useEffect(() => {
    if (!canvasRef.current) return;
    const viz = new MeshViz(canvasRef.current);
    vizRef.current = viz;
    return () => viz.destroy();
  }, []);

  // Reset the graph whenever a new pipeline run begins.
  useEffect(() => {
    if (meshStatus === "running" && processedRef.current === 0) {
      vizRef.current?.resetAll();
    }
    if (meshStatus === "idle") {
      processedRef.current = 0;
      vizRef.current?.resetAll();
    }
  }, [meshStatus]);

  useEffect(() => {
    const viz = vizRef.current;
    if (!viz) return;

    for (let i = processedRef.current; i < meshEvents.length; i++) {
      applyEvent(viz, meshEvents[i]);
    }
    processedRef.current = meshEvents.length;
  }, [meshEvents]);

  useEffect(() => {
    const viz = vizRef.current;
    if (!viz) return;
    if (clinvarScanStatus === "running") {
      viz.setStatus("clinvar-scanner", "running");
      viz.activateEdge("data-in", "clinvar-scanner", true);
      if (clinvarScanProgress) {
        viz.burst("data-in", "clinvar-scanner", 2);
      }
    } else if (clinvarScanStatus === "done") {
      viz.setStatus("clinvar-scanner", "done");
      viz.activateEdge("data-in", "clinvar-scanner", false);
      viz.activateEdge("clinvar-scanner", "data-out", true);
      viz.burst("clinvar-scanner", "data-out", 6);
    } else if (clinvarScanStatus === "error") {
      viz.setStatus("clinvar-scanner", "error");
      viz.activateEdge("data-in", "clinvar-scanner", false);
    }
  }, [clinvarScanStatus, clinvarScanProgress]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full"
      style={{ height: "280px", display: "block" }}
    />
  );
}

function applyEvent(viz: MeshViz, event: MeshEvent) {
  switch (event.type) {
    case "agent-start": {
      if (event.agent === "privacy-warden") {
        viz.setStatus("data-in", "done");
        viz.setStatus("privacy-warden", "running");
        viz.activateEdge("data-in", "privacy-warden", true);
        viz.burst("data-in", "privacy-warden", 6);
      } else if (event.agent === "kb-curator") {
        viz.setStatus("kb-curator", "running");
        viz.activateEdge("privacy-warden", "kb-curator", true);
        viz.burst("privacy-warden", "kb-curator", 6);
      } else if (event.agent === "oracle") {
        viz.setStatus("oracle", "running");
        viz.activateEdge("kb-curator", "oracle", true);
        viz.burst("kb-curator", "oracle", 6);
      } else if (event.agent === "cf-synthesizer") {
        viz.setStatus("cf-synthesizer", "running");
        viz.activateEdge("oracle", "cf-synthesizer", true);
        viz.burst("oracle", "cf-synthesizer", 5);
      }
      break;
    }

    case "tool-call": {
      if (event.tool === "batch_lookup_variants") {
        viz.activateEdge("kb-curator", "myvariant-info", true);
        viz.burst("kb-curator", "myvariant-info", 5);
      } else if (event.tool === "lookup_gene") {
        viz.activateEdge("kb-curator", "mygene-info", true);
        viz.burst("kb-curator", "mygene-info", 3);
      }
      break;
    }

    case "tool-result": {
      if (event.tool === "batch_lookup_variants") {
        viz.setStatus("myvariant-info", "done");
        viz.activateEdge("kb-curator", "myvariant-info", false);
      } else if (event.tool === "lookup_gene") {
        viz.setStatus("mygene-info", "done");
        viz.burst("mygene-info", "kb-curator", 2);
      }
      break;
    }

    case "oracle-ruling": {
      if (event.agent === "privacy-warden") {
        if (event.verdict === "deny") {
          viz.setStatus("privacy-warden", "deny");
          viz.activateEdge("data-in", "privacy-warden", false);
        } else {
          viz.setStatus("privacy-warden", "done");
          viz.activateEdge("data-in", "privacy-warden", false);
        }
      } else {
        viz.burst("kb-curator", "oracle", 2);
      }
      break;
    }

    case "agent-done": {
      if (event.agent === "kb-curator") {
        viz.setStatus("kb-curator", "done");
        viz.activateEdge("privacy-warden", "kb-curator", false);
        viz.setStatus("myvariant-info", "done");
        viz.setStatus("mygene-info", "done");
        viz.activateEdge("kb-curator", "mygene-info", false);
      }
      break;
    }

    case "agent-text": {
      if (event.agent === "cf-synthesizer") {
        viz.setStatus("cf-synthesizer", "done");
        viz.activateEdge("oracle", "cf-synthesizer", false);
        viz.activateEdge("cf-synthesizer", "data-out", true);
        viz.burst("cf-synthesizer", "data-out", 4);
      }
      break;
    }

    case "pipeline-done": {
      const allOk = event.stats.denied === 0;
      viz.setStatus("oracle", allOk ? "allow" : "revise");
      viz.activateEdge("kb-curator", "oracle", false);
      viz.activateEdge("oracle", "data-out", true);
      viz.burst("oracle", "data-out", 5);
      viz.setStatus("data-out", "done");
      break;
    }

    case "pipeline-blocked": {
      viz.setStatus("privacy-warden", "deny");
      break;
    }

    case "error": {
      viz.setStatus("kb-curator", "error");
      break;
    }
  }
}

// Pure canvas renderer for the genome-lens agent mesh.
// No dependencies — just the Canvas 2D API.

export type NodeStatus =
  | "idle"
  | "running"
  | "done"
  | "error"
  | "allow"
  | "revise"
  | "deny";

type NodeKind = "agent" | "oracle" | "mcp" | "data";

interface NodeDef {
  id: string;
  label: string;
  icon: string;
  kind: NodeKind;
  /** Fractional position 0–1 across canvas width/height */
  fx: number;
  fy: number;
}

interface LiveNode extends NodeDef {
  status: NodeStatus;
  phase: number; // random phase for float animation
}

interface Particle {
  fromId: string;
  toId: string;
  t: number;    // 0 → 1 along the edge
  speed: number;
}

// ── Graph definition ──────────────────────────────────────────────────────────

const NODE_DEFS: NodeDef[] = [
  // Data I/O
  { id: "data-in",          label: "rsids",          icon: "📄", kind: "data",   fx: 0.04, fy: 0.42 },
  { id: "data-out",         label: "results",        icon: "📊", kind: "data",   fx: 0.96, fy: 0.42 },
  // Real pipeline agents
  { id: "privacy-warden",   label: "privacy-warden", icon: "🔒", kind: "agent",  fx: 0.20, fy: 0.42 },
  { id: "kb-curator",       label: "kb-curator",     icon: "📚", kind: "agent",  fx: 0.38, fy: 0.42 },
  { id: "oracle",           label: "Oracle",         icon: "◈",  kind: "oracle", fx: 0.58, fy: 0.42 },
  { id: "cf-synthesizer",   label: "cf-synthesizer", icon: "✦",  kind: "agent",  fx: 0.78, fy: 0.42 },
  // Real external APIs called by kb-curator
  { id: "myvariant-info",   label: "myvariant.info", icon: "🧬", kind: "mcp",    fx: 0.30, fy: 0.82 },
  { id: "mygene-info",      label: "mygene.info",    icon: "🔬", kind: "mcp",    fx: 0.46, fy: 0.82 },
  // Full-genome ClinVar pathogenic scan (runs in parallel with mesh-analyze pipeline)
  { id: "clinvar-scanner",  label: "clinvar-scan",   icon: "🔍", kind: "agent",  fx: 0.50, fy: 0.12 },
];

const EDGE_PAIRS: [string, string][] = [
  ["data-in",        "privacy-warden"],
  ["privacy-warden", "kb-curator"],
  ["kb-curator",     "oracle"],
  ["oracle",         "cf-synthesizer"],
  ["cf-synthesizer", "data-out"],
  ["oracle",         "data-out"],
  ["kb-curator",     "myvariant-info"],
  ["kb-curator",     "mygene-info"],
  ["data-in",        "clinvar-scanner"],
  ["clinvar-scanner","data-out"],
];

// ── Color palette ─────────────────────────────────────────────────────────────

type ColorSet = { fill: string; stroke: string; text: string; glow: string };

const STATUS_COLORS: Record<NodeStatus, ColorSet> = {
  idle:    { fill: "rgba(255,255,255,0.03)",  stroke: "rgba(255,255,255,0.10)", text: "rgba(255,255,255,0.22)", glow: "" },
  running: { fill: "rgba(99,102,241,0.14)",   stroke: "rgba(99,102,241,0.90)",  text: "rgba(255,255,255,0.95)", glow: "rgba(99,102,241,0.45)" },
  done:    { fill: "rgba(16,185,129,0.08)",   stroke: "rgba(16,185,129,0.55)",  text: "rgba(52,211,153,0.85)",  glow: "" },
  error:   { fill: "rgba(239,68,68,0.10)",    stroke: "rgba(239,68,68,0.65)",   text: "rgba(248,113,113,0.90)", glow: "rgba(239,68,68,0.30)" },
  allow:   { fill: "rgba(16,185,129,0.14)",   stroke: "rgba(16,185,129,0.85)",  text: "rgba(52,211,153,1.0)",   glow: "rgba(16,185,129,0.40)" },
  revise:  { fill: "rgba(245,158,11,0.14)",   stroke: "rgba(245,158,11,0.85)",  text: "rgba(251,191,36,1.0)",   glow: "rgba(245,158,11,0.40)" },
  deny:    { fill: "rgba(239,68,68,0.14)",    stroke: "rgba(239,68,68,0.85)",   text: "rgba(248,113,113,1.0)",  glow: "rgba(239,68,68,0.40)" },
};

const EDGE_ACTIVE = "rgba(99,102,241,0.55)";
const EDGE_IDLE   = "rgba(255,255,255,0.06)";

const RADII: Record<NodeKind, number> = { agent: 22, oracle: 26, mcp: 17, data: 13 };

// ── MeshViz ───────────────────────────────────────────────────────────────────

export class MeshViz {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  private nodes = new Map<string, LiveNode>();
  private particles: Particle[] = [];
  private activeEdges = new Set<string>();
  private raf = 0;
  private tick = 0;
  private ro: ResizeObserver;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    for (const def of NODE_DEFS) {
      this.nodes.set(def.id, { ...def, status: "idle", phase: Math.random() * Math.PI * 2 });
    }

    this._resize();
    this.ro = new ResizeObserver(() => this._resize());
    this.ro.observe(canvas.parentElement ?? canvas);

    this._loop = this._loop.bind(this);
    this.raf = requestAnimationFrame(this._loop);
  }

  setStatus(id: string, s: NodeStatus) {
    const n = this.nodes.get(id);
    if (n) n.status = s;
  }

  activateEdge(from: string, to: string, on: boolean) {
    const k = `${from}→${to}`;
    on ? this.activeEdges.add(k) : this.activeEdges.delete(k);
  }

  burst(from: string, to: string, n = 5) {
    for (let i = 0; i < n; i++) {
      this.particles.push({ fromId: from, toId: to, t: (i / n) * 0.4, speed: 0.005 + Math.random() * 0.004 });
    }
  }

  resetAll() {
    for (const n of this.nodes.values()) n.status = "idle";
    this.activeEdges.clear();
    this.particles = [];
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
  }

  // ── internal ────────────────────────────────────────────────────────────────

  private _resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = el.clientWidth || 400;
    const h = this.canvas.offsetHeight || 280;
    this.canvas.width  = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width  = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private get W() { return this.canvas.width  / this.dpr; }
  private get H() { return this.canvas.height / this.dpr; }
  private cx(fx: number) { return fx * this.W; }
  private cy(fy: number) { return fy * this.H; }

  private _loop() {
    this.tick++;
    // advance particles
    this.particles = this.particles.filter((p) => {
      p.t += p.speed;
      return p.t < 1.08;
    });
    this._render();
    this.raf = requestAnimationFrame(this._loop);
  }

  private _render() {
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);

    this._drawEdges();
    this._drawParticles();
    this._drawNodes();
  }

  private _drawEdges() {
    const ctx = this.ctx;
    for (const [a, b] of EDGE_PAIRS) {
      const na = this.nodes.get(a);
      const nb = this.nodes.get(b);
      if (!na || !nb) continue;

      const active = this.activeEdges.has(`${a}→${b}`);
      const x1 = this.cx(na.fx);
      const y1 = this.cy(na.fy) + Math.sin(this.tick * 0.018 + na.phase) * 2;
      const x2 = this.cx(nb.fx);
      const y2 = this.cy(nb.fy) + Math.sin(this.tick * 0.018 + nb.phase) * 2;

      ctx.save();
      ctx.strokeStyle = active ? EDGE_ACTIVE : EDGE_IDLE;
      ctx.lineWidth   = active ? 1.5 : 0.8;
      if (!active) ctx.setLineDash([2, 7]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  private _drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const na = this.nodes.get(p.fromId);
      const nb = this.nodes.get(p.toId);
      if (!na || !nb) continue;

      const t = Math.min(p.t, 1);
      const floatA = Math.sin(this.tick * 0.018 + na.phase) * 2;
      const floatB = Math.sin(this.tick * 0.018 + nb.phase) * 2;
      const x = this.cx(na.fx) + (this.cx(nb.fx) - this.cx(na.fx)) * t;
      const y = (this.cy(na.fy) + floatA) + ((this.cy(nb.fy) + floatB) - (this.cy(na.fy) + floatA)) * t;

      // Fade out near the end
      const alpha = t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1;

      ctx.save();
      ctx.shadowColor = "rgba(99,102,241,0.8)";
      ctx.shadowBlur  = 8;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(99,102,241,${alpha})`;
      ctx.fill();
      ctx.restore();
    }
  }

  private _drawNodes() {
    for (const node of this.nodes.values()) {
      this._drawNode(node);
    }
  }

  private _drawNode(node: LiveNode) {
    const ctx = this.ctx;
    const r     = RADII[node.kind];
    const x     = this.cx(node.fx);
    const floatY = Math.sin(this.tick * 0.018 + node.phase) * 2;
    const y     = this.cy(node.fy) + floatY;
    const c     = STATUS_COLORS[node.status];
    const pulse = 0.65 + 0.35 * Math.sin(this.tick * 0.07 + node.phase);

    // Glow halo
    if (c.glow) {
      ctx.save();
      ctx.shadowColor = c.glow;
      ctx.shadowBlur  = 20 * pulse;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = c.glow.replace(/[\d.]+\)$/, "0.01)");
      ctx.fill();
      ctx.restore();
    }

    // Node shape
    ctx.save();
    ctx.beginPath();
    if (node.kind === "oracle") {
      // Diamond
      const rx = r * 0.85;
      ctx.moveTo(x,      y - r);
      ctx.lineTo(x + rx, y);
      ctx.lineTo(x,      y + r);
      ctx.lineTo(x - rx, y);
      ctx.closePath();
    } else {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fillStyle   = c.fill;
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth   = node.kind === "oracle" ? 2 : 1.5;
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Running: rotating arc overlay
    if (node.status === "running") {
      const a = (this.tick * 0.08) % (Math.PI * 2);
      ctx.save();
      ctx.strokeStyle = "rgba(99,102,241,0.6)";
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, r + 4, a, a + 1.2);
      ctx.stroke();
      ctx.restore();
    }

    // Icon
    ctx.save();
    ctx.font          = `${r < 16 ? 11 : 13}px serif`;
    ctx.textAlign     = "center";
    ctx.textBaseline  = "middle";
    ctx.fillText(node.icon, x, y - 1);
    ctx.restore();

    // Label
    ctx.save();
    ctx.font          = `${node.kind === "mcp" ? 7.5 : 8.5}px ui-monospace, monospace`;
    ctx.textAlign     = "center";
    ctx.textBaseline  = "top";
    ctx.fillStyle     = c.text;
    ctx.fillText(node.label, x, y + r + 5);
    ctx.restore();
  }
}

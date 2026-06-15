import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { useMemo, useState } from "react";
import type { Finding } from "../../analysis/types";
import { useGenomeStore } from "../../state/store";
import { CATEGORY_COLOR, CATEGORY_LABEL, TIER_SIZE } from "../common/colors";
import { CHROM_LENGTHS_GRCH37, CHROM_ORDER } from "../trace/chromInfo";

// MT is too short to render usefully — show only the 24 standard chromosomes
const DISPLAY_CHROMS = CHROM_ORDER.filter((c) => c !== "MT");

const MAX_LEN = CHROM_LENGTHS_GRCH37["1"];
const MAX_HEIGHT = 7.5; // scene units for chr1
const SPACING   = 1.12;
const BAR_W     = 0.27;
const BAR_D     = 0.15;

// Approximate centromere position as fraction from p-arm tip (top of bar)
// Sources: UCSC Genome Browser GRCh37 centromere tracks
const CENTROMERE_FRAC: Record<string, number> = {
  "1": 0.48, "2": 0.40, "3": 0.46, "4": 0.29, "5": 0.28,
  "6": 0.37, "7": 0.38, "8": 0.30, "9": 0.34, "10": 0.29,
  "11": 0.40, "12": 0.37, "13": 0.17, "14": 0.17, "15": 0.19,
  "16": 0.45, "17": 0.34, "18": 0.22, "19": 0.44, "20": 0.43,
  "21": 0.29, "22": 0.27, X: 0.39, Y: 0.26,
};

interface BarDef {
  chrom: string;
  x: number;
  height: number;
  cFrac: number;
}

function buildLayout(): BarDef[] {
  const n = DISPLAY_CHROMS.length;
  const totalW = (n - 1) * SPACING;
  return DISPLAY_CHROMS.map((chrom, i) => ({
    chrom,
    x: i * SPACING - totalW / 2,
    height: Math.max(0.55, (CHROM_LENGTHS_GRCH37[chrom] / MAX_LEN) * MAX_HEIGHT),
    cFrac: CENTROMERE_FRAC[chrom] ?? 0.4,
  }));
}

// ── Chromosome idiogram bar ───────────────────────────────────────────────────

function ChromBar({ def, selected }: { def: BarDef; selected: boolean }) {
  const gap   = 0.055;
  const pH    = Math.max(def.cFrac * def.height - gap / 2, 0.05);
  const qH    = Math.max((1 - def.cFrac) * def.height - gap / 2, 0.05);
  const pY    =  def.height / 2 - pH / 2;
  const qY    = -def.height / 2 + qH / 2;
  const cY    =  def.height / 2 - def.cFrac * def.height;
  const color = selected ? "#2d5ab8" : "#1b2f5e";
  const cColor = selected ? "#6688e8" : "#3d5ab8";

  return (
    <group position={[def.x, 0, 0]}>
      {/* p-arm */}
      <mesh position={[0, pY, 0]}>
        <boxGeometry args={[BAR_W, pH, BAR_D]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.1} />
      </mesh>
      {/* Centromere constriction */}
      <mesh position={[0, cY, 0.01]}>
        <boxGeometry args={[BAR_W * 0.6, gap * 2.8, BAR_D + 0.02]} />
        <meshStandardMaterial color={cColor} roughness={0.35} metalness={0.2} emissive={cColor} emissiveIntensity={0.35} />
      </mesh>
      {/* q-arm */}
      <mesh position={[0, qY, 0]}>
        <boxGeometry args={[BAR_W, qH, BAR_D]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.1} />
      </mesh>
      {/* Chromosome number label */}
      <Html
        position={[0, -(def.height / 2) - 0.48, 0]}
        center
        zIndexRange={[0, 10]}
        style={{ pointerEvents: "none" }}
      >
        <span
          style={{
            fontSize: "8px",
            lineHeight: 1,
            color: selected ? "rgba(130,160,255,0.85)" : "rgba(255,255,255,0.38)",
            fontFamily: "ui-monospace, monospace",
            whiteSpace: "nowrap",
            userSelect: "none",
            display: "block",
            textAlign: "center",
          }}
        >
          {def.chrom}
        </span>
      </Html>
    </group>
  );
}

// ── Variant marker ────────────────────────────────────────────────────────────

function Marker({
  finding,
  def,
  isSelected,
  onSelect,
}: {
  finding: Finding;
  def: BarDef;
  isSelected: boolean;
  onSelect: (rsid: string) => void;
}) {
  const [hov, setHov] = useState(false);
  const v = finding.variant!;
  const chromLen = CHROM_LENGTHS_GRCH37[def.chrom] ?? 1;
  const frac = Math.min(v.pos / chromLen, 1);
  // frac=0 → p-arm tip (top), frac=1 → q-arm tip (bottom)
  const markerY = def.height / 2 - frac * def.height;
  const color = CATEGORY_COLOR[finding.entry.category];
  const r = 0.07 * TIER_SIZE[finding.entry.tier];
  const active = hov || isSelected;

  return (
    <mesh
      position={[def.x, markerY, BAR_D / 2 + r + 0.02]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(finding.entry.rsid);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHov(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHov(false);
        document.body.style.cursor = "";
      }}
      scale={active ? 1.9 : 1}
    >
      <sphereGeometry args={[r, 14, 14]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={active ? 2.0 : 1.0}
        roughness={0.2}
        metalness={0.05}
      />
    </mesh>
  );
}

// ── 3D scene ──────────────────────────────────────────────────────────────────

function Scene({
  findings,
  selectedRsid,
  onSelect,
}: {
  findings: Finding[];
  selectedRsid: string | null;
  onSelect: (rsid: string) => void;
}) {
  const layout = useMemo(buildLayout, []);
  const byChrom = useMemo(() => {
    const m = new Map<string, BarDef>();
    for (const d of layout) m.set(d.chrom, d);
    return m;
  }, [layout]);

  const covered = useMemo(
    () => findings.filter((f) => f.covered && f.variant),
    [findings],
  );

  // Which chrom has the selected marker?
  const selectedChrom = useMemo(() => {
    if (!selectedRsid) return null;
    return covered.find((f) => f.entry.rsid === selectedRsid)?.variant?.chrom ?? null;
  }, [covered, selectedRsid]);

  return (
    <>
      <color attach="background" args={["#090c18"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 9, 7]} intensity={1.1} />
      <pointLight position={[-10, -3, 6]} intensity={0.6} color="#2244cc" />
      <pointLight position={[10,  6, 4]} intensity={0.3} color="#ffffff" />

      {layout.map((def) => (
        <ChromBar key={def.chrom} def={def} selected={def.chrom === selectedChrom} />
      ))}

      {covered.map((f) => {
        const def = byChrom.get(f.variant!.chrom);
        if (!def) return null;
        return (
          <Marker
            key={f.entry.rsid}
            finding={f}
            def={def}
            isSelected={f.entry.rsid === selectedRsid}
            onSelect={onSelect}
          />
        );
      })}

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        makeDefault
        target={[0, 0.8, 0]}
        minDistance={5}
        maxDistance={45}
      />
    </>
  );
}

// ── Category legend ───────────────────────────────────────────────────────────

function Legend() {
  const cats = Object.entries(CATEGORY_COLOR) as [
    keyof typeof CATEGORY_COLOR,
    string,
  ][];
  return (
    <div className="absolute bottom-3 left-3 rounded-lg border border-white/10 bg-black/65 px-2.5 py-2 backdrop-blur-sm">
      <p className="mb-1.5 text-[9px] font-medium uppercase tracking-wider text-white/28">
        Category
      </p>
      <div className="space-y-1">
        {cats.map(([cat, color]) => (
          <div key={cat} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-[9px] text-white/50">
              {CATEGORY_LABEL[cat]}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 border-t border-white/8 pt-1.5">
        <p className="text-[8px] text-white/25">
          Marker size = evidence tier A › B › C
        </p>
      </div>
    </div>
  );
}

// ── Finding detail overlay ────────────────────────────────────────────────────

function SelectedPanel({ findings, rsid }: { findings: Finding[]; rsid: string }) {
  const f = findings.find((x) => x.entry.rsid === rsid);
  if (!f) return null;
  const color = CATEGORY_COLOR[f.entry.category];
  return (
    <div className="absolute right-3 top-3 w-52 rounded-lg border border-white/12 bg-black/70 px-3 py-2.5 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="font-mono text-xs font-semibold text-white/85">{f.entry.rsid}</span>
        <span className="ml-auto rounded border border-white/10 bg-white/5 px-1 py-px text-[9px] font-bold text-white/40">
          {f.entry.tier}
        </span>
      </div>
      <p className="text-[10px] text-white/55">{f.entry.gene}</p>
      <p className="text-[10px] text-white/40 mt-0.5">{f.entry.category}</p>
      {f.genotype && (
        <p className="mt-1.5 font-mono text-xs text-white/70">
          Genotype: <span className="text-white/90">{f.genotype}</span>
        </p>
      )}
      <p className="mt-1.5 text-[10px] leading-relaxed text-white/45 line-clamp-3">
        {f.interpretation}
      </p>
      <p className="mt-1 text-[9px] text-white/25">
        chr{f.variant?.chrom}:{f.variant?.pos?.toLocaleString()}
      </p>
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

export function Karyotype3D() {
  const findings     = useGenomeStore((s) => s.findings);
  const selectedRsid = useGenomeStore((s) => s.selectedRsid);
  const selectVariant = useGenomeStore((s) => s.selectVariant);
  const [contextLost, setContextLost] = useState(false);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-4">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white/90">Idiogram karyotype</h2>
          <p className="mt-0.5 text-xs text-white/45">
            Chromosomes 1–22, X, Y scaled to GRCh37 lengths · centromere constriction shown ·
            click a marker to inspect
          </p>
        </div>
        <p className="text-[10px] text-white/25 hidden sm:block">
          Drag to rotate · scroll to zoom · shift-drag to pan
        </p>
      </div>

      <div className="relative h-[62vh] min-h-[380px] overflow-hidden rounded-xl border border-white/8 bg-[#090c18]">
        {contextLost ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-sm text-white/50">WebGL context lost by the browser.</p>
            <button
              onClick={() => setContextLost(false)}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/65 hover:bg-white/5"
            >
              Reload 3D view
            </button>
          </div>
        ) : (
          <>
            <Canvas
              camera={{ position: [0, 2.5, 24], fov: 62 }}
              frameloop="demand"
              dpr={[1, 1.5]}
              gl={{ powerPreference: "default", failIfMajorPerformanceCaveat: false, antialias: true }}
              onCreated={({ gl }) => {
                gl.domElement.addEventListener("webglcontextlost", (e) => {
                  e.preventDefault();
                  setContextLost(true);
                });
              }}
            >
              <Scene
                findings={findings}
                selectedRsid={selectedRsid}
                onSelect={selectVariant}
              />
            </Canvas>
            <Legend />
            {selectedRsid && (
              <SelectedPanel findings={findings} rsid={selectedRsid} />
            )}
          </>
        )}
      </div>

      <p className="mt-2 text-[10px] text-white/25">
        Markers are KB-matched variants colored by category and sized by evidence tier (A largest).
        The 2D trace view carries the full detail for each finding.
      </p>
    </div>
  );
}

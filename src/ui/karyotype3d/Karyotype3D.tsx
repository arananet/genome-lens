import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useState } from "react";
import type { Finding } from "../../analysis/types";
import { useGenomeStore } from "../../state/store";
import { CATEGORY_COLOR, TIER_SIZE } from "../common/colors";
import { CHROM_LENGTHS_GRCH37, CHROM_ORDER } from "../trace/chromInfo";

const MAX_LEN = CHROM_LENGTHS_GRCH37["1"];
const BAR_HEIGHT = 6; // world units for the longest chromosome
const SPACING = 1.4;
const PER_ROW = 13;

interface BarLayout {
  chrom: string;
  x: number;
  z: number;
  height: number;
}

function layout(): BarLayout[] {
  return CHROM_ORDER.map((chrom, i) => {
    const row = Math.floor(i / PER_ROW);
    const col = i % PER_ROW;
    const height = Math.max(0.4, (CHROM_LENGTHS_GRCH37[chrom] / MAX_LEN) * BAR_HEIGHT);
    return {
      chrom,
      x: (col - PER_ROW / 2) * SPACING,
      z: row * 2.4 - 1.2,
      height,
    };
  });
}

function Marker({
  finding,
  bar,
  onSelect,
}: {
  finding: Finding;
  bar: BarLayout;
  onSelect: (rsid: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const v = finding.variant!;
  const frac = v.pos / (CHROM_LENGTHS_GRCH37[bar.chrom] ?? 1);
  const y = frac * bar.height - bar.height / 2;
  const color = CATEGORY_COLOR[finding.entry.category];
  const r = 0.12 * TIER_SIZE[finding.entry.tier];

  return (
    <mesh
      position={[bar.x, y, bar.z + 0.35]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(finding.entry.rsid);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      scale={hovered ? 1.6 : 1}
    >
      <sphereGeometry args={[r, 16, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 1.4 : 0.7} />
    </mesh>
  );
}

function ChromosomeBar({ bar }: { bar: BarLayout }) {
  return (
    <mesh position={[bar.x, 0, bar.z]}>
      <cylinderGeometry args={[0.18, 0.18, bar.height, 20]} />
      <meshStandardMaterial color="#3a4a6b" />
    </mesh>
  );
}

function Scene({ findings, onSelect }: { findings: Finding[]; onSelect: (rsid: string) => void }) {
  const bars = useMemo(layout, []);
  const barByChrom = useMemo(() => {
    const m = new Map<string, BarLayout>();
    for (const b of bars) m.set(b.chrom, b);
    return m;
  }, [bars]);
  const covered = useMemo(() => findings.filter((f) => f.covered && f.variant), [findings]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[10, 10, 10]} intensity={1.2} />
      <pointLight position={[-10, -5, -10]} intensity={0.4} />
      {bars.map((b) => (
        <ChromosomeBar key={b.chrom} bar={b} />
      ))}
      {covered.map((f) => {
        const bar = barByChrom.get(f.variant!.chrom);
        if (!bar) return null;
        return <Marker key={f.entry.rsid} finding={f} bar={bar} onSelect={onSelect} />;
      })}
      <OrbitControls enablePan enableZoom enableRotate makeDefault />
    </>
  );
}

export function Karyotype3D() {
  const findings = useGenomeStore((s) => s.findings);
  const selectVariant = useGenomeStore((s) => s.selectVariant);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4">
      <h2 className="text-lg font-semibold">3D karyotype</h2>
      <p className="mt-1 text-sm text-white/70">
        Drag to rotate, pinch/scroll to zoom. Markers are KB-matched variants, colored by category
        and sized by evidence tier. Tap a marker for its detail.
      </p>
      <div className="mt-3 h-[60vh] min-h-[360px] overflow-hidden rounded-xl border border-white/10 bg-black/40">
        <Canvas camera={{ position: [0, 0, 14], fov: 50 }}>
          <Scene findings={findings} onSelect={selectVariant} />
        </Canvas>
      </div>
      <p className="mt-2 text-xs text-white/50">
        This view is a navigational layer. The 2D trace remains the source of truth for reading
        values.
      </p>
    </div>
  );
}

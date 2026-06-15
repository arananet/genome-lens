import { useGenomeStore } from "../../state/store";

// Privacy status strip — read-only, no persistence options exposed.
// DNA data lives only in memory for the duration of this session.
export function PrivacyBar() {
  const genome = useGenomeStore((s) => s.genome);
  if (!genome) return null;

  return (
    <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-2 text-xs text-white/50">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Processed locally · never uploaded · session only
      </span>
    </div>
  );
}

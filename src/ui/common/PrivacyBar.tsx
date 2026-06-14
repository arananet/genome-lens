import { useGenomeStore } from "../../state/store";

// Thin strip exposing the opt-in "keep in this browser" persistence toggle.
// Off by default — nothing is stored unless the user turns this on.
export function PrivacyBar() {
  const genome = useGenomeStore((s) => s.genome);
  const persistEnabled = useGenomeStore((s) => s.persistEnabled);
  const setPersist = useGenomeStore((s) => s.setPersist);
  if (!genome) return null;

  return (
    <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-2 text-xs text-white/60">
      <span>Processed locally · never uploaded.</span>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={persistEnabled}
          onChange={(e) => void setPersist(e.target.checked)}
          className="h-4 w-4 accent-indigo-500"
        />
        Keep in this browser (IndexedDB)
      </label>
    </div>
  );
}

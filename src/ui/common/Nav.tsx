import { useGenomeStore, type View } from "../../state/store";

const TABS: { id: View; label: string; icon: string }[] = [
  { id: "trace", label: "Trace", icon: "📈" },
  { id: "karyotype", label: "3D", icon: "🧬" },
  { id: "reports", label: "Reports", icon: "📋" },
  { id: "search", label: "Search", icon: "🔎" },
  { id: "wiki", label: "Wiki", icon: "📖" },
];

// Top bar on desktop, bottom tab bar on mobile.
export function Nav() {
  const view = useGenomeStore((s) => s.view);
  const setView = useGenomeStore((s) => s.setView);
  const wipeAll = useGenomeStore((s) => s.wipeAll);
  const fileName = useGenomeStore((s) => s.fileName);
  const genome = useGenomeStore((s) => s.genome);

  if (!genome) return null;

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/10 bg-[#0b1020]/90 px-4 py-2.5 backdrop-blur">
        <div className="min-w-0">
          <span className="font-bold">genome-lens</span>
          <span className="ml-2 truncate text-xs text-white/50">{fileName}</span>
        </div>
        <div className="flex items-center gap-2">
          <nav className="hidden gap-1 sm:flex">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  view === t.id ? "bg-white/10 text-white" : "text-white/60 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <button
            onClick={() => void wipeAll()}
            className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-300 hover:bg-red-500/20"
          >
            Wipe all data
          </button>
        </div>
      </header>

      {/* Bottom tab bar (mobile) */}
      <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-30 flex border-t border-white/10 bg-[#0b1020]/95 backdrop-blur sm:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
              view === t.id ? "text-indigo-300" : "text-white/60"
            }`}
          >
            <span className="text-base">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </>
  );
}

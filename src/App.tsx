import { Suspense, lazy, useEffect } from "react";
import { useGenomeStore } from "./state/store";
import { FirstUploadNotice } from "./ui/upload/FirstUploadNotice";
import { UploadPane } from "./ui/upload/UploadPane";
import { Nav } from "./ui/common/Nav";
import { PrivacyBar } from "./ui/common/PrivacyBar";
import { Footer } from "./ui/common/Footer";
import { TraceBrowser } from "./ui/trace/TraceBrowser";
import { Reports } from "./ui/reports/Reports";
import { Search } from "./ui/search/Search";
import { Wiki } from "./ui/wiki/Wiki";
import { VariantDetail } from "./ui/variant/VariantDetail";

// 3D view is heavy (three.js) — load it on demand.
const Karyotype3D = lazy(() =>
  import("./ui/karyotype3d/Karyotype3D").then((m) => ({ default: m.Karyotype3D })),
);

export default function App() {
  const genome = useGenomeStore((s) => s.genome);
  const view = useGenomeStore((s) => s.view);
  const setView = useGenomeStore((s) => s.setView);
  const hydrate = useGenomeStore((s) => s.hydrateFromPersistence);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // The wiki/glossary is reference content — reachable with or without a genome.
  const showWiki = view === "wiki";

  return (
    <div className="flex min-h-full flex-col pb-16 sm:pb-0">
      <FirstUploadNotice />
      <Nav />
      <PrivacyBar />

      <main className="flex-1">
        {!genome && !showWiki && <UploadPane />}

        {showWiki && (
          <div>
            {!genome && (
              <div className="mx-auto w-full max-w-3xl px-4 pt-4">
                <button
                  onClick={() => setView("upload")}
                  className="text-sm text-indigo-300 hover:text-indigo-200"
                >
                  ← Back to upload
                </button>
              </div>
            )}
            <Wiki />
          </div>
        )}

        {genome && !showWiki && view === "trace" && <TraceBrowser />}
        {genome && !showWiki && view === "karyotype" && (
          <Suspense fallback={<p className="px-4 py-8 text-center text-white/60">Loading 3D…</p>}>
            <Karyotype3D />
          </Suspense>
        )}
        {genome && !showWiki && view === "reports" && <Reports />}
        {genome && !showWiki && view === "search" && <Search />}
      </main>

      <Footer />
      <VariantDetail />
    </div>
  );
}

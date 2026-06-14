import { Suspense, lazy, useEffect } from "react";
import { useGenomeStore } from "./state/store";
import { FirstUploadNotice } from "./ui/upload/FirstUploadNotice";
import { UploadPane } from "./ui/upload/UploadPane";
import { Nav } from "./ui/common/Nav";
import { PrivacyBar } from "./ui/common/PrivacyBar";
import { TraceBrowser } from "./ui/trace/TraceBrowser";
import { Reports } from "./ui/reports/Reports";
import { Search } from "./ui/search/Search";
import { VariantDetail } from "./ui/variant/VariantDetail";

// 3D view is heavy (three.js) — load it on demand.
const Karyotype3D = lazy(() =>
  import("./ui/karyotype3d/Karyotype3D").then((m) => ({ default: m.Karyotype3D })),
);

export default function App() {
  const genome = useGenomeStore((s) => s.genome);
  const view = useGenomeStore((s) => s.view);
  const hydrate = useGenomeStore((s) => s.hydrateFromPersistence);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <div className="min-h-full pb-16 sm:pb-0">
      <FirstUploadNotice />
      <Nav />
      <PrivacyBar />

      {!genome && <UploadPane />}

      {genome && view === "trace" && <TraceBrowser />}
      {genome && view === "karyotype" && (
        <Suspense fallback={<p className="px-4 py-8 text-center text-white/60">Loading 3D…</p>}>
          <Karyotype3D />
        </Suspense>
      )}
      {genome && view === "reports" && <Reports />}
      {genome && view === "search" && <Search />}

      <VariantDetail />
    </div>
  );
}

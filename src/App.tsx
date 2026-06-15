import { Suspense, lazy } from "react";
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
import { HealthReport } from "./ui/report/HealthReport";
import { Report24G } from "./ui/report/Report24G";

// 3D view is heavy (three.js) — load it on demand.
const Karyotype3D = lazy(() =>
  import("./ui/karyotype3d/Karyotype3D").then((m) => ({ default: m.Karyotype3D })),
);

export default function App() {
  const genome = useGenomeStore((s) => s.genome);
  const healthReport = useGenomeStore((s) => s.healthReport);
  const report24G = useGenomeStore((s) => s.report24G);
  const fileName = useGenomeStore((s) => s.fileName);
  const closeReport24G = useGenomeStore((s) => s.closeReport24G);
  const view = useGenomeStore((s) => s.view);
  const setView = useGenomeStore((s) => s.setView);
  const wipeAll = useGenomeStore((s) => s.wipeAll);

  const showWiki = view === "wiki";
  const hasData = genome || healthReport || report24G;

  return (
    <div className="flex min-h-full flex-col pb-16 sm:pb-0">
      <FirstUploadNotice />
      <Nav />
      <PrivacyBar />

      <main className="flex-1">
        {!hasData && !showWiki && <UploadPane />}

        {showWiki && (
          <div>
            {!hasData && (
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

        {/* GWAS health report mode — shows the HealthReport directly */}
        {healthReport && !showWiki && (
          <HealthReport
            report={healthReport}
            fileName={fileName ?? ""}
            onClose={() => void wipeAll()}
          />
        )}

        {/* Raw genome mode — standard pipeline views */}
        {genome && !healthReport && !showWiki && view === "trace" && <TraceBrowser />}
        {genome && !healthReport && !showWiki && view === "karyotype" && (
          <Suspense fallback={<p className="px-4 py-8 text-center text-white/60">Loading 3D…</p>}>
            <Karyotype3D />
          </Suspense>
        )}
        {genome && !healthReport && !showWiki && view === "reports" && <Reports />}
        {genome && !healthReport && !showWiki && view === "search" && <Search />}
      </main>

      <Footer />
      <VariantDetail />

      {report24G && (
        <Report24G
          report={report24G}
          fileName={fileName ?? "24Genetics report"}
          onClose={closeReport24G}
        />
      )}
    </div>
  );
}

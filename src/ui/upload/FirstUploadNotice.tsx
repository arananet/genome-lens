import { useGenomeStore } from "../../state/store";

// One-time notice shown before the first upload: data stays local.
export function FirstUploadNotice() {
  const acknowledged = useGenomeStore((s) => s.noticeAcknowledged);
  const acknowledge = useGenomeStore((s) => s.acknowledgeNotice);
  if (acknowledged) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#11162a] p-5 shadow-xl">
        <h2 className="text-lg font-semibold">Your data stays on this device</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/80">
          genome-lens processes your DNA file entirely in your browser. It is{" "}
          <strong>not uploaded anywhere</strong>. Closing or clearing this tab
          clears the data. Nothing is saved unless you explicitly turn on
          “keep in this browser”.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-amber-200/80">
          Educational use only — not medical advice or a diagnosis.
        </p>
        <button
          onClick={acknowledge}
          className="mt-5 w-full rounded-lg bg-indigo-500 px-4 py-2.5 font-medium text-white hover:bg-indigo-400"
        >
          I understand
        </button>
      </div>
    </div>
  );
}

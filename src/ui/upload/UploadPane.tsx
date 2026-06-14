import { useCallback, useRef, useState } from "react";
import { useGenomeStore } from "../../state/store";
import { Disclaimer } from "../common/Disclaimer";

export function UploadPane() {
  const loadFile = useGenomeStore((s) => s.loadFile);
  const setView = useGenomeStore((s) => s.setView);
  const status = useGenomeStore((s) => s.status);
  const error = useGenomeStore((s) => s.error);
  const fileName = useGenomeStore((s) => s.fileName);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🧬</span>
          <h1 className="bg-gradient-to-r from-indigo-300 to-cyan-300 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
            genome-lens
          </h1>
        </div>
        <p className="mt-1 text-sm text-white/70">
          Upload a raw DNA export to explore it privately, in your browser. Nothing
          is uploaded.
        </p>
        <button
          onClick={() => setView("wiki")}
          className="mt-2 text-sm text-indigo-300 hover:text-indigo-200"
        >
          New to this? Browse the glossary →
        </button>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={`flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition ${
          dragging ? "border-indigo-400 bg-indigo-500/10" : "border-white/15 bg-white/[0.02]"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.csv,.tsv,.zip"
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        {status === "parsing" ? (
          <p className="text-sm text-white/80">Parsing {fileName}…</p>
        ) : (
          <>
            <p className="text-base font-medium">Drop your DNA file here</p>
            <p className="text-sm text-white/60">or tap to browse — .txt, .csv, or .zip</p>
          </>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="text-sm text-white/70">
        <p className="font-medium text-white/90">Supported formats</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>23andMe raw data (.txt)</li>
          <li>AncestryDNA raw data (.txt)</li>
          <li>MyHeritage raw data (.csv), including low-pass WGS</li>
        </ul>
      </div>

      <Disclaimer />
    </div>
  );
}

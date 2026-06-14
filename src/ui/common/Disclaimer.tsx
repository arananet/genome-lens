export const GLOBAL_DISCLAIMER =
  "Educational use only. Not medical advice, not a diagnosis. Consumer DNA data can contain errors and gaps. Confirm any actionable finding with a clinical-grade test and a clinician.";

export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <p
      role="note"
      className={`rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-200/90 ${className}`}
    >
      {GLOBAL_DISCLAIMER}
    </p>
  );
}

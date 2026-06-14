export function Footer() {
  return (
    <footer className="mx-auto mt-8 w-full max-w-4xl px-4 py-6 text-center text-xs text-white/40">
      <p>
        Educational use only — not medical advice or a diagnosis. Your DNA is
        processed locally and never uploaded.
      </p>
      <p className="mt-1.5">
        genome-lens · developed by <span className="text-white/60">Eduardo Arana</span> ·{" "}
        <a
          href="https://github.com/arananet/genome-lens"
          target="_blank"
          rel="noreferrer noopener"
          className="underline decoration-dotted hover:text-white/70"
        >
          source
        </a>
      </p>
    </footer>
  );
}

# genome-lens

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white) ![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-gray) ![three.js](https://img.shields.io/badge/three.js-gray) ![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?logo=cloudflare&logoColor=white) ![Vitest](https://img.shields.io/badge/Vitest-gray) ![OpenSpec](https://img.shields.io/badge/OpenSpec-enforced-blueviolet) ![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

> Local-first personal genomics viewer. Upload a raw DNA export, inspect it, and
> surface evidence-tiered variant associations across health, fitness, body
> composition, and vision — **entirely in your browser**.

**Educational use only. Not medical advice, not a diagnosis.**

---

## What it does

Turn a raw DNA export (23andMe, AncestryDNA, MyHeritage) into an honest, private,
navigable view of what is known and what is not:

- **Parses locally** — your raw DNA file never leaves your device. No upload
  endpoint, no telemetry on genetic data.
- **Evidence-tiered** — every variant claim cites a real source (ClinVar,
  GWAS Catalog, PharmGKB, SNPedia…) and a confidence tier (A/B/C). Nothing
  fabricated.
- **Honest about gaps** — flags imputation, low-pass calls, and SNPs that are
  simply absent from your file (not a negative result).
- **2D trace browser** — manhattan overview + per-chromosome linear tracks.
- **3D karyotype** — a navigational layer rendered with three.js.
- **Four tiered reports** — health/disease, fitness, body composition, vision.
- **Optional AI explainer** — opt-in plain-language explanations via Cloudflare
  Workers AI. Your raw genome file is **never** sent; see [Privacy](#privacy).

---

## Quick start

```bash
git clone https://github.com/arananet/genome-lens.git
cd genome-lens
npm install

npm run dev      # start the local dev server (Vite)
npm test         # run the test suite (Vitest)
npm run build    # produce a static SPA in dist/
```

Open the dev URL Vite prints, then drag-drop a raw DNA file (`.txt`, `.csv`,
or `.zip`). Everything runs client-side.

---

## Usage

1. Drag a 23andMe / AncestryDNA / MyHeritage raw-data export onto the upload pane.
2. genome-lens auto-detects the format, parses it locally, and reports source,
   variant count, build, and whether the method was low-pass.
3. Browse the 2D trace, spin the 3D karyotype, or open any knowledge-base match
   to see genotype, tier, sources, and caveats.
4. Read the four tiered reports.
5. Hit **Wipe all data** to clear everything from the tab.

---

## Deployment

### Static SPA (Railway)

The app is a static SPA. On Railway it builds with `npm run build` and is served
from `dist/` by [`serve`](https://www.npmjs.com/package/serve). Config lives in
[`railway.json`](railway.json) and [`nixpacks.toml`](nixpacks.toml).

```bash
npm run build
npm run start    # serve dist/ on $PORT (used by Railway)
```

### AI explainer (Cloudflare Worker)

The optional LLM explainer is a separate Cloudflare Worker in
[`worker/`](worker/) that proxies to Cloudflare Workers AI. Deploy it with
Wrangler and point the SPA at it via `VITE_AI_WORKER_URL`. See
[`worker/README.md`](worker/README.md).

---

## Privacy

- Your raw DNA file is parsed in-browser and is **never uploaded**.
- No `localStorage`/`IndexedDB` persistence by default. An explicit opt-in
  "keep in this browser" toggle stores to IndexedDB; a one-tap wipe clears it.
- The optional AI explainer sends **only** the single variant context you ask
  about (rsid, gene, genotype, and the already-public knowledge-base note) — and
  only after you opt in per request. The raw genome file is never transmitted.
- A strict Content-Security-Policy forbids outbound connections except to the
  app's own origin and the configured AI worker.

---

## Contributing

This project uses **OpenSpec** for spec-driven development — every feature or
bugfix starts with a spec under `.openspec/specs/`. See
[`docs/OPENSPEC.md`](docs/OPENSPEC.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## License

[MIT](LICENSE)

---

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/H2H51MPWG)

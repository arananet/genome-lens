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
- **Glossary & wiki** — plain-language genomics definitions, backed by a Markdown
  LLM-wiki (`wiki/`) that doubles as the agent mesh's memory.
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

### 24Genetics health reports

Drop a **24Genetics** health report (the plain-text extraction of the PDF) onto
the same upload pane and genome-lens auto-detects it. Instead of the SNP
knowledge-base pipeline, it surfaces 24Genetics' own pre-computed verdicts in a
printable **Genetic Health Report**: elevated / reduced population-relative
risks, pharmacogenetics drug responses, biomarker levels, and a hereditary &
oncogenic mutation-screening summary. Use **Print / Save as PDF** to export it.
The ~800 negative hereditary screens are collapsed into a single summary line so
the report stays readable.

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
- **No persistence** — genome data exists only in browser memory for the duration of the session. There is no login, no user account, and no IndexedDB storage.
- The optional AI explainer sends **only** the single variant context you ask about (rsid, gene, genotype, and the already-public knowledge-base note) — opt-in per request. The raw genome file is never transmitted.
- The optional AI synthesis sends **only** aggregate counts (`parsed N · covered M`) — no rsids, no genotypes.
- A strict Content-Security-Policy forbids outbound connections except to the app's own origin.

---

## Architecture

### Data pipeline (runtime)

Every genome analysis runs entirely in your browser — no upload ever occurs.

```mermaid
flowchart LR
    subgraph browser["Browser (client-side only)"]
        FILE([Raw DNA file\n.txt / .csv / .zip])
        PARSE[parser-smith\nparse + normalise]
        KB[kb-curator\nmatch knowledge base]
        ORACLE_B[Oracle\nreview each finding]
        UI[ui-polisher\nrender trace / reports]
        EXPLAIN[AI Explainer\nopt-in per variant]
    end

    subgraph server["Railway Express server"]
        API_EXPLAIN[POST /api/explain]
        API_SYNTH[POST /api/synthesize]
        CF[Cloudflare Workers AI\n@cf/nvidia/nemotron-3-120b-a12b]
    end

    FILE -->|local parse| PARSE
    PARSE -->|variants| KB
    KB -->|findings| ORACLE_B
    ORACLE_B -->|allow / revise| UI
    UI -->|single variant context\nrsid, gene, public KB note| EXPLAIN
    EXPLAIN -->|opt-in POST| API_EXPLAIN
    API_EXPLAIN --> CF
    UI -->|aggregate counts only\nno rsids, no genotypes| API_SYNTH
    API_SYNTH --> CF
```

**Privacy invariant**: the raw genome file and individual genotypes never leave the browser. The server receives only (a) single-variant public-KB context when you click *Explain* (opt-in), or (b) aggregate category counts for *Synthesize*.

---

### Agent mesh, Oracle & LLM-wiki

The **agent mesh** is the development governance layer. It coordinates five specialised agents under a rule-based **Oracle** that enforces non-negotiable invariants. All agent decisions are logged to a Markdown **LLM-wiki** that doubles as shared memory across sessions.

```mermaid
flowchart TD
    subgraph agents["Agent Mesh"]
        PS[⚙ parser-smith\nparse & normalise DNA files]
        KC[📚 kb-curator\ncurate knowledge-base entries]
        PW[🔒 privacy-warden\nenforce data-egress rules]
        UP[✦ ui-polisher\nwrite user-facing copy]
        GS[📖 glossary-scribe\nmaintain wiki glossary]
    end

    subgraph oracle["Oracle (src/mesh/oracle.ts)"]
        INV["Invariants\n• local-only genome\n• evidence-tiered claims\n• educational-not-diagnostic\n• imputation-honest\n• no vision-improvement claims"]
        RULE{rule\nagent action}
        ALLOW([allow])
        REVISE([revise])
        DENY([deny])
    end

    subgraph wiki["LLM-wiki (wiki/)"]
        GLOSSARY[wiki/glossary/\nMarkdown term definitions\nbundled into SPA at build time]
        MEMORY[wiki/memory/\ndecisions.md — Oracle log\noracle-charter.md — invariants\nagents.md — role registry]
    end

    PS & KC & PW & UP & GS -->|AgentAction| RULE
    RULE --> INV
    INV --> ALLOW & REVISE & DENY
    ALLOW -->|appendDecision\nagent + kind only| MEMORY
    DENY & REVISE -->|blocked, not logged| agents

    GLOSSARY -.->|import.meta.glob at build| SPA([Browser SPA])
    MEMORY -.->|volume persisted\non Railway| VOL[(Railway volume\n/data)]
```

#### Agent roles

| Agent | Role | Key invariant guarded |
|---|---|---|
| `parser-smith` | Parse DNA files, normalise strands | Never modifies raw data |
| `kb-curator` | Curate KB entries with sources | Every claim must cite a real source |
| `privacy-warden` | Gate data-egress actions | No bulk genome upload |
| `ui-polisher` | Write user-facing copy | No diagnostic phrasing, no risk% |
| `glossary-scribe` | Maintain `wiki/glossary/` | Educational tone only |

#### Oracle invariants (enforced on every agent action)

1. **local-only** — no action may transmit the raw genome file
2. **evidence-tiered** — every KB claim must have ≥1 cited source
3. **educational-not-diagnostic** — no diagnostic language or risk percentages
4. **imputation-honest** — low-pass / no-call status must be surfaced
5. **no-vision-improvement** — no claims about improving eyesight

#### What is stored where

| Layer | Data | Persistent? |
|---|---|---|
| Browser memory | Full genome (session only) | No — cleared on page close |
| Browser IndexedDB | Nothing (removed — no user auth) | No |
| Railway volume `/data/wiki/` | Static glossary + Oracle log (agent+kind only) | Yes — no genomic data |
| Railway volume `/data/cache/synth/` | AI synthesis text (no counts, no rsids) | Yes — no genomic data |

---

---

## Contributing

This project uses **OpenSpec** for spec-driven development — every feature or
bugfix starts with a spec under `.openspec/specs/`. See
[`docs/OPENSPEC.md`](docs/OPENSPEC.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## Developer

Built by **Eduardo Arana**.

## License

[MIT](LICENSE)

---

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/H2H51MPWG)

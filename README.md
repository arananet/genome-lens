# genome-lens

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white) ![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-gray) ![three.js](https://img.shields.io/badge/three.js-gray) ![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?logo=cloudflare&logoColor=white) ![Vitest](https://img.shields.io/badge/Vitest-gray) ![OpenSpec](https://img.shields.io/badge/OpenSpec-enforced-blueviolet) ![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

> Local-first personal genomics viewer. Upload a raw DNA export, inspect it, and
> surface evidence-tiered variant associations across health, fitness, body
> composition, and vision — **entirely in your browser**.

**Educational use only. Not medical advice, not a diagnosis.**

---

## What it does

Turn a raw DNA export (23andMe, AncestryDNA, MyHeritage, VCF) or a GWAS health
report into an honest, private, navigable view of what is known and what is not:

- **Parses locally** — your raw DNA file never leaves your device. No upload
  endpoint, no telemetry on genetic data.
- **Five input formats** — 23andMe, AncestryDNA, MyHeritage (including low-pass
  WGS), VCF v4.x clinical sequencing, and structured GWAS health reports.
- **Evidence-tiered** — every variant claim cites a real source (ClinVar,
  GWAS Catalog, PharmGKB, SNPedia…) and a confidence tier (A/B/C). Nothing
  fabricated.
- **Honest about gaps** — flags imputation, low-pass calls, and SNPs that are
  simply absent from your file (not a negative result).
- **2D trace browser** — manhattan overview + per-chromosome linear tracks.
- **3D karyotype** — idiogram bars with centromere constrictions, interactive
  markers, and a detail panel. Rendered with three.js / React Three Fiber.
- **Agent mesh** — five LLM-powered agents (Cloudflare Workers AI) orchestrated
  via SSE with a two-layer Oracle (deterministic invariants + LLM governance
  review + real revise loop). MCP enrichment from MyVariant.info, MyGene.info,
  and full-genome ClinVar pathogenic scan. Live Canvas 2D visualization.
- **Four tiered reports** — health/disease, fitness, body composition, vision.
- **Clinical report export** — printable/PDF findings report grouped by category
  with tier chips, caveats, and evidence legend.
- **GWAS health report mode** — imports structured GWAS/multivariate/monovariate
  health reports, surfaces elevated/reduced risk findings, pharmacogenetics,
  biomarkers, and hereditary screening in a condensed PDF-exportable view.
- **Phenotype-driven AI ranking** — describe a symptom or phenotype and rank
  your genetic findings by relevance (server-side AI, opt-in).
- **Glossary & wiki** — plain-language genomics definitions, backed by a Markdown
  LLM-wiki (`wiki/`) that doubles as the agent mesh's memory.
- **Optional AI explainer** — opt-in two-paragraph explanations (what it means +
  how to reduce risk) via Cloudflare Workers AI. Your raw genome file is **never**
  sent; see [Privacy](#privacy).

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
`.vcf`, or `.zip`). Everything runs client-side.

Synthetic test samples are included in `samples/` for quick testing.

---

## Usage

1. Drag a raw DNA file (23andMe, AncestryDNA, MyHeritage, VCF) or a GWAS health
   report onto the upload pane.
2. genome-lens auto-detects the format, parses it locally, and reports source,
   variant count, build, and whether the method was low-pass.
3. Browse the 2D trace, spin the 3D karyotype, watch the agent mesh animation,
   or open any knowledge-base match to see genotype, tier, sources, and caveats.
4. Read the four tiered reports (health, fitness, body composition, vision).
5. Export a clinical findings report as PDF via **Export report**.
6. For GWAS health reports: view elevated/reduced risk findings, pharmacogenetics,
   biomarkers, and hereditary screening — export as PDF.
7. Hit **Wipe all data** to clear everything from the tab.

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

Every genome analysis starts in your browser — parsing and genotype handling
happen locally. The server-side agent mesh enriches findings via real database
APIs and LLM reasoning, but **only rsids and public KB metadata cross the wire**.

```mermaid
flowchart LR
    subgraph browser["Browser (client-side only)"]
        FILE([Raw DNA file\n.txt / .csv / .vcf / .zip])
        DETECT{detect format}
        PARSE[parser-smith\nparse + normalise]
        HR[GWAS health report\nparser]
        KB[kb-curator\nmatch knowledge base]
        STORE[Zustand store\nmerge all sources]
        UI[Trace / Karyotype 3D\nReport views]
    end

    subgraph mesh["Server — Agent Mesh (SSE)"]
        PW["🔒 privacy-warden\nregex + LLM audit"]
        KC["📚 kb-curator\nMCP fetch + LLM interpret"]
        ORC["◈ Oracle\ninvariants + LLM review\nrevise loop"]
        CF["✦ cf-synthesizer\nLLM narrative"]
        UP["✨ ui-polisher\nLLM copy polish"]
    end

    subgraph mcp["MCP Tools (external APIs)"]
        MV[MyVariant.info\nbatch POST]
        MG[MyGene.info]
        CV[ClinVar full scan\n600K+ rsids]
    end

    subgraph ai["Cloudflare Workers AI"]
        LLM["@cf/nvidia/nemotron-3-120b-a12b"]
    end

    FILE -->|local parse| DETECT
    DETECT -->|23andMe / Ancestry\nMyHeritage / VCF| PARSE
    DETECT -->|GWAS health report| HR
    PARSE -->|variants| KB
    KB -->|rsids only| PW
    PW -->|approved| KC
    KC -->|enriched findings| ORC
    ORC -->|revise| KC
    ORC -->|approved| CF
    CF --> UP
    UP -->|SSE stream| STORE
    KC --> MV & MG
    PARSE -->|all rsids| CV
    CV -->|pathogenic hits| STORE
    STORE --> UI
    PW & KC & ORC & CF & UP --> LLM
```

**Privacy invariant**: the raw genome file and individual genotypes never leave the browser. The mesh receives only rsids + public KB metadata (gene, category, tier). The `/api/mesh-analyze` endpoint rejects any payload item containing a `genotype` field.

---

### Agent mesh — five LLM agents + two-layer Oracle

The **agent mesh** is not a label — every agent is a genuine LLM call through
Cloudflare Workers AI (`@cf/nvidia/nemotron-3-120b-a12b`), orchestrated as an
SSE pipeline with real-time event streaming to the browser canvas.

```mermaid
flowchart TD
    subgraph pipeline["Server-side SSE pipeline (mesh/orchestrator.mjs)"]
        PW["🔒 privacy-warden\n1. Regex pre-filter\n2. LLM privacy audit"]
        KC["📚 kb-curator\n1. Batch MyVariant.info + MyGene.info\n2. LLM drafts interpretations"]
        ORC_REG["◈ Oracle — Layer 1\nDeterministic invariants\n(hard floor, never overridden)"]
        ORC_LLM["◈ Oracle — Layer 2\nLLM governance review\n(catches nuanced violations)"]
        REVISE{"revise?"}
        KC_RETRY["kb-curator retry\nLLM re-drafts with\nOracle feedback"]
        CF["✦ cf-synthesizer\nLLM narrative synthesis\nfrom enriched data"]
        UP["✨ ui-polisher\nLLM copy polish\ngrade-10 reading level"]
    end

    PW -->|allow| KC
    PW -->|deny| BLOCK([pipeline blocked])
    KC --> ORC_REG
    ORC_REG -->|deny| DROP([finding dropped])
    ORC_REG -->|pass| ORC_LLM
    ORC_LLM -->|allow| CF
    ORC_LLM -->|deny| DROP
    ORC_LLM -->|revise| REVISE
    REVISE -->|max 1 retry| KC_RETRY
    KC_RETRY -->|re-check| ORC_REG
    CF --> UP
    UP -->|Oracle invariant check| DONE([pipeline done])
```

#### Agent roles — each is a real LLM call

| Agent | What it does | LLM call |
|---|---|---|
| `privacy-warden` | Regex pre-filter + LLM audit of the outbound payload for subtle privacy leaks | Reviews payload text for genotype patterns, PII, health records |
| `kb-curator` | Fetches from MyVariant.info + MyGene.info (batched, concurrent), then drafts per-variant interpretations | Generates 1-2 sentence educational interpretation from raw ClinVar/gnomAD/PharmGKB data |
| `Oracle` | Two-layer review: deterministic regex invariants (hard floor) + LLM governance review with real revise-and-resubmit loop | Reviews all curator-drafted text against invariants, returns ALLOW/REVISE/DENY per finding |
| `cf-synthesizer` | Drafts a narrative overview from the approved enrichment data | 2-3 paragraph synthesis referencing actual ClinVar classifications and allele frequencies |
| `ui-polisher` | Polishes the synthesizer output for clarity and reading level | Rewrites for grade-10 readability, removes unexplained jargon, ensures educational tone |

#### Oracle — two-layer governance with real revise loop

The Oracle is not a single check — it operates in two layers:

1. **Deterministic invariants** (`mesh/oracle.mjs`) — five structural/regex checks
   that form the hard floor. These can never be overridden by the LLM layer:
   - **local-only** — no action may transmit the raw genome
   - **evidence-required** — every KB claim must cite ≥1 real source
   - **no-diagnosis** — no diagnostic language or personal risk percentages
   - **imputation-honesty** — inferred calls must not be presented as measured
   - **no-vision-improvement** — no promises about improving eyesight

2. **LLM governance review** — reviews all agent-generated text for nuanced
   violations the regex can't catch (subtle diagnostic phrasing, fabricated
   statistics, genotype leaks in natural language). When it flags a finding:
   - `revise` → sends the reason back to `kb-curator`, which re-drafts via a
     second LLM call, then the revision is re-checked against the deterministic
     invariants (max 1 retry, then deny)
   - `deny` → finding is dropped from approved enrichments

The LLM layer can only escalate (revise → deny), never override a deterministic deny.

#### What is stored where

| Layer | Data | Persistent? |
|---|---|---|
| Browser memory | Full genome (session only) | No — cleared on page close |
| Browser IndexedDB | Nothing (no user auth) | No |
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

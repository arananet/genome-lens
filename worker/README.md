# genome-lens AI explainer (Cloudflare Worker)

Optional plain-language explainer backed by **Cloudflare Workers AI**. The SPA
calls this worker only when the user explicitly opts in for a specific variant.

## Privacy contract

This worker receives **only** a single variant's public context — `rsid`, `gene`,
`category`, `tier`, the reported `genotype`, and the knowledge-base
`interpretation` + `caveats`. It **never** receives the user's raw genome file.
It does not persist or log request bodies.

## Deploy

```bash
npm install -g wrangler        # or: npx wrangler
cd worker
wrangler deploy
```

Wrangler prints the worker URL (e.g. `https://genome-lens-ai.<account>.workers.dev`).

1. Set `ALLOWED_ORIGINS` in `wrangler.toml` to your SPA origin (the Railway URL)
   for production, instead of `*`.
2. Point the SPA at the worker by setting `VITE_AI_WORKER_URL` at build time:

   ```bash
   VITE_AI_WORKER_URL="https://genome-lens-ai.<account>.workers.dev" npm run build
   ```

If `VITE_AI_WORKER_URL` is unset, the SPA hides the AI explainer and everything
else works unchanged.

## Model

Uses `@cf/meta/llama-3.1-8b-instruct`. Change `MODEL` in `src/index.ts` to use a
different Workers AI model.

// Express server for Railway: serves the Vite SPA and proxies AI explain requests
// to Cloudflare Workers AI using CF_ACCOUNT_ID + CF_API_TOKEN from the environment.
import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 3000;
const MODEL = "@cf/meta/llama-3.1-8b-instruct";

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "dist")));

app.post("/api/explain", async (req, res) => {
  const v = req.body?.variant;
  if (!v?.rsid || !v?.gene) {
    return res.status(400).json({ error: "Missing variant context" });
  }

  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  if (!accountId || !apiToken) {
    return res.status(503).json({ error: "AI service not configured on this server" });
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`;
  let cfRes;
  try {
    cfRes = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
      body: JSON.stringify({ prompt: buildPrompt(v), max_tokens: 320, stream: false }),
    });
  } catch (err) {
    return res.status(502).json({ error: `Network error reaching Cloudflare: ${err.message}` });
  }

  if (!cfRes.ok) {
    const text = await cfRes.text().catch(() => "");
    return res.status(502).json({ error: `Cloudflare API ${cfRes.status}: ${text}` });
  }

  const data = await cfRes.json();
  return res.json({ explanation: data.result?.response ?? "" });
});

// SPA fallback — must come last
app.get("*", (_req, res) => {
  res.sendFile(join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => console.log(`genome-lens on :${PORT}`));

function buildPrompt(v) {
  return [
    "You are a science communicator. Explain the following genetic variant to a layperson in 3-5 short sentences.",
    "Rules: educational only, never diagnostic, no invented statistics, honest about uncertainty.",
    "End with a reminder to confirm actionable findings with a clinician.",
    "",
    `Variant: ${v.rsid} in gene ${v.gene}.`,
    `Category: ${v.category}. Evidence tier: ${v.tier}.`,
    `Reported genotype: ${v.genotype ?? "not covered"}.`,
    `Knowledge-base note: ${v.interpretation}`,
    `Caveat: ${v.caveats}`,
    "",
    "Explanation:",
  ].join("\n");
}

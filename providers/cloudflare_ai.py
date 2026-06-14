"""Cloudflare Workers AI inference client.

Free-tier REST API: 10,000 neurons/day.
Requires env vars CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN,
or pass account_id / api_token explicitly to CloudflareAIClient().
"""

import os

_BASE = "https://api.cloudflare.com/client/v4/accounts"

FREE_MODELS = [
    "@cf/meta/llama-3.1-8b-instruct",
    "@cf/microsoft/phi-3-mini-4k-instruct",
    "@cf/google/gemma-3-12b-it",
]

DEFAULT_MODEL = FREE_MODELS[0]


class CloudflareAIError(Exception):
    """Raised when the Cloudflare Workers AI API returns an error."""


class CloudflareAIClient:
    """Thin synchronous client for Cloudflare Workers AI text generation."""

    def __init__(self, account_id: str | None = None, api_token: str | None = None):
        self.account_id = account_id or os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
        self.api_token = api_token or os.environ.get("CLOUDFLARE_AI_TOKEN", "")
        if not self.account_id:
            raise CloudflareAIError(
                "account_id is required. Set CLOUDFLARE_ACCOUNT_ID or pass account_id=."
            )
        if not self.api_token:
            raise CloudflareAIError(
                "api_token is required. Set CLOUDFLARE_AI_TOKEN or pass api_token=."
            )

    def generate(self, prompt: str, model: str = DEFAULT_MODEL) -> str:
        """Send a prompt to the given Workers AI model and return the response text.

        Raises CloudflareAIError on non-2xx responses.
        """
        url = f"{_BASE}/{self.account_id}/ai/run/{model}"
        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }
        body = {"prompt": prompt}

        try:
            import httpx
            with httpx.Client(timeout=60) as client:
                resp = client.post(url, headers=headers, json=body)
            _raise_for_cf_error(resp.status_code, resp.text, resp.json())
            return resp.json()["result"]["response"]
        except ImportError:
            return _generate_urllib(url, headers, body)

    def list_models(self) -> list[str]:
        """Return the recommended free-tier model IDs for text generation."""
        return list(FREE_MODELS)


# ── internal helpers ──────────────────────────────────────────────────────────

def _raise_for_cf_error(status: int, raw: str, data: dict) -> None:
    if status >= 400:
        errors = data.get("errors") or [{"message": raw}]
        msg = "; ".join(e.get("message", str(e)) for e in errors)
        raise CloudflareAIError(f"HTTP {status}: {msg}")


def _generate_urllib(url: str, headers: dict, body: dict) -> str:
    """Stdlib fallback when httpx is not installed."""
    import json
    import urllib.request

    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        data = json.loads(raw)
        _raise_for_cf_error(exc.code, raw.decode(), data)

    data = json.loads(raw)
    _raise_for_cf_error(200, "", data)
    return data["result"]["response"]

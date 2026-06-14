"""Tests for providers.cloudflare_ai — spec: cloudflare-workers-ai"""

import json
from unittest.mock import MagicMock, patch

import pytest

from providers.cloudflare_ai import (
    CloudflareAIClient,
    CloudflareAIError,
    FREE_MODELS,
)


class TestClientInstantiation:
    def test_explicit_credentials(self):
        client = CloudflareAIClient(account_id="acct123", api_token="tok456")
        assert client.account_id == "acct123"
        assert client.api_token == "tok456"

    def test_env_var_credentials(self, monkeypatch):
        monkeypatch.setenv("CF_ACCOUNT_ID", "env_acct")
        monkeypatch.setenv("CF_API_TOKEN", "env_tok")
        client = CloudflareAIClient()
        assert client.account_id == "env_acct"
        assert client.api_token == "env_tok"

    def test_missing_account_id_raises(self, monkeypatch):
        monkeypatch.delenv("CF_ACCOUNT_ID", raising=False)
        monkeypatch.delenv("CF_API_TOKEN", raising=False)
        with pytest.raises(CloudflareAIError, match="account_id is required"):
            CloudflareAIClient()

    def test_missing_token_raises(self, monkeypatch):
        monkeypatch.setenv("CF_ACCOUNT_ID", "acct")
        monkeypatch.delenv("CF_API_TOKEN", raising=False)
        with pytest.raises(CloudflareAIError, match="api_token is required"):
            CloudflareAIClient()


class TestGenerate:
    @pytest.fixture
    def client(self):
        return CloudflareAIClient(account_id="acct", api_token="tok")

    def _mock_httpx_response(self, status_code: int, body: dict):
        mock_resp = MagicMock()
        mock_resp.status_code = status_code
        mock_resp.text = json.dumps(body)
        mock_resp.json.return_value = body
        return mock_resp

    def test_successful_generate(self, client):
        payload = {"result": {"response": "BRCA1 is a tumour suppressor gene."}, "errors": []}
        mock_resp = self._mock_httpx_response(200, payload)

        mock_ctx = MagicMock()
        mock_ctx.__enter__ = MagicMock(return_value=mock_ctx)
        mock_ctx.__exit__ = MagicMock(return_value=False)
        mock_ctx.post.return_value = mock_resp

        with patch("httpx.Client", return_value=mock_ctx):
            result = client.generate("Describe BRCA1.")

        assert result == "BRCA1 is a tumour suppressor gene."

    def test_http_error_raises(self, client):
        payload = {"errors": [{"message": "Unauthorized"}], "result": None}
        mock_resp = self._mock_httpx_response(401, payload)

        mock_ctx = MagicMock()
        mock_ctx.__enter__ = MagicMock(return_value=mock_ctx)
        mock_ctx.__exit__ = MagicMock(return_value=False)
        mock_ctx.post.return_value = mock_resp

        with patch("httpx.Client", return_value=mock_ctx):
            with pytest.raises(CloudflareAIError, match="HTTP 401"):
                client.generate("test")

    def test_error_message_included(self, client):
        payload = {"errors": [{"message": "model not found"}], "result": None}
        mock_resp = self._mock_httpx_response(404, payload)

        mock_ctx = MagicMock()
        mock_ctx.__enter__ = MagicMock(return_value=mock_ctx)
        mock_ctx.__exit__ = MagicMock(return_value=False)
        mock_ctx.post.return_value = mock_resp

        with patch("httpx.Client", return_value=mock_ctx):
            with pytest.raises(CloudflareAIError, match="model not found"):
                client.generate("test")


class TestListModels:
    def test_returns_non_empty_list(self):
        client = CloudflareAIClient(account_id="a", api_token="b")
        models = client.list_models()
        assert isinstance(models, list)
        assert len(models) > 0

    def test_all_ids_start_with_cf_prefix(self):
        client = CloudflareAIClient(account_id="a", api_token="b")
        for model_id in client.list_models():
            assert model_id.startswith("@cf/"), f"Expected @cf/ prefix: {model_id}"

    def test_returns_copy_not_original(self):
        client = CloudflareAIClient(account_id="a", api_token="b")
        models = client.list_models()
        models.append("@cf/fake/injected")
        assert "@cf/fake/injected" not in FREE_MODELS

"""
Tests for POST /copilot/chat — streaming SSE endpoint.
The Anthropic SDK client is fully mocked.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from backend.main import app


def _make_stream_mock(tokens: list[str]):
    """Async context manager whose .text_stream yields the given tokens."""

    class FakeStream:
        def __init__(self):
            self.text_stream = self._gen()

        async def _gen(self):
            for t in tokens:
                yield t

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            pass

    return FakeStream()


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture
def patch_anthropic():
    tokens = ["Hello", " world", "!"]
    stream = _make_stream_mock(tokens)
    mock_client = MagicMock()
    mock_client.messages.stream = MagicMock(return_value=stream)

    with patch("backend.routers.copilot.anthropic.AsyncAnthropic", return_value=mock_client):
        with patch("backend.routers.copilot.get_settings") as mock_settings:
            mock_settings.return_value.anthropic_api_key = "test-key"
            yield mock_client, tokens


async def test_chat_streams_sse(client, patch_anthropic):
    payload = {"messages": [{"role": "user", "content": "Tell me about Oak Creek"}]}
    resp = await client.post("/copilot/chat", json=payload)
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]


async def test_chat_response_contains_tokens(client, patch_anthropic):
    _, tokens = patch_anthropic
    payload = {"messages": [{"role": "user", "content": "Hello"}]}
    resp = await client.post("/copilot/chat", json=payload)
    body = resp.text
    for token in tokens:
        assert token in body


async def test_chat_ends_with_done(client, patch_anthropic):
    payload = {"messages": [{"role": "user", "content": "test"}]}
    resp = await client.post("/copilot/chat", json=payload)
    assert "data: [DONE]" in resp.text


async def test_chat_with_property_id(client, patch_anthropic):
    payload = {
        "messages": [{"role": "user", "content": "Is this a good deal?"}],
        "property_id": "p1",
    }
    resp = await client.post("/copilot/chat", json=payload)
    assert resp.status_code == 200


async def test_chat_503_without_api_key(client):
    with patch("backend.routers.copilot.get_settings") as mock_settings:
        mock_settings.return_value.anthropic_api_key = ""
        payload = {"messages": [{"role": "user", "content": "test"}]}
        resp = await client.post("/copilot/chat", json=payload)
    assert resp.status_code == 503

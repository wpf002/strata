"""
Tests for the Supabase keepalive job.

The DB itself is mocked — the point is that a failing ping never propagates an
exception into the scheduler (which would silently kill the timer that stops the
project pausing) and that the status snapshot tracks reality.
"""
from unittest.mock import MagicMock, patch

import pytest

from backend.background import keepalive


@pytest.fixture(autouse=True)
def reset_state():
    keepalive._last_ping = None
    keepalive._consecutive_failures = 0
    yield
    keepalive._last_ping = None
    keepalive._consecutive_failures = 0


class _FakeSession:
    """Async-context-manager stand-in for AsyncSessionLocal()."""

    def __init__(self, raises: Exception | None = None):
        self._raises = raises
        self.executed = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    async def execute(self, _stmt):
        if self._raises:
            raise self._raises
        self.executed += 1
        return MagicMock()


@pytest.mark.asyncio
async def test_ping_succeeds_and_records_timestamp():
    session = _FakeSession()
    with patch.object(keepalive, "AsyncSessionLocal", lambda: session):
        assert await keepalive.ping_supabase() is True

    assert session.executed == 2  # select 1 + catalog read
    status = keepalive.keepalive_status()
    assert status["lastPing"] is not None
    assert status["consecutiveFailures"] == 0


@pytest.mark.asyncio
async def test_ping_swallows_errors_so_the_job_stays_scheduled():
    session = _FakeSession(raises=OSError("nodename nor servname provided"))
    with patch.object(keepalive, "AsyncSessionLocal", lambda: session):
        assert await keepalive.ping_supabase() is False  # no raise

    status = keepalive.keepalive_status()
    assert status["lastPing"] is None
    assert status["consecutiveFailures"] == 1


@pytest.mark.asyncio
async def test_consecutive_failures_accumulate_then_reset():
    failing = _FakeSession(raises=RuntimeError("boom"))
    with patch.object(keepalive, "AsyncSessionLocal", lambda: failing):
        await keepalive.ping_supabase()
        await keepalive.ping_supabase()
    assert keepalive.keepalive_status()["consecutiveFailures"] == 2

    with patch.object(keepalive, "AsyncSessionLocal", lambda: _FakeSession()):
        await keepalive.ping_supabase()
    assert keepalive.keepalive_status()["consecutiveFailures"] == 0


@pytest.mark.asyncio
async def test_health_endpoint_reports_keepalive():
    # Call the handler directly — going through TestClient would run the
    # lifespan, which starts the real scheduler against the real database.
    from backend.main import health

    payload = await health()
    assert payload["status"] == "ok"
    assert payload["supabaseKeepalive"]["intervalHours"] == keepalive.KEEPALIVE_INTERVAL_HOURS
    assert payload["supabaseKeepalive"]["lastPing"] is None

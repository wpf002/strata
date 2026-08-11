"""
Background job: keep the Supabase project from auto-pausing.

Supabase pauses free-tier projects after a stretch with no activity, and an
unpause is manual — the project's hostname stops resolving entirely until
someone clicks the button in the dashboard, which is exactly how this repo's
project went dark.

A cheap query on a schedule counts as activity. This runs `select 1` plus a
lightweight catalog read against the pooled connection the app already uses, so
it exercises the same path a real request would.

Caveat worth being clear about: this only helps while the backend process is
actually running. If the API is off for the whole idle window, the project will
still pause. `bin/check-supabase` tells you where things stand either way.
"""
import logging
from datetime import datetime, timezone

from sqlalchemy import text

from ..database import AsyncSessionLocal

log = logging.getLogger(__name__)

# Public so callers and tests can report the schedule without duplicating it.
KEEPALIVE_INTERVAL_HOURS = 12

_last_ping: datetime | None = None
_consecutive_failures = 0


async def ping_supabase() -> bool:
    """
    Touch the database so the project registers activity.

    Returns True on success. Never raises — a failed ping is logged and the job
    stays scheduled, because a transient network blip shouldn't kill the timer
    that prevents the pause in the first place.
    """
    global _last_ping, _consecutive_failures

    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("select 1"))
            # A catalog read is still trivial but exercises a real table lookup
            # rather than something the pooler could conceivably short-circuit.
            await db.execute(
                text("select count(*) from information_schema.tables where table_schema = 'public'")
            )

        _last_ping = datetime.now(timezone.utc)
        _consecutive_failures = 0
        log.info("Supabase keepalive ping OK at %s", _last_ping.isoformat())
        return True

    except Exception as exc:
        _consecutive_failures += 1
        log.warning(
            "Supabase keepalive ping failed (%s consecutive): %s: %s",
            _consecutive_failures,
            type(exc).__name__,
            str(exc)[:200],
        )
        return False


def keepalive_status() -> dict:
    """Snapshot for the /health endpoint."""
    return {
        "intervalHours": KEEPALIVE_INTERVAL_HOURS,
        "lastPing": _last_ping.isoformat() if _last_ping else None,
        "consecutiveFailures": _consecutive_failures,
    }

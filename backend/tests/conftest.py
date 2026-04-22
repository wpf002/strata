"""
Shared pytest fixtures for backend tests.
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
import backend.services.rent_service as _rent_svc


@pytest.fixture(autouse=True)
def clear_rent_cache():
    _rent_svc.clear_cache_for_testing()
    yield
    _rent_svc.clear_cache_for_testing()


@pytest.fixture(autouse=True, scope="session")
def disable_lifespan_side_effects():
    """
    Prevent APScheduler startup and engine.dispose() from causing 'Event loop is
    closed' errors when tests clean up after the ASGI lifespan.
    engine is imported lazily in the lifespan, so we patch the source module.
    """
    mock_scheduler = MagicMock()
    mock_scheduler.start = MagicMock()
    mock_scheduler.shutdown = MagicMock()

    mock_engine = MagicMock()
    mock_engine.dispose = AsyncMock(return_value=None)

    with patch("apscheduler.schedulers.asyncio.AsyncIOScheduler", return_value=mock_scheduler):
        with patch("backend.database.engine", mock_engine):
            yield

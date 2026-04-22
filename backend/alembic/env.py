import asyncio
import os
import ssl
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config, create_async_engine

from alembic import context

# Make sure the backend package is importable from the alembic directory
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.database import Base  # noqa: E402
from backend.config import get_settings  # noqa: E402
import backend.models  # noqa: E402, F401  — registers all ORM models with Base.metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override sqlalchemy.url from settings (reads backend/.env via pydantic-settings)
_settings_url = get_settings().database_url or os.getenv("DATABASE_URL")
if _settings_url:
    config.set_main_option("sqlalchemy.url", _settings_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    url = config.get_main_option("sqlalchemy.url", "")
    ssl_ctx: ssl.SSLContext | bool = False
    if "supabase.co" in url or "ssl=require" in url:
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE
    # Strip ?ssl=... from URL — handled via connect_args below
    clean_url = url.split("?")[0]
    connectable = create_async_engine(
        clean_url,
        poolclass=pool.NullPool,
        connect_args={"ssl": ssl_ctx} if ssl_ctx else {},
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).parent / ".env"


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://postgres:password@localhost:5432/strata"

    # Supabase
    supabase_url: str = ""
    supabase_jwt_secret: str = ""

    # External APIs (graceful degradation if absent)
    attom_api_key: str = ""
    rentcast_api_key: str = ""
    rentcast_monthly_limit: int = 80  # hard cap; 0 = disable RentCast entirely
    sendgrid_api_key: str = ""
    sendgrid_from_email: str = "alerts@strata.app"
    anthropic_api_key: str = ""
    rapidapi_key: str = ""

    # App
    environment: str = "development"
    debug: bool = False

    model_config = {"env_file": str(_ENV_FILE), "case_sensitive": False}


@lru_cache
def get_settings() -> Settings:
    return Settings()

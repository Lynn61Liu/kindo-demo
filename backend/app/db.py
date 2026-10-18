from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.config import Settings
from app.database_guard import require_test_database

CONNECTION_OPTIONS = {"connect_timeout": 5, "options": "-c statement_timeout=5000"}

def database_url(settings: Settings):
    if settings.app_env == "test":
        return require_test_database(
            settings.app_env, settings.test_database_url, settings.database_url,
            "school_pay_demo_test",
        )
    return settings.database_url


@lru_cache
def get_engine() -> Engine:
    return create_engine(database_url(Settings()), pool_pre_ping=True, connect_args=CONNECTION_OPTIONS)


def get_session() -> Generator[Session]:
    # A mutation use case commits explicitly before it returns a success DTO.
    # Closing a Session rolls back an unfinished transaction; this dependency never commits.
    with Session(get_engine()) as session:
        try:
            yield session
        except Exception:
            session.rollback()
            raise

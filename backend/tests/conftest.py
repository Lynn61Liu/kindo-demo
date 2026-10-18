from pathlib import Path

from alembic import command
from alembic.config import Config
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.config import Settings
from app.database_guard import require_test_database
from app.db import CONNECTION_OPTIONS
from app.seed import seed

BACKEND = Path(__file__).resolve().parents[1]


def guarded_url(name: str):
    settings = Settings()
    raw = settings.test_database_url if name == "school_pay_demo_test" else settings.migration_database_url
    return require_test_database(settings.app_env, raw, settings.database_url, name)


def migration_config(url, name: str) -> Config:
    config = Config(str(BACKEND / "alembic.ini"))
    config.attributes["test_database_url"] = url.render_as_string(hide_password=False)
    config.attributes["expected_test_database"] = name
    return config


@pytest.fixture(scope="session")
def database_engine():
    # Guard executes before Alembic connects or any cleanup occurs.
    url = guarded_url("school_pay_demo_test")
    command.upgrade(migration_config(url, "school_pay_demo_test"), "head")
    engine = create_engine(url, connect_args=CONNECTION_OPTIONS)
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(database_engine):
    # No outer rollback transaction: application commits must be real.
    guarded_url("school_pay_demo_test")
    with database_engine.begin() as connection:
        connection.execute(text("TRUNCATE payment, payment_request, student, app_user RESTART IDENTITY"))
    with Session(database_engine) as session:
        seed(session)
        session.commit()
        yield session

from alembic import context
from sqlalchemy import create_engine, pool

from app.config import Settings
from app.database_guard import require_test_database
from app.db import CONNECTION_OPTIONS, database_url
from app.models import Base

config = context.config
settings = Settings()
target = config.attributes.get("test_database_url")
if target is not None:
    target = require_test_database(
        settings.app_env, target, settings.database_url,
        config.attributes["expected_test_database"],
    )
else:
    target = database_url(settings)

if context.is_offline_mode():
    context.configure(url=target, target_metadata=Base.metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = create_engine(target, poolclass=pool.NullPool, connect_args=CONNECTION_OPTIONS)
    try:
        with engine.connect() as connection:
            context.configure(connection=connection, target_metadata=Base.metadata)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()

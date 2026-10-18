"""Fail closed before any test connection or destructive database operation."""

from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import ArgumentError

ALLOWED_TEST_DATABASES = frozenset({"school_pay_demo_test", "school_pay_demo_migration_test"})


class UnsafeTestDatabase(ValueError):
    pass


def require_test_database(
    app_env: str | None,
    url: str | None,
    runtime_url: str | None,
    expected_name: str,
) -> URL:
    """Return a validated URL, without ever including input URLs in errors."""
    if app_env != "test" or not url or not runtime_url:
        raise UnsafeTestDatabase("Explicit test environment and both database URLs are required")
    if expected_name not in ALLOWED_TEST_DATABASES:
        raise UnsafeTestDatabase("Database name is not an allowed test target")
    try:
        target, runtime = make_url(url), make_url(runtime_url)
        # Query parameters can override connection routing or search_path.
        if any(u.drivername != "postgresql+psycopg" or not u.host or u.query for u in (target, runtime)):
            raise ValueError
        if target.database != expected_name:
            raise ValueError
        # A test-looking URL must never also be declared as the runtime connection.
        if runtime.database in ALLOWED_TEST_DATABASES or runtime.database != "school_pay_demo":
            raise ValueError
        def connection_identity(u: URL):
            host = u.host.lower()
            if host in {"localhost", "127.0.0.1", "::1"}:
                host = "loopback"
            return host, u.port or 5432, u.database
        if connection_identity(target) == connection_identity(runtime):
            raise ValueError
    except (ValueError, TypeError, ArgumentError):
        raise UnsafeTestDatabase("Unsafe test database target or runtime comparison") from None
    return target

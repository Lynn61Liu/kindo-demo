import pytest

from app.database_guard import UnsafeTestDatabase, require_test_database

RUNTIME = "postgresql+psycopg://demo:do-not-log@127.0.0.1:55432/school_pay_demo"
TEST = "postgresql+psycopg://demo:do-not-log@127.0.0.1:55432/school_pay_demo_test"
MIGRATION = "postgresql+psycopg://demo:do-not-log@127.0.0.1:55432/school_pay_demo_migration_test"


@pytest.mark.parametrize("app_env,url,runtime,name", [
    (None, TEST, RUNTIME, "school_pay_demo_test"),
    ("demo", TEST, RUNTIME, "school_pay_demo_test"),
    ("test", None, RUNTIME, "school_pay_demo_test"),
    ("test", TEST, None, "school_pay_demo_test"),
    ("test", RUNTIME, RUNTIME, "school_pay_demo_test"),
    ("test", TEST, TEST, "school_pay_demo_test"),
    ("test", MIGRATION, RUNTIME, "school_pay_demo_test"),
    ("test", TEST, RUNTIME, "school_pay_demo"),
    ("test", "sqlite:///school_pay_demo_test", RUNTIME, "school_pay_demo_test"),
    ("test", "postgresql+psycopg://host/other_test", RUNTIME, "school_pay_demo_test"),
    ("test", TEST + "?options=-csearch_path%3Dpublic", RUNTIME, "school_pay_demo_test"),
    ("test", "broken-url-do-not-log", RUNTIME, "school_pay_demo_test"),
])
def test_unsafe_configuration_is_rejected_before_connection(app_env, url, runtime, name):
    with pytest.raises(UnsafeTestDatabase) as caught:
        require_test_database(app_env, url, runtime, name)
    assert "do-not-log" not in str(caught.value)
    assert "broken-url" not in str(caught.value)


@pytest.mark.parametrize("url,name", [
    (TEST, "school_pay_demo_test"),
    (MIGRATION, "school_pay_demo_migration_test"),
])
def test_explicit_separate_test_database_is_accepted(url, name):
    assert require_test_database("test", url, RUNTIME, name).database == name


@pytest.mark.parametrize("app_env,target", [("demo", TEST), ("test", RUNTIME)])
def test_fixture_refuses_unsafe_target_before_migration_connection_or_cleanup(monkeypatch, app_env, target):
    import conftest

    monkeypatch.setenv("APP_ENV", app_env)
    monkeypatch.setenv("DATABASE_URL", RUNTIME)
    monkeypatch.setenv("TEST_DATABASE_URL", target)
    def must_not_run(*args, **kwargs):
        pytest.fail("Database side effect happened before the guard")
    monkeypatch.setattr(conftest, "create_engine", must_not_run)
    monkeypatch.setattr(conftest.command, "upgrade", must_not_run)
    with pytest.raises(UnsafeTestDatabase):
        next(conftest.database_engine.__wrapped__())
    class NeverBegin:
        begin = must_not_run
    with pytest.raises(UnsafeTestDatabase):
        next(conftest.db_session.__wrapped__(NeverBegin()))

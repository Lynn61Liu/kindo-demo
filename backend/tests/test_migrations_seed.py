from datetime import datetime, timezone

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, func, inspect, select
from sqlalchemy.orm import Session

from app.models import Base, Payment, PaymentRequest, Student, User
from app.db import CONNECTION_OPTIONS
from app.seed import seed
from conftest import guarded_url, migration_config


def test_empty_database_migrates_to_four_tables_and_matches_models():
    name = "school_pay_demo_migration_test"
    url = guarded_url(name)
    config = migration_config(url, name)
    # This dedicated database is exclusively for migration round trips.
    command.downgrade(config, "base")
    engine = create_engine(url, connect_args=CONNECTION_OPTIONS)
    try:
        with engine.connect() as connection:
            assert set(inspect(connection).get_table_names()) <= {"alembic_version"}
        command.upgrade(config, "head")
        with engine.connect() as connection:
            assert set(inspect(connection).get_table_names()) == {
                "app_user", "student", "payment_request", "payment", "alembic_version",
            }
            assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []
            uniques = inspect(connection).get_unique_constraints("payment")
            assert any(item["column_names"] == ["payment_request_id"] for item in uniques)
            assert len(inspect(connection).get_foreign_keys("payment_request")) == 2
            assert len(inspect(connection).get_foreign_keys("payment")) == 2
    finally:
        engine.dispose()


def test_repeated_seed_preserves_committed_payment_and_uses_safe_sequences(db_session, database_engine):
    request = PaymentRequest(student_id=101, created_by=1, title="Seed preservation",
                             amount_cents=1250, status="paid", paid_at=datetime.now(timezone.utc))
    db_session.add(request)
    db_session.flush()
    payment = Payment(payment_request_id=request.id, payer_id=2, amount_cents=1250,
                      provider_reference=f"simulated-{request.id}")
    db_session.add(payment)
    db_session.commit()
    request_id, payment_id, paid_at = request.id, payment.id, request.paid_at
    seed(db_session)
    seed(db_session)
    db_session.commit()
    with Session(database_engine) as reader:
        assert reader.scalar(select(func.count()).select_from(User)) == 3
        assert reader.scalar(select(func.count()).select_from(Student)) == 3
        assert reader.get(PaymentRequest, request_id).paid_at == paid_at
        assert reader.get(PaymentRequest, request_id).status == "paid"
        assert reader.get(Payment, payment_id).amount_cents == 1250
        users = reader.scalars(select(User).order_by(User.id)).all()
        assert [(user.id, user.role) for user in users] == [(1, "admin"), (2, "parent"), (3, "parent")]
        assert [(s.id, s.parent_id) for s in reader.scalars(select(Student).order_by(Student.id))] == [
            (101, 2), (102, 2), (103, 3),
        ]
    # Rolled back inserts still advance PostgreSQL sequences. Reseeding must not rewind them.
    extra = User(name="Temporary parent", role="parent")
    db_session.add(extra)
    db_session.flush()
    previous_id = extra.id
    assert previous_id > 3
    db_session.rollback()
    seed(db_session)
    db_session.commit()
    next_user = User(name="Next parent", role="parent")
    db_session.add(next_user)
    db_session.flush()
    assert next_user.id > previous_id
    student = Student(name="New student", parent_id=next_user.id)
    db_session.add(student)
    db_session.flush()
    assert student.id > 103
    db_session.rollback()


def test_minimal_application_is_importable_and_exposes_openapi():
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app) as client:
        response = client.get("/openapi.json")
        assert response.status_code == 200
        assert response.json()["info"]["title"] == "School Payment Request Demo"
        # The S1 route is present and rejects requests without a demo identity.
        assert client.post("/api/v1/payment-requests", json={}).status_code == 401

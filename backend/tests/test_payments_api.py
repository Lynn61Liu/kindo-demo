from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Event
import time

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models import Payment, PaymentRequest, User
from app.payments import simulate_payment


def make_open_request(db_session, *, student_id=101, title="Payable", amount_cents=1250):
    request = PaymentRequest(student_id=student_id, created_by=1, title=title,
                             amount_cents=amount_cents)
    db_session.add(request)
    db_session.commit()
    return request.id


def test_simulated_payment_commits_full_amount_and_admin_can_read_it(api_client, db_session):
    request_id = make_open_request(db_session)

    response = api_client.post(f"/api/v1/payment-requests/{request_id}/simulate-payment",
                               headers={"X-Demo-User-Id": "2"})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "paid"
    assert body["paid_at"] is not None
    assert body["payment"]["payer_id"] == 2
    assert body["payment"]["amount_cents"] == 1250
    assert body["payment"]["status"] == "succeeded"
    assert body["payment"]["provider_reference"] == f"simulated-{request_id}"
    assert body["payment"]["created_at"] == body["paid_at"]
    assert body["payment"]["created_at"].endswith("Z")
    with Session(db_session.get_bind()) as reader:
        saved = reader.get(PaymentRequest, request_id)
        payment = reader.scalar(select(Payment).where(Payment.payment_request_id == request_id))
        assert saved.status == "paid" and saved.paid_at == payment.created_at
        assert payment.amount_cents == saved.amount_cents
        assert reader.scalar(select(func.count()).select_from(Payment).where(
            Payment.payment_request_id == request_id)) == 1
    admin = api_client.get(f"/api/v1/admin/payment-requests?status=paid",
                           headers={"X-Demo-User-Id": "1"})
    assert any(row["id"] == request_id for row in admin.json()["items"])


def test_retry_returns_same_payment_and_timestamp_without_extra_row(api_client, db_session):
    request_id = make_open_request(db_session)
    path = f"/api/v1/payment-requests/{request_id}/simulate-payment"
    headers = {"X-Demo-User-Id": "2"}

    first = api_client.post(path, headers=headers)
    second = api_client.post(path, headers=headers)

    assert first.status_code == second.status_code == 200, (first.text, second.text)
    assert second.json()["payment"]["id"] == first.json()["payment"]["id"]
    assert second.json()["paid_at"] == first.json()["paid_at"]
    assert second.json()["payment"]["created_at"] == first.json()["payment"]["created_at"]
    assert db_session.scalar(select(func.count()).select_from(Payment)) == 1


def test_invalid_payment_body_and_wrong_role_do_not_pay(api_client, db_session):
    request_id = make_open_request(db_session)
    path = f"/api/v1/payment-requests/{request_id}/simulate-payment"
    parent_payload = api_client.post(path, headers={"X-Demo-User-Id": "2"}, json={"amount_cents": 1})
    admin = api_client.post(path, headers={"X-Demo-User-Id": "1"})

    assert parent_payload.status_code == 422
    assert admin.status_code == 403
    db_session.expire_all()
    assert db_session.get(PaymentRequest, request_id).status == "open"
    assert db_session.scalar(select(func.count()).select_from(Payment)) == 0


def test_unknown_and_invalid_ids_return_404_and_422(api_client):
    missing = api_client.post("/api/v1/payment-requests/999999/simulate-payment",
                              headers={"X-Demo-User-Id": "2"})
    invalid = api_client.post("/api/v1/payment-requests/nope/simulate-payment",
                              headers={"X-Demo-User-Id": "2"})
    assert missing.status_code == 404
    assert invalid.status_code == 422


def test_committed_but_lost_response_is_recovered_by_retry(api_client, db_session):
    request_id = make_open_request(db_session)
    # Commit in the use case, then deliberately discard its snapshot to model a
    # lost HTTP response after the database completed the payment.
    with Session(db_session.get_bind()) as lost_response_session:
        parent = lost_response_session.get(User, 2)
        simulate_payment(lost_response_session, request_id, parent)
    replay = api_client.post(f"/api/v1/payment-requests/{request_id}/simulate-payment",
                             headers={"X-Demo-User-Id": "2"})
    assert replay.status_code == 200
    with Session(db_session.get_bind()) as reader:
        payment = reader.scalar(select(Payment).where(Payment.payment_request_id == request_id))
        assert replay.json()["payment"]["id"] == payment.id
    assert db_session.scalar(select(func.count()).select_from(Payment)) == 1


def test_two_overlapping_postgres_sessions_get_the_same_success(api_client, db_session, database_engine):
    request_id = make_open_request(db_session)
    path = f"/api/v1/payment-requests/{request_id}/simulate-payment"
    headers = {"X-Demo-User-Id": "2"}
    release_holder = Event()
    holder_ready = Event()

    def hold_row_lock():
        with database_engine.connect() as connection:
            transaction = connection.begin()
            connection.execute(text("SELECT id FROM payment_request WHERE id=:id FOR UPDATE"),
                               {"id": request_id})
            holder_ready.set()
            if not release_holder.wait(timeout=5):
                raise TimeoutError("test did not release row lock holder")
            transaction.commit()

    def pay():
        # Each call runs through the app dependency and receives a separate Session.
        from fastapi.testclient import TestClient
        from app.db import get_session
        from app.main import app
        # fixture override is installed in the main test thread; TestClient is thread-safe.
        with TestClient(app) as client:
            return client.post(path, headers=headers)

    with ThreadPoolExecutor(max_workers=3) as pool:
        holder = pool.submit(hold_row_lock)
        assert holder_ready.wait(timeout=5)
        first = pool.submit(pay)
        second = pool.submit(pay)
        # Verify both independent HTTP transactions reached PostgreSQL and are waiting
        # on the held target row before releasing it. Bound the wait to avoid hanging CI.
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            with database_engine.connect() as observer:
                waiters = observer.scalar(text(
                    "SELECT count(*) FROM pg_stat_activity "
                    "WHERE datname=current_database() AND wait_event_type='Lock' "
                    "AND query LIKE '%payment_request%'"
                ))
            if waiters >= 2:
                break
            time.sleep(0.025)
        else:
            release_holder.set()
            raise AssertionError("both payment requests did not overlap while waiting on PostgreSQL row lock")
        release_holder.set()
        holder.result(timeout=5)
        responses = [first.result(timeout=8), second.result(timeout=8)]

    assert [response.status_code for response in responses] == [200, 200], [response.text for response in responses]
    bodies = [response.json() for response in responses]
    assert bodies[0]["payment"]["id"] == bodies[1]["payment"]["id"]
    assert bodies[0]["paid_at"] == bodies[1]["paid_at"]
    assert db_session.scalar(select(func.count()).select_from(Payment)) == 1


def test_waiting_payment_proceeds_after_the_prior_lock_holder_rolls_back(
    api_client, db_session, database_engine
):
    request_id = make_open_request(db_session)
    path = f"/api/v1/payment-requests/{request_id}/simulate-payment"
    headers = {"X-Demo-User-Id": "2"}
    release_holder = Event()
    holder_ready = Event()

    def hold_then_rollback():
        with database_engine.connect() as connection:
            transaction = connection.begin()
            connection.execute(text("SELECT id FROM payment_request WHERE id=:id FOR UPDATE"),
                               {"id": request_id})
            holder_ready.set()
            if not release_holder.wait(timeout=5):
                raise TimeoutError("test did not release row lock holder")
            transaction.rollback()

    def pay():
        from fastapi.testclient import TestClient
        from app.main import app
        with TestClient(app) as client:
            return client.post(path, headers=headers)

    with ThreadPoolExecutor(max_workers=2) as pool:
        holder = pool.submit(hold_then_rollback)
        assert holder_ready.wait(timeout=5)
        payment = pool.submit(pay)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            with database_engine.connect() as observer:
                waiters = observer.scalar(text(
                    "SELECT count(*) FROM pg_stat_activity "
                    "WHERE datname=current_database() AND wait_event_type='Lock' "
                    "AND query LIKE '%payment_request%'"
                ))
            if waiters >= 1:
                break
            time.sleep(0.025)
        else:
            release_holder.set()
            raise AssertionError("payment did not wait on the target request lock")
        release_holder.set()
        holder.result(timeout=5)
        response = payment.result(timeout=8)

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "paid"
    assert db_session.scalar(select(func.count()).select_from(Payment)) == 1


def test_payment_for_an_unrelated_request_is_not_blocked_by_another_row_lock(
    api_client, db_session, database_engine
):
    locked_id = make_open_request(db_session, title="Locked")
    unrelated_id = make_open_request(db_session, student_id=102, title="Unrelated", amount_cents=700)
    release_holder = Event()
    holder_ready = Event()

    def hold_row_lock():
        with database_engine.connect() as connection:
            transaction = connection.begin()
            connection.execute(text("SELECT id FROM payment_request WHERE id=:id FOR UPDATE"),
                               {"id": locked_id})
            holder_ready.set()
            if not release_holder.wait(timeout=5):
                raise TimeoutError("test did not release row lock holder")
            transaction.rollback()

    def pay_unrelated():
        from fastapi.testclient import TestClient
        from app.main import app
        with TestClient(app) as client:
            return client.post(f"/api/v1/payment-requests/{unrelated_id}/simulate-payment",
                               headers={"X-Demo-User-Id": "2"})

    with ThreadPoolExecutor(max_workers=2) as pool:
        holder = pool.submit(hold_row_lock)
        assert holder_ready.wait(timeout=5)
        payment = pool.submit(pay_unrelated)
        response = payment.result(timeout=3)
        release_holder.set()
        holder.result(timeout=5)

    assert response.status_code == 200, response.text
    assert response.json()["id"] == unrelated_id
    assert db_session.scalar(select(func.count()).select_from(Payment)) == 1


def test_payment_commit_failure_rolls_back_and_does_not_leak_details(api_client, db_session, monkeypatch):
    request_id = make_open_request(db_session)
    from sqlalchemy.orm import Session as SQLSession

    actual_commit = SQLSession.commit

    def fail_commit(session):
        if session.info.get("test_injected_payment_commit_failure"):
            raise RuntimeError("secret database diagnostic")
        return actual_commit(session)

    # Mark only sessions used by the payment endpoint after it has acquired the row
    # and created the uncommitted write, by wrapping Session.add.
    actual_add = SQLSession.add
    def marked_add(session, instance, *, _warn=True):
        if isinstance(instance, Payment):
            session.info["test_injected_payment_commit_failure"] = True
        return actual_add(session, instance, _warn=_warn)

    monkeypatch.setattr(SQLSession, "add", marked_add)
    monkeypatch.setattr(SQLSession, "commit", fail_commit)
    response = api_client.post(f"/api/v1/payment-requests/{request_id}/simulate-payment",
                               headers={"X-Demo-User-Id": "2"})

    assert response.status_code == 500
    assert "secret database diagnostic" not in response.text
    with Session(db_session.get_bind()) as reader:
        saved = reader.get(PaymentRequest, request_id)
        assert saved.status == "open" and saved.paid_at is None
        assert reader.scalar(select(func.count()).select_from(Payment)) == 0


def test_payment_transaction_rollback_can_be_retried(api_client, db_session, monkeypatch):
    request_id = make_open_request(db_session)
    from sqlalchemy.orm import Session as SQLSession

    actual_flush = SQLSession.flush
    failed = False
    def fail_first_payment_flush(session, objects=None):
        nonlocal failed
        if not failed and any(isinstance(obj, Payment) for obj in (objects or session.new)):
            failed = True
            raise RuntimeError("injected flush failure")
        return actual_flush(session, objects)

    monkeypatch.setattr(SQLSession, "flush", fail_first_payment_flush)
    path = f"/api/v1/payment-requests/{request_id}/simulate-payment"
    first = api_client.post(path, headers={"X-Demo-User-Id": "2"})
    assert first.status_code == 500
    with Session(db_session.get_bind()) as reader:
        saved = reader.get(PaymentRequest, request_id)
        assert saved.status == "open" and saved.paid_at is None
        assert reader.scalar(select(func.count()).select_from(Payment)) == 0
    recovered = api_client.post(path, headers={"X-Demo-User-Id": "2"})
    assert recovered.status_code == 200, recovered.text
    assert recovered.json()["status"] == "paid"

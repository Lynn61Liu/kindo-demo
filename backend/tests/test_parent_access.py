from datetime import datetime, timezone

from app.models import Payment, PaymentRequest


def test_parent_list_is_limited_to_all_their_children_and_defaults_to_open(api_client, db_session):
    old = datetime(2026, 1, 1, tzinfo=timezone.utc)
    db_session.add_all([
        PaymentRequest(student_id=101, created_by=1, title="A1 open", amount_cents=100),
        PaymentRequest(student_id=102, created_by=1, title="A2 open", amount_cents=200),
        PaymentRequest(student_id=103, created_by=1, title="B open", amount_cents=300),
        PaymentRequest(student_id=101, created_by=1, title="A1 paid", amount_cents=400,
                       status="paid", paid_at=old),
    ])
    db_session.flush()
    paid = db_session.query(PaymentRequest).filter_by(title="A1 paid").one()
    db_session.add(Payment(payment_request_id=paid.id, payer_id=2, amount_cents=400,
                           provider_reference=f"simulated-{paid.id}", created_at=old))
    db_session.commit()

    response = api_client.get("/api/v1/payment-requests", headers={"X-Demo-User-Id": "2"})

    assert response.status_code == 200, response.text
    rows = response.json()["items"]
    assert {row["title"] for row in rows} == {"A1 open", "A2 open"}
    assert {row["student"]["id"] for row in rows} == {101, 102}


def test_parent_can_filter_paid_and_admin_cannot_use_parent_list(api_client, db_session):
    old = datetime(2026, 1, 1, tzinfo=timezone.utc)
    request = PaymentRequest(student_id=101, created_by=1, title="Paid for parent A",
                             amount_cents=400, status="paid", paid_at=old)
    db_session.add(request)
    db_session.flush()
    db_session.add(Payment(payment_request_id=request.id, payer_id=2, amount_cents=400,
                           provider_reference=f"simulated-{request.id}", created_at=old))
    db_session.commit()

    paid = api_client.get("/api/v1/payment-requests?status=paid",
                          headers={"X-Demo-User-Id": "2"})
    invalid = api_client.get("/api/v1/payment-requests?status=all",
                             headers={"X-Demo-User-Id": "2"})
    admin = api_client.get("/api/v1/payment-requests", headers={"X-Demo-User-Id": "1"})

    assert paid.status_code == 200 and [row["title"] for row in paid.json()["items"]] == ["Paid for parent A"]
    assert invalid.status_code == 422
    assert admin.status_code == 403


def test_parent_detail_is_owner_scoped_and_admin_can_read(api_client, db_session):
    request = PaymentRequest(student_id=101, created_by=1, title="Private detail", amount_cents=500)
    db_session.add(request)
    db_session.commit()
    path = f"/api/v1/payment-requests/{request.id}"

    owner = api_client.get(path, headers={"X-Demo-User-Id": "2"})
    other_parent = api_client.get(path, headers={"X-Demo-User-Id": "3"})
    admin = api_client.get(path, headers={"X-Demo-User-Id": "1"})
    missing = api_client.get("/api/v1/payment-requests/999999", headers={"X-Demo-User-Id": "2"})

    assert owner.status_code == 200 and owner.json()["student"]["id"] == 101
    assert other_parent.status_code == 404
    assert missing.status_code == 404
    assert admin.status_code == 200


def test_parent_cannot_read_paid_detail_of_another_parent(api_client, db_session):
    paid_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    request = PaymentRequest(student_id=103, created_by=1, title="B paid", amount_cents=600,
                             status="paid", paid_at=paid_at)
    db_session.add(request)
    db_session.flush()
    db_session.add(Payment(payment_request_id=request.id, payer_id=3, amount_cents=600,
                           provider_reference=f"simulated-{request.id}", created_at=paid_at))
    db_session.commit()

    response = api_client.get(f"/api/v1/payment-requests/{request.id}",
                              headers={"X-Demo-User-Id": "2"})
    assert response.status_code == 404


def test_owner_can_read_paid_detail_with_payment_summary(api_client, db_session):
    paid_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    request = PaymentRequest(student_id=101, created_by=1, title="A1 paid", amount_cents=600,
                             status="paid", paid_at=paid_at)
    db_session.add(request)
    db_session.flush()
    payment = Payment(payment_request_id=request.id, payer_id=2, amount_cents=600,
                      provider_reference=f"simulated-{request.id}", created_at=paid_at)
    db_session.add(payment)
    db_session.commit()

    response = api_client.get(f"/api/v1/payment-requests/{request.id}",
                              headers={"X-Demo-User-Id": "2"})
    assert response.status_code == 200
    assert response.json()["payment"]["id"] == payment.id
    assert response.json()["paid_at"] == response.json()["payment"]["created_at"]


def test_parent_list_requires_known_demo_identity(api_client):
    missing = api_client.get("/api/v1/payment-requests")
    unknown = api_client.get("/api/v1/payment-requests", headers={"X-Demo-User-Id": "999999"})
    assert missing.status_code == unknown.status_code == 401
    assert missing.json()["detail"]["code"] == "unauthenticated"


def test_parent_payment_for_another_child_is_hidden_even_when_paid(api_client, db_session):
    paid_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    request = PaymentRequest(student_id=103, created_by=1, title="B paid", amount_cents=600,
                             status="paid", paid_at=paid_at)
    db_session.add(request)
    db_session.flush()
    db_session.add(Payment(payment_request_id=request.id, payer_id=3, amount_cents=600,
                           provider_reference=f"simulated-{request.id}", created_at=paid_at))
    db_session.commit()

    response = api_client.post(f"/api/v1/payment-requests/{request.id}/simulate-payment",
                               headers={"X-Demo-User-Id": "2"})
    assert response.status_code == 404

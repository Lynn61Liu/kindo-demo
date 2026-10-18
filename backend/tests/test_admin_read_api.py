from datetime import datetime, timezone

from app.models import Payment, PaymentRequest


def test_admin_students_returns_student_and_parent_names(api_client):
    response = api_client.get("/api/v1/admin/students", headers={"X-Demo-User-Id": "1"})

    assert response.status_code == 200, response.text
    assert response.json() == {"items": [
        {"id": 101, "name": "Student A1", "parent": {"id": 2, "name": "Parent A"}},
        {"id": 102, "name": "Student A2", "parent": {"id": 2, "name": "Parent A"}},
        {"id": 103, "name": "Student B1", "parent": {"id": 3, "name": "Parent B"}},
    ]}


def test_parent_cannot_read_admin_students(api_client):
    response = api_client.get("/api/v1/admin/students", headers={"X-Demo-User-Id": "2"})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "forbidden"


def test_admin_requests_default_all_are_detailed_and_newest_first(api_client, db_session):
    older = PaymentRequest(student_id=101, created_by=1, title="Older", amount_cents=1000)
    newer = PaymentRequest(student_id=102, created_by=1, title="Newer", amount_cents=2500,
                           status="paid", paid_at=datetime(2026, 1, 2, tzinfo=timezone.utc))
    db_session.add_all([older, newer])
    db_session.flush()
    payment = Payment(payment_request_id=newer.id, payer_id=2, amount_cents=2500,
                      provider_reference=f"simulated-{newer.id}", created_at=newer.paid_at)
    db_session.add(payment)
    db_session.commit()

    response = api_client.get("/api/v1/admin/payment-requests", headers={"X-Demo-User-Id": "1"})

    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert [item["title"] for item in items] == ["Newer", "Older"]
    assert items[0]["student"] == {"id": 102, "name": "Student A2"}
    assert items[0]["parent"] == {"id": 2, "name": "Parent A"}
    assert items[0]["created_by"] == 1
    assert items[0]["amount_cents"] == 2500
    assert items[0]["currency"] == "NZD"
    assert items[0]["status"] == "paid"
    assert items[0]["payment"] == {
        "id": payment.id,
        "payer_id": 2,
        "amount_cents": 2500,
        "status": "succeeded",
        "provider_reference": f"simulated-{newer.id}",
        "created_at": "2026-01-02T00:00:00Z",
    }
    assert items[1]["payment"] is None


def test_admin_requests_filter_open_and_paid(api_client, db_session):
    db_session.add_all([
        PaymentRequest(student_id=101, created_by=1, title="Open row", amount_cents=100),
        PaymentRequest(student_id=102, created_by=1, title="Paid row", amount_cents=200,
                       status="paid", paid_at=datetime(2026, 1, 2, tzinfo=timezone.utc)),
    ])
    db_session.commit()
    headers = {"X-Demo-User-Id": "1"}

    opened = api_client.get("/api/v1/admin/payment-requests?status=open", headers=headers)
    paid = api_client.get("/api/v1/admin/payment-requests?status=paid", headers=headers)
    assert [row["title"] for row in opened.json()["items"]] == ["Open row"]
    assert [row["title"] for row in paid.json()["items"]] == ["Paid row"]


def test_parent_cannot_read_admin_requests(api_client):
    response = api_client.get("/api/v1/admin/payment-requests", headers={"X-Demo-User-Id": "2"})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "forbidden"


def test_admin_request_filter_rejects_unknown_status(api_client):
    response = api_client.get("/api/v1/admin/payment-requests?status=overdue",
                              headers={"X-Demo-User-Id": "1"})
    assert response.status_code == 422

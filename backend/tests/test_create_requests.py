from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Payment, PaymentRequest


def valid_payload(**overrides):
    return {
        "student_id": 101,
        "title": "School trip",
        "description": "Museum visit",
        "amount_cents": 1250,
        "due_date": None,
        **overrides,
    }


def request_counts(database_engine):
    with Session(database_engine) as reader:
        return (
            reader.scalar(select(func.count()).select_from(PaymentRequest)),
            reader.scalar(select(func.count()).select_from(Payment)),
        )


def test_admin_creates_open_request(api_client, database_engine):
    response = api_client.post(
        "/api/v1/payment-requests",
        headers={"X-Demo-User-Id": "1"},
        json=valid_payload(),
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["student"] == {"id": 101, "name": "Student A1"}
    assert body["parent"] == {"id": 2, "name": "Parent A"}
    assert body["created_by"] == 1
    assert body["title"] == "School trip"
    assert body["description"] == "Museum visit"
    assert body["amount_cents"] == 1250
    assert body["currency"] == "NZD"
    assert body["status"] == "open"
    assert body["paid_at"] is None
    assert body["payment"] is None

    with Session(database_engine) as reader:
        saved = reader.get(PaymentRequest, body["id"])
        assert saved is not None
        assert saved.title == "School trip"
        assert saved.amount_cents == 1250
        assert saved.status == "open"
        assert saved.paid_at is None
        assert reader.scalar(select(func.count()).select_from(Payment)) == 0


def test_invalid_amount_does_not_insert(api_client, database_engine):
    before = request_counts(database_engine)
    for invalid in (0, -1, 1.5, "1250", True, 100_000_001):
        response = api_client.post(
            "/api/v1/payment-requests",
            headers={"X-Demo-User-Id": "1"},
            json=valid_payload(amount_cents=invalid),
        )
        assert response.status_code == 422, (invalid, response.text)
        assert request_counts(database_engine) == before


def test_blank_title_does_not_insert(api_client, database_engine):
    before = request_counts(database_engine)
    response = api_client.post(
        "/api/v1/payment-requests",
        headers={"X-Demo-User-Id": "1"},
        json=valid_payload(title="  \t\n "),
    )
    assert response.status_code == 422, response.text
    assert request_counts(database_engine) == before


def test_title_and_empty_description_are_normalized(api_client):
    response = api_client.post(
        "/api/v1/payment-requests",
        headers={"X-Demo-User-Id": "1"},
        json=valid_payload(title="  School trip  ", description="  "),
    )

    assert response.status_code == 201, response.text
    assert response.json()["title"] == "School trip"
    assert response.json()["description"] is None


def test_iso_due_date_from_date_input_is_accepted(api_client):
    response = api_client.post(
        "/api/v1/payment-requests",
        headers={"X-Demo-User-Id": "1"},
        json=valid_payload(due_date="2026-10-31"),
    )

    assert response.status_code == 201, response.text
    assert response.json()["due_date"] == "2026-10-31"


def test_invalid_or_non_date_due_date_does_not_insert(api_client, database_engine):
    before = request_counts(database_engine)
    for invalid in ("2026-02-30", "2026-10-18T00:00:00Z", "18/10/2026"):
        response = api_client.post(
            "/api/v1/payment-requests",
            headers={"X-Demo-User-Id": "1"},
            json=valid_payload(due_date=invalid),
        )
        assert response.status_code == 422, (invalid, response.text)
        assert request_counts(database_engine) == before


def test_client_cannot_override_server_owned_fields(api_client, database_engine):
    before = request_counts(database_engine)
    for forbidden in ({"parent_id": 3}, {"role": "admin"}, {"status": "paid"}):
        response = api_client.post(
            "/api/v1/payment-requests",
            headers={"X-Demo-User-Id": "1"},
            json={**valid_payload(), **forbidden},
        )
        assert response.status_code == 422, (forbidden, response.text)
        assert request_counts(database_engine) == before


def test_parent_cannot_create_request(api_client, database_engine):
    before = request_counts(database_engine)
    response = api_client.post(
        "/api/v1/payment-requests",
        headers={"X-Demo-User-Id": "2"},
        json=valid_payload(),
    )
    assert response.status_code == 403, response.text
    assert request_counts(database_engine) == before


def test_unknown_student_does_not_insert(api_client, database_engine):
    before = request_counts(database_engine)
    response = api_client.post(
        "/api/v1/payment-requests",
        headers={"X-Demo-User-Id": "1"},
        json=valid_payload(student_id=999_999),
    )
    assert response.status_code == 404, response.text
    assert response.json()["detail"]["code"] == "not_found"
    assert request_counts(database_engine) == before

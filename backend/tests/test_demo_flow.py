"""End-to-end backend acceptance flow across admin and both demo parents."""


def test_admin_to_parent_payment_flow_is_student_scoped(api_client):
    admin = {"X-Demo-User-Id": "1"}
    parent_a = {"X-Demo-User-Id": "2"}
    parent_b = {"X-Demo-User-Id": "3"}

    def create(student_id, title, amount_cents):
        response = api_client.post(
            "/api/v1/payment-requests",
            headers=admin,
            json={
                "student_id": student_id,
                "title": title,
                "description": None,
                "amount_cents": amount_cents,
                "due_date": None,
            },
        )
        assert response.status_code == 201, response.text
        return response.json()

    a1 = create(101, "School trip", 1250)
    a2 = create(102, "Sports fee", 2000)

    listed = api_client.get("/api/v1/payment-requests", headers=parent_a)
    assert listed.status_code == 200, listed.text
    assert {row["id"] for row in listed.json()["items"]} == {a1["id"], a2["id"]}
    assert {row["student"]["id"] for row in listed.json()["items"]} == {101, 102}

    payment_path = f"/api/v1/payment-requests/{a1['id']}/simulate-payment"
    first = api_client.post(payment_path, headers=parent_a)
    retry = api_client.post(payment_path, headers=parent_a)
    assert first.status_code == retry.status_code == 200, (first.text, retry.text)
    assert first.json()["status"] == "paid"
    assert first.json()["payment"]["amount_cents"] == 1250
    assert retry.json()["payment"]["id"] == first.json()["payment"]["id"]
    assert retry.json()["paid_at"] == first.json()["paid_at"]

    parent_a_open = api_client.get("/api/v1/payment-requests", headers=parent_a)
    assert [row["id"] for row in parent_a_open.json()["items"]] == [a2["id"]]
    assert parent_a_open.json()["items"][0]["amount_cents"] == 2000
    assert parent_a_open.json()["items"][0]["status"] == "open"

    admin_rows = api_client.get("/api/v1/admin/payment-requests", headers=admin)
    assert admin_rows.status_code == 200, admin_rows.text
    by_id = {row["id"]: row for row in admin_rows.json()["items"]}
    assert by_id[a1["id"]]["status"] == "paid"
    assert by_id[a1["id"]]["payment"]["id"] == first.json()["payment"]["id"]
    assert by_id[a2["id"]]["status"] == "open"
    assert by_id[a2["id"]]["amount_cents"] == 2000

    parent_b_list = api_client.get("/api/v1/payment-requests", headers=parent_b)
    assert parent_b_list.status_code == 200, parent_b_list.text
    assert all(row["id"] not in {a1["id"], a2["id"]} for row in parent_b_list.json()["items"])
    detail = api_client.get(f"/api/v1/payment-requests/{a1['id']}", headers=parent_b)
    payment = api_client.post(
        f"/api/v1/payment-requests/{a1['id']}/simulate-payment", headers=parent_b
    )
    assert detail.status_code == 404, detail.text
    assert payment.status_code == 404, payment.text

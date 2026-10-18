from sqlalchemy.exc import OperationalError


def test_unexpected_database_error_uses_generic_internal_error_shape(api_client, monkeypatch):
    import app.api as api

    def fail_query(_session):
        raise OperationalError("SELECT secret_column", {}, RuntimeError("private driver detail"))

    monkeypatch.setattr(api, "list_admin_students", fail_query)
    response = api_client.get("/api/v1/admin/students", headers={"X-Demo-User-Id": "1"})

    assert response.status_code == 500
    assert response.json() == {
        "detail": {"code": "internal_error", "message": "A database error occurred"}
    }
    assert "secret_column" not in response.text
    assert "private driver detail" not in response.text

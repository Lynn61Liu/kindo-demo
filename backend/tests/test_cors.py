from fastapi.testclient import TestClient

from app.main import app


def test_vite_origin_can_send_demo_identity_header():
    with TestClient(app) as client:
        response = client.options(
            "/api/v1/payment-requests",
            headers={
                "Origin": "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,x-demo-user-id",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
    assert "x-demo-user-id" in response.headers["access-control-allow-headers"].lower()

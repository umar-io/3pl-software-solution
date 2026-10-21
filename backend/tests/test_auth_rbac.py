from datetime import datetime, timedelta, timezone

import jwt

from app.services import inventory_service as svc
from app.services.auth import ALGORITHM, create_token
from tests.conftest import PASSWORD, headers_for


def login(client, email, password=PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


# --- authentication -------------------------------------------------------- #

def test_login_returns_token_and_permissions(client):
    res = login(client, "ops@t.io")
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["role"] == "operator"
    assert "variance:review" in body["user"]["permissions"]
    assert "variance:adjust" not in body["user"]["permissions"]
    assert "password_hash" not in str(body)


def test_login_failures_are_indistinguishable(client):
    wrong_pw = login(client, "ops@t.io", "nope")
    unknown = login(client, "ghost@t.io")
    disabled = login(client, "off@t.io")
    assert {wrong_pw.status_code, unknown.status_code, disabled.status_code} == {401}
    assert wrong_pw.json() == unknown.json() == disabled.json()


def test_protected_routes_need_a_token(client):
    for path in ["/api/inventory/health", "/api/orders/", "/api/auth/me"]:
        assert client.get(path).status_code == 401


def test_garbage_and_tampered_tokens_rejected(client, db):
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer abc"}).status_code == 401
    good = headers_for(db, "ops@t.io")["Authorization"].split()[1]
    forged = jwt.encode({"sub": "1", "role": "admin", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
                        "wrong-secret-wrong-secret-wrong-secret-xx", algorithm=ALGORITHM)
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {good}"}).status_code == 200


def test_alg_none_token_rejected(client):
    token = jwt.encode({"sub": "1", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}, None, algorithm="none")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_expired_token_rejected(client, db):
    long_ago = datetime.now(timezone.utc) - timedelta(days=2)
    token = create_token(1, "admin", now=long_ago)
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_role_comes_from_db_not_token(client, db):
    # A merchant holding a token that *claims* admin must still be treated as merchant.
    from app.models.auth import User
    merchant = db.query(User).filter_by(email="glow@t.io").one()
    token = create_token(merchant.id, "admin")
    res = client.patch("/api/inventory/variances/1", json={"status": "resolved"},
                       headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


def test_disabling_a_user_revokes_access_immediately(client, db):
    from app.models.auth import User
    headers = headers_for(db, "ops@t.io")
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    db.query(User).filter_by(email="ops@t.io").one().active = False
    db.commit()
    assert client.get("/api/auth/me", headers=headers).status_code == 401


# --- authorisation --------------------------------------------------------- #

def test_review_requires_operator_or_admin(client, db, monkeypatch):
    seen = {}
    def fake(db_, quant_id, status, note, actor):
        seen["actor"] = actor
        return {"id": quant_id, "status": status}
    monkeypatch.setattr(svc, "update_review", fake)

    body = {"status": "investigated"}
    assert client.patch("/api/inventory/variances/5", json=body).status_code == 401
    assert client.patch("/api/inventory/variances/5", json=body, headers=headers_for(db, "glow@t.io")).status_code == 403
    assert client.patch("/api/inventory/variances/5", json=body, headers=headers_for(db, "ops@t.io")).status_code == 200
    assert seen["actor"] == "ops@t.io"  # taken from the token, not the request


def test_client_cannot_spoof_actor(client, db, monkeypatch):
    seen = {}
    monkeypatch.setattr(svc, "update_review", lambda d, q, s, n, a: seen.setdefault("actor", a) and {"id": q})
    client.patch("/api/inventory/variances/5", json={"status": "open", "actor": "admin@t.io"},
                 headers=headers_for(db, "ops@t.io"))
    assert seen["actor"] == "ops@t.io"


def test_receiving_and_sync_are_staff_only(client, db, monkeypatch):
    monkeypatch.setattr(svc, "get_receiving", lambda d: {})
    monkeypatch.setattr(svc, "sync", lambda d: {})
    merchant = headers_for(db, "glow@t.io")
    assert client.get("/api/inventory/receiving", headers=merchant).status_code == 403
    assert client.post("/api/inventory/sync", headers=merchant).status_code == 403
    ops = headers_for(db, "ops@t.io")
    assert client.get("/api/inventory/receiving", headers=ops).status_code == 200
    assert client.post("/api/inventory/sync", headers=ops).status_code == 200


def test_cancel_is_admin_only(client, db, monkeypatch):
    from app.api import orders
    monkeypatch.setattr(orders, "update_order_status", lambda **kw: {"ok": True, "actor": kw["actor"]})
    assert client.put("/api/orders/1/cancelled", headers=headers_for(db, "ops@t.io")).status_code == 403
    assert client.put("/api/orders/1/picking", headers=headers_for(db, "glow@t.io")).status_code == 403
    assert client.put("/api/orders/1/picking", headers=headers_for(db, "ops@t.io")).status_code == 200
    assert client.put("/api/orders/1/cancelled", headers=headers_for(db, "admin@t.io")).status_code == 200


# --- merchant data scoping ------------------------------------------------- #

def test_merchant_is_pinned_to_their_client(client, db, monkeypatch):
    captured = {}
    def fake_list(db_, **kw):
        captured.update(kw)
        return {"items": []}
    monkeypatch.setattr(svc, "list_variances", fake_list)

    res = client.get("/api/inventory/variances?client=HomeNest", headers=headers_for(db, "glow@t.io"))
    assert res.status_code == 200
    assert captured["client"] == "Glow Cosmetics"       # query-string override ignored
    assert captured["scope_client"] == "Glow Cosmetics"

    client.get("/api/inventory/variances?client=HomeNest", headers=headers_for(db, "ops@t.io"))
    assert captured["client"] == "HomeNest" and captured["scope_client"] is None


def test_merchant_orders_are_filtered_and_isolated(client, db, monkeypatch):
    from app.api import orders
    captured = {}
    monkeypatch.setattr(orders, "orders_list", lambda db_, **kw: captured.update(kw) or {"items": []})
    monkeypatch.setattr(orders, "single_order", lambda db_, id: {"id": 1, "merchant": "HomeNest"})
    h = headers_for(db, "glow@t.io")
    client.get("/api/orders/?merchant=HomeNest", headers=h)
    assert captured["merchant"] == "Glow Cosmetics"
    assert client.get("/api/orders/1", headers=h).status_code == 404
    assert client.get("/api/orders/1", headers=headers_for(db, "ops@t.io")).status_code == 200

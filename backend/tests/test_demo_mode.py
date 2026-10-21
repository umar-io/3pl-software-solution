import pytest

from app.services import clock
from app.services.demo_odoo import DemoReadOnly, SnapshotOdooClient
from tests.conftest import headers_for

SNAPSHOT = {
    "taken_at": "2026-10-20T12:00:00+00:00",
    "odoo": {
        "sale.order": [
            {"id": 8, "name": "S8", "state": "sale", "date_order": "2026-10-07 10:00:00", "partner_id": [3, "Ann"]},
            {"id": 16, "name": "S16", "state": "sale", "date_order": "2026-10-07 10:00:00", "partner_id": [4, "Bo"]},
            {"id": 2, "name": "S2", "state": "draft", "date_order": "2026-10-09 10:00:00", "partner_id": False},
        ],
        "stock.quant": [
            {"id": 1, "location_id": [8, "WH/Stock"], "location_id.usage": "internal", "quantity": 5.0},
            {"id": 2, "location_id": [9, "Vendors"], "location_id.usage": "supplier", "quantity": 1.0},
        ],
    },
}


@pytest.fixture()
def odoo(monkeypatch):
    monkeypatch.setattr("app.services.demo_odoo.load_snapshot", lambda: SNAPSHOT)
    return SnapshotOdooClient()


def ids(rows):
    return [r["id"] for r in rows]


def test_ordering_is_numeric_with_id_tiebreak(odoo):
    # 8 and 16 share a date; ids must compare as numbers, not strings ("8" > "16").
    rows = odoo.search_read("sale.order", order="date_order desc, id desc")
    assert ids(rows) == [2, 16, 8]
    assert ids(odoo.search_read("sale.order", order="date_order asc, id asc")) == [8, 16, 2]


@pytest.mark.parametrize(
    "domain, expected",
    [
        ([("id", "=", 8)], [8]),
        ([("id", "in", [2, 16])], [2, 16]),
        ([("state", "not in", ["draft"])], [8, 16]),
        ([("date_order", ">=", "2026-10-08 00:00:00")], [2]),
        ([("partner_id", "!=", False)], [8, 16]),
        ([("partner_id", "=", False)], [2]),
        ([("partner_id", "in", [4])], [16]),     # many2one compares on its id
        ([("name", "ilike", "s1")], [16]),
    ],
)
def test_domain_operators(odoo, domain, expected):
    assert sorted(ids(odoo.search_read("sale.order", domain))) == sorted(expected)


def test_dotted_domain_uses_denormalised_key(odoo):
    rows = odoo.search_read("stock.quant", [("location_id.usage", "=", "internal")])
    assert ids(rows) == [1]


def test_projection_limit_count_read(odoo):
    assert odoo.search_read("sale.order", fields=["name"], limit=1, order="id asc")[0] == {"id": 2, "name": "S2"}
    assert odoo.search_count("sale.order", [("state", "=", "sale")]) == 2
    assert odoo.read("sale.order", [8], ["name"]) == [{"id": 8, "name": "S8"}]


def test_writes_and_unsupported_domains_are_refused(odoo):
    with pytest.raises(DemoReadOnly):
        odoo.call("stock.quant", "action_apply_inventory", [[1]])
    with pytest.raises(DemoReadOnly):
        odoo.message_post("sale.order", [8], "hi")
    with pytest.raises(NotImplementedError):
        odoo.search_read("sale.order", ["|", ("id", "=", 1), ("id", "=", 2)])
    with pytest.raises(NotImplementedError):
        odoo.search_read("nope.model")


def test_clock_is_frozen_only_in_demo_mode(monkeypatch):
    monkeypatch.setattr(clock, "load_snapshot", lambda: SNAPSHOT)
    monkeypatch.setenv("DEMO_MODE", "1")
    assert clock.now().isoformat() == "2026-10-20T12:00:00+00:00"
    assert clock.utcnow_naive().year == 2026
    monkeypatch.delenv("DEMO_MODE")
    assert clock.now().year >= 2026 and clock.now().isoformat() != "2026-10-20T12:00:00+00:00"


def test_viewer_can_read_but_never_write(client, db, monkeypatch):
    from app.models.auth import User
    from app.services import inventory_service as svc
    from app.services.auth import hash_password

    db.add(User(email="viewer@t.io", name="v", role="viewer", password_hash=hash_password("x")))
    db.commit()
    monkeypatch.setattr(svc, "get_health", lambda d, scope_client=None: {"ok": True})
    monkeypatch.setattr(svc, "get_receiving", lambda d: {"ok": True})
    h = headers_for(db, "viewer@t.io")
    assert client.get("/api/inventory/health", headers=h).status_code == 200
    assert client.get("/api/inventory/receiving", headers=h).status_code == 200
    assert client.patch("/api/inventory/variances/1", json={"status": "open"}, headers=h).status_code == 403
    assert client.post("/api/inventory/variances/1/adjust", json={"expected": 1, "counted": 0, "reason": "xxx"}, headers=h).status_code == 403
    assert client.post("/api/inventory/sync", headers=h).status_code == 403
    assert client.put("/api/orders/1/picking", headers=h).status_code == 403

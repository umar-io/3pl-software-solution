import pytest

from app.models.inventory import VarianceAdjustment, VarianceReview
from app.services import inventory_service as svc
from tests.conftest import headers_for

QUANT = 7


def variance(expected=37.0, actual=23.0):
    return {
        "id": QUANT, "product_id": 38, "sku": "GC-003", "client": "Glow Cosmetics",
        "location": "WH/Stock", "expected": expected, "actual": actual,
    }


class FakeOdoo:
    """Just enough of OdooClient to drive apply_adjustment."""

    def __init__(self, *, applies=True, raises=None, returns=None, chatter_fails=False):
        self.applies, self.raises, self.returns, self.chatter_fails = applies, raises, returns, chatter_fails
        self.applied = False
        self.messages = []

    def call(self, model, method, args=None, kwargs=None):
        assert (model, method) == ("stock.quant", "action_apply_inventory")
        assert kwargs == {"context": {"inventory_mode": True}}
        if self.applies:
            self.applied = True
        if self.raises:
            raise self.raises
        return self.returns

    def read(self, model, ids, fields=None):
        if model == "stock.quant":
            if self.applied:
                return [{"quantity": 23.0, "inventory_quantity_set": False}]
            return [{"quantity": 37.0, "inventory_quantity_set": True}]
        return [{"product_tmpl_id": [99, "GC-003"]}]

    def message_post(self, model, ids, body):
        if self.chatter_fails:
            raise RuntimeError("mail down")
        self.messages.append((model, ids, body))


@pytest.fixture()
def wired(db, monkeypatch):
    db.add(VarianceReview(quant_id=QUANT, status="investigated"))
    db.commit()
    monkeypatch.setattr(svc, "_build_variances", lambda d, scope=None: ([variance()], [], None))
    monkeypatch.setattr(svc, "invalidate_cache", lambda: None)

    def install(odoo):
        monkeypatch.setattr(svc, "get_odoo_client", lambda: odoo)
        return odoo

    return install


def adjust(client, db, who="admin@t.io", **over):
    body = {"expected": 37, "counted": 23, "reason": "Pallet confirmed short by carrier"} | over
    return client.post(f"/api/inventory/variances/{QUANT}/adjust", json=body, headers=headers_for(db, who))


def test_only_admin_can_adjust(client, db, wired):
    wired(FakeOdoo())
    assert client.post(f"/api/inventory/variances/{QUANT}/adjust", json={}).status_code == 401
    assert adjust(client, db, "ops@t.io").status_code == 403
    assert adjust(client, db, "glow@t.io").status_code == 403


def test_success_applies_audits_and_resolves(client, db, wired):
    odoo = wired(FakeOdoo())
    res = adjust(client, db)
    assert res.status_code == 200, res.text
    assert res.json()["chatter_posted"] is True

    model, _ids, body = odoo.messages[0]
    assert model == "product.template" and "37 → 23" in body and "admin@t.io" in body

    audit = db.query(VarianceAdjustment).one()
    assert (audit.quantity_before, audit.quantity_after, audit.actor) == (37, 23, "admin@t.io")
    review = db.query(VarianceReview).one()
    assert review.status == "resolved" and review.note.startswith("Adjusted in Odoo")


def test_reason_is_required(client, db, wired):
    wired(FakeOdoo())
    assert adjust(client, db, reason="").status_code == 422
    assert adjust(client, db, reason="  ").status_code == 422


def test_stale_numbers_are_refused_without_touching_odoo(client, db, wired):
    odoo = wired(FakeOdoo())
    res = adjust(client, db, counted=20)  # screen showed 20, Odoo now says 23
    assert res.status_code == 409
    assert not odoo.applied and db.query(VarianceAdjustment).count() == 0


def test_variance_gone_is_404(client, db, wired, monkeypatch):
    wired(FakeOdoo())
    monkeypatch.setattr(svc, "_build_variances", lambda d, scope=None: ([], [], None))
    assert adjust(client, db).status_code == 404


def test_odoo_permission_refusal_is_explained_and_changes_nothing(client, db, wired):
    odoo = wired(FakeOdoo(applies=False, raises=Exception("Only a stock manager can validate an inventory adjustment.")))
    res = adjust(client, db)
    assert res.status_code == 502 and "Inventory Administrator" in res.json()["detail"]
    assert db.query(VarianceAdjustment).count() == 0
    assert db.query(VarianceReview).one().status == "investigated"


def test_wizard_response_is_not_treated_as_applied(client, db, wired):
    wired(FakeOdoo(applies=False, returns={"res_model": "stock.inventory.conflict"}))
    res = adjust(client, db)
    assert res.status_code == 409 and db.query(VarianceAdjustment).count() == 0


def test_error_after_successful_apply_is_still_success(client, db, wired):
    # Odoo sometimes applies and then fails to serialise its return value.
    wired(FakeOdoo(applies=True, raises=Exception("cannot marshal")))
    assert adjust(client, db).status_code == 200


def test_chatter_failure_does_not_hide_the_adjustment(client, db, wired):
    wired(FakeOdoo(chatter_fails=True))
    res = adjust(client, db)
    assert res.status_code == 200 and res.json()["chatter_posted"] is False
    assert db.query(VarianceAdjustment).one().chatter_posted is False

"""Freeze the current Odoo + local database state into backend/app/demo/snapshot.json.

The public demo (DEMO_MODE=1) serves this file instead of calling Odoo.
Review the output before committing it: it contains order, customer and
partner details exactly as they exist in your Odoo.

  PYTHONPATH=backend backend/.venv/bin/python scripts/export_demo_snapshot.py
"""

import json
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import select

from app.database import SessionLocal
from app.models.fulfillment import FulfillmentEvent, FulfillmentOrder
from app.models.inventory import InventorySnapshot, VarianceReview
from app.services.clock import DEFAULT_SNAPSHOT
from app.services.inventory_service import QUANT_FIELDS
from app.services.odoo import OdooClient
from app.services.order_service import LINE_FIELDS, ORDER_FIELDS, PARTNER_FIELDS

o = OdooClient()


def m2o_id(value):
    return value[0] if isinstance(value, (list, tuple)) else None


def odoo_models() -> dict:
    out = {}

    quants = o.search_read("stock.quant", [("location_id.usage", "=", "internal")], QUANT_FIELDS)
    for q in quants:
        q["location_id.usage"] = "internal"  # lets the demo client answer the dotted domain
    out["stock.quant"] = quants

    out["product.product"] = o.search_read("product.product", [], ["default_code", "name", "product_tmpl_id"])
    out["stock.picking"] = o.search_read(
        "stock.picking", [],
        ["name", "state", "partner_id", "origin", "scheduled_date", "date_done", "create_date", "picking_type_code"],
    )
    out["stock.move"] = o.search_read(
        "stock.move", [],
        ["picking_id", "product_id", "product_uom_qty", "quantity", "state", "picking_code", "date"],
    )

    orders = o.search_read("sale.order", [], ORDER_FIELDS)
    out["sale.order"] = orders
    by_order = {x["id"]: x for x in orders}
    lines = o.search_read("sale.order.line", [], LINE_FIELDS)
    for line in lines:
        parent = by_order.get(m2o_id(line["order_id"]), {})
        line["order_id.state"] = parent.get("state", False)
        line["order_id.date_order"] = parent.get("date_order", False)
    out["sale.order.line"] = lines

    partner_ids = {m2o_id(x[f]) for x in orders for f in ("partner_id", "partner_shipping_id") if x.get(f)}
    out["res.partner"] = o.read("res.partner", sorted(p for p in partner_ids if p), PARTNER_FIELDS)
    return out


def jsonable(value):
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def rows(db, model, columns):
    return [{c: jsonable(getattr(r, c)) for c in columns} for r in db.scalars(select(model))]


def db_tables() -> dict:
    with SessionLocal() as db:
        return {
            "fulfillment_orders": rows(db, FulfillmentOrder, ["id", "odoo_order_id", "status", "merchant", "carrier", "tracking_number", "created_at", "updated_at"]),
            "fulfillment_events": rows(db, FulfillmentEvent, ["id", "fulfillment_order_id", "from_status", "to_status", "note", "actor", "created_at"]),
            "variance_reviews": rows(db, VarianceReview, ["id", "quant_id", "status", "note", "actor", "first_seen_at", "updated_at"]),
            "inventory_snapshots": [
                {**{c: jsonable(getattr(r, c)) for c in ["id", "health_score", "accuracy_pct", "open_variances", "critical_variances"]},
                 "snapshot_date": r.snapshot_date.isoformat()}
                for r in db.scalars(select(InventorySnapshot))
            ],
        }


def main():
    snapshot = {
        "taken_at": datetime.now(timezone.utc).isoformat(),
        "odoo": odoo_models(),
        "db": db_tables(),
    }
    DEFAULT_SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
    DEFAULT_SNAPSHOT.write_text(json.dumps(snapshot, indent=1, default=str), encoding="utf-8")
    print(f"Wrote {DEFAULT_SNAPSHOT} ({DEFAULT_SNAPSHOT.stat().st_size // 1024} KB)")
    for group in ("odoo", "db"):
        for name, items in snapshot[group].items():
            print(f"  {group}:{name:<22} {len(items)}")


if __name__ == "__main__":
    main()

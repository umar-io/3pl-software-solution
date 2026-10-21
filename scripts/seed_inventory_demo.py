"""Seed demo data for the Inventory Accuracy dashboard.

WRITES TO YOUR LOCAL DEV DATABASES - run it only against the demo stack.

Odoo (via XML-RPC):
  * moves a few client SKUs into extra bins (internal transfers) (Shelf 1 / Shelf 2 / LFC/Stock)
    so the per-location breakdown has something to show
  * enters pending physical counts that differ from on-hand (the variances)
  * creates a handful of validated receipts (one short, one blind)

Postgres:
  * backdates variance "first seen" times and marks a couple as investigated
  * backfills 13 days of *synthetic* health-score history for the trend line

Usage (from repo root):
  PYTHONPATH=backend backend/.venv/bin/python scripts/seed_inventory_demo.py
  PYTHONPATH=backend backend/.venv/bin/python scripts/seed_inventory_demo.py --reset
"""

import sys
from datetime import timedelta

from sqlalchemy import delete, select

from app.database import SessionLocal
from app.models.inventory import InventorySnapshot, VarianceReview
from app.services import inventory_service as svc
from app.services.odoo import OdooClient

INV = {"context": {"inventory_mode": True}}

# (sku, location, quantity) - put-away into bins that are empty today.
STOCK_IN = [
    ("GC-002", "WH/Stock/Shelf 1", 24),
    ("GC-001", "WH/Stock/Shelf 1", 30),
    ("UT-001", "WH/Stock/Shelf 1", 40),
    ("UT-003", "WH/Stock/Shelf 2", 20),
    ("HN-002", "WH/Stock/Shelf 2", 25),
    ("HN-001", "WH/Stock/Shelf 2", 80),
    ("GC-004", "LFC/Stock", 60),
    ("GC-003", "LFC/Stock", 20),
    ("UT-002", "LFC/Stock", 12),
    ("HN-003", "LFC/Stock", 20),
]

# (sku, location, counted minus on-hand, hours since first seen, note)
COUNTS = [
    ("GC-001", "WH/Stock", -9, 52, None),
    ("GC-003", "WH/Stock", -14, 130, "Re-count requested for Aisle 4"),
    ("GC-002", "WH/Stock/Shelf 1", 6, 20, None),
    ("GC-004", "LFC/Stock", -3, 6, None),
    ("UT-002", "WH/Stock", -12, 175, None),
    ("UT-001", "WH/Stock", -2, 30, None),
    ("UT-003", "WH/Stock/Shelf 2", 8, 9, None),
    ("HN-001", "WH/Stock", -52, 78, "Pallet short vs. ASN; checking with carrier"),
    ("HN-002", "WH/Stock", -5, 41, None),
    ("HN-003", "LFC/Stock", 7, 3, None),
    ("E-COM11", "WH/Stock", -21, 100, None),
    ("FURN_0269", "WH/Stock", -4, 27, None),
]
INVESTIGATED = {"GC-003", "HN-001"}

# (origin, sku, ordered, received, blind)
RECEIPTS = [
    ("PO-DEMO-101", "GC-001", 40, 40, False),
    ("PO-DEMO-102", "UT-001", 60, 60, False),
    ("PO-DEMO-103", "HN-002", 30, 30, False),
    ("PO-DEMO-104", "UT-003", 40, 34, False),
]

# Synthetic daily health scores, oldest first (13 days before today).
HISTORY = [90.8, 90.1, 89.4, 88.2, 86.7, 85.9, 84.1, 82.6, 83.4, 81.9, 82.8, 84.3, 85.1]


def product_id(odoo, sku):
    ids = odoo.call("product.product", "search", [[("default_code", "=", sku)]], {"limit": 1})
    return ids[0] if ids else None


def location_id(odoo, name):
    ids = odoo.call("stock.location", "search", [[("complete_name", "=", name)]], {"limit": 1})
    if not ids:
        raise SystemExit(f"Location not found in Odoo: {name}")
    return ids[0]


def find_quant(odoo, pid, loc):
    ids = odoo.call("stock.quant", "search", [[("product_id", "=", pid), ("location_id", "=", loc)]], {"limit": 1})
    return ids[0] if ids else None


def reset(odoo):
    ids = odoo.call("stock.quant", "search", [[("inventory_quantity_set", "=", True)]])
    if ids:
        try:  # the call succeeds but Odoo then fails to serialise its return value
            odoo.call("stock.quant", "action_clear_inventory_quantity", [ids], INV)
        except Exception:
            pass
    with SessionLocal() as db:
        db.execute(delete(VarianceReview))
        db.execute(delete(InventorySnapshot))
        db.commit()
    svc.invalidate_cache()
    print(f"Cleared {len(ids)} pending counts and local review/snapshot rows.")


def validate(odoo, pick, **ctx):
    odoo.call("stock.picking", "button_validate", [[pick]], {"context": {"skip_backorder": True, "skip_immediate": True, "picking_ids_not_to_backorder": [pick], **ctx}})


def stock_bins(odoo):
    """Put-away via validated internal transfers (no inventory-manager rights needed)."""
    ptype = odoo.call("stock.picking.type", "search", [[("code", "=", "internal"), ("warehouse_id.code", "=", "WH")]], {"limit": 1})[0]
    source = location_id(odoo, "WH/Stock")
    for sku, loc_name, qty in STOCK_IN:
        pid, dest = product_id(odoo, sku), location_id(odoo, loc_name)
        origin = f"PUTAWAY-DEMO-{sku}-{loc_name.split('/')[-1]}"
        if not pid or odoo.search_count("stock.picking", [("origin", "=", origin)]):
            continue
        pick = odoo.call("stock.picking", "create", [{
            "picking_type_id": ptype, "origin": origin,
            "location_id": source, "location_dest_id": dest,
            "move_ids_without_package": [(0, 0, {
                "name": sku, "product_id": pid, "product_uom_qty": qty,
                "location_id": source, "location_dest_id": dest,
            })],
        }])
        odoo.call("stock.picking", "action_confirm", [[pick]])
        odoo.call("stock.picking", "action_assign", [[pick]])
        move = odoo.search_read("stock.move", [("picking_id", "=", pick)], ["id"])[0]["id"]
        odoo.call("stock.move", "write", [[move], {"quantity": qty}])
        validate(odoo, pick)
        print(f"  moved {qty} x {sku} into {loc_name}")


def enter_counts(odoo):
    for sku, loc_name, delta, _hours, _note in COUNTS:
        pid, loc = product_id(odoo, sku), location_id(odoo, loc_name)
        quant_id = find_quant(odoo, pid, loc) if pid else None
        if not quant_id:
            print(f"  ! no quant for {sku} @ {loc_name}, skipped")
            continue
        qty = odoo.read("stock.quant", [quant_id], ["quantity"])[0]["quantity"]
        odoo.call("stock.quant", "write", [[quant_id], {"inventory_quantity": qty + delta}], INV)
        print(f"  counted {sku} @ {loc_name}: {qty:g} -> {qty + delta:g}")


def create_receipts(odoo):
    ptype = odoo.call("stock.picking.type", "search", [[("code", "=", "incoming"), ("warehouse_id.code", "=", "WH")]], {"limit": 1})[0]
    vendors = odoo.call("stock.location", "search", [[("usage", "=", "supplier")]], {"limit": 1})[0]
    dest = location_id(odoo, "WH/Stock")
    partner = odoo.call("res.partner", "search", [[("name", "=", "Wood Corner")]], {"limit": 1})
    for origin, sku, ordered, received, _blind in RECEIPTS:
        if odoo.search_count("stock.picking", [("origin", "=", origin)]):
            continue
        pick = odoo.call("stock.picking", "create", [{
            "picking_type_id": ptype,
            "partner_id": partner[0] if partner else False,
            "origin": origin,
            "location_id": vendors, "location_dest_id": dest,
            "move_ids_without_package": [(0, 0, {
                "name": sku, "product_id": product_id(odoo, sku), "product_uom_qty": ordered,
                "location_id": vendors, "location_dest_id": dest,
            })],
        }])
        odoo.call("stock.picking", "action_confirm", [[pick]])
        odoo.call("stock.picking", "action_assign", [[pick]])
        move = odoo.search_read("stock.move", [("picking_id", "=", pick)], ["id"])[0]["id"]
        odoo.call("stock.move", "write", [[move], {"quantity": received}])
        validate(odoo, pick)
        print(f"  receipt {origin}: ordered {ordered}, received {received}")


def finalize_local(odoo):
    svc.invalidate_cache()
    with SessionLocal() as db:
        svc.list_variances(db)  # creates a review row per variance
        now = svc._now()
        by_key = {}
        for sku, loc_name, _d, hours, note in COUNTS:
            pid, loc = product_id(odoo, sku), location_id(odoo, loc_name)
            qid = find_quant(odoo, pid, loc) if pid else None
            if qid:
                by_key[qid] = (sku, hours, note)
        for review in db.scalars(select(VarianceReview)):
            if review.quant_id in by_key:
                sku, hours, note = by_key[review.quant_id]
                review.first_seen_at = now - timedelta(hours=hours)
                if sku in INVESTIGATED:
                    review.status, review.actor, review.note = "investigated", "operator", note
        db.commit()

        today = now.date()
        for i, score in enumerate(HISTORY):
            day = today - timedelta(days=len(HISTORY) - i)
            if db.scalar(select(InventorySnapshot).where(InventorySnapshot.snapshot_date == day)):
                continue
            db.add(InventorySnapshot(
                snapshot_date=day, health_score=score,
                accuracy_pct=round(min(100, score + 3.5), 1),
                open_variances=max(1, round((100 - score) / 1.4)),
                critical_variances=max(0, round((90 - score) / 4)),
            ))
        db.commit()
        svc.invalidate_cache()
        health = svc.get_health(db)
        print(f"Health score now {health['score']} ({health['status']}), "
              f"{health['summary']['open_variances']} open variances.")


def main():
    odoo = OdooClient()
    if "--reset" in sys.argv:
        reset(odoo)
        return
    print("Stocking bins..."); stock_bins(odoo)
    print("Creating receipts..."); create_receipts(odoo)
    print("Entering counts..."); enter_counts(odoo)
    print("Writing local review state..."); finalize_local(odoo)


if __name__ == "__main__":
    main()

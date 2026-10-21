"""First-boot seeding for the public demo (DEMO_MODE=1). Safe to run on every start.

Loads the snapshot's database rows into an empty database and makes sure the
read-only demo viewer exists. Does nothing outside demo mode.
"""

import os
from datetime import date, datetime

from sqlalchemy import func, select, text

from app.database import SessionLocal
from app.models.auth import User
from app.models.fulfillment import FulfillmentEvent, FulfillmentOrder, FulfillmentStatus
from app.models.inventory import InventorySnapshot, VarianceReview
from app.services.auth import hash_password
from app.services.clock import demo_mode, load_snapshot

DATETIME_COLUMNS = {"created_at", "updated_at", "first_seen_at"}


def _prepare(row: dict) -> dict:
    out = dict(row)
    for key in DATETIME_COLUMNS & out.keys():
        out[key] = datetime.fromisoformat(out[key])
    if "snapshot_date" in out:
        out["snapshot_date"] = date.fromisoformat(out["snapshot_date"])
    return out


def _ensure_user(db, email: str, name: str, role: str, password: str) -> None:
    if db.scalar(select(User).where(User.email == email)) is None:
        db.add(User(email=email, name=name, role=role, password_hash=hash_password(password)))
        print(f"demo seed: created {email} ({role})")


def main() -> None:
    if not demo_mode():
        return
    tables = load_snapshot()["db"]
    with SessionLocal() as db:
        if db.scalar(select(func.count()).select_from(FulfillmentOrder)) == 0:
            for model, key in [
                (FulfillmentOrder, "fulfillment_orders"),
                (FulfillmentEvent, "fulfillment_events"),
                (VarianceReview, "variance_reviews"),
                (InventorySnapshot, "inventory_snapshots"),
            ]:
                for row in tables[key]:
                    row = _prepare(row)
                    if model is FulfillmentOrder:
                        row["status"] = FulfillmentStatus(row["status"])
                    db.add(model(**row))
                db.flush()
            for table in ("fulfillment_orders", "fulfillment_events", "variance_reviews", "inventory_snapshots"):
                db.execute(text(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE(MAX(id), 1)) FROM {table}"))
            print("demo seed: loaded snapshot rows")

        _ensure_user(db, "viewer@fulfill.demo", "Demo viewer", "viewer", os.environ["DEMO_VIEWER_PASSWORD"])
        if os.getenv("DEMO_ADMIN_PASSWORD"):
            _ensure_user(db, "admin@fulfill.demo", "Demo admin", "admin", os.environ["DEMO_ADMIN_PASSWORD"])
        db.commit()


if __name__ == "__main__":
    main()

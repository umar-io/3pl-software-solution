"""Pre-compute every API response the read-only demo needs, as static JSON.

Runs the real backend service code against the demo snapshot, so the static site
shows exactly what the API would. Output: frontend/public/demo-data/

Needs a scratch Postgres (it records a trend snapshot), e.g.:

  createdb fulfillment_demo
  export DEMO_MODE=1 DEMO_VIEWER_PASSWORD=x JWT_SECRET=$(openssl rand -hex 32) \\
         DATABASE_URL=postgresql+psycopg2://USER:PASS@localhost:5433/fulfillment_demo
  (cd backend && alembic upgrade head)
  PYTHONPATH=backend backend/.venv/bin/python -m app.demo_seed
  PYTHONPATH=backend backend/.venv/bin/python scripts/export_static_demo.py
"""

import json
import shutil
from pathlib import Path

from app.database import SessionLocal
from app.services import clock, inventory_service as inv
from app.services.order_service import orders_list, single_order

OUT = Path(__file__).resolve().parent.parent / "frontend" / "public" / "demo-data"


def write(name: str, data) -> None:
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, separators=(",", ":"), default=str), encoding="utf-8")


def main() -> None:
    if not clock.demo_mode():
        raise SystemExit("Set DEMO_MODE=1 so the data comes from the snapshot, not live Odoo.")
    shutil.rmtree(OUT, ignore_errors=True)

    with SessionLocal() as db:
        # Unsorted, unfiltered: the browser re-applies the API's filter/sort rules.
        variances, _lines, fetched_at = inv._build_variances(db)
        write("variances.json", variances)
        write("health.json", inv.get_health(db))
        write("breakdown-client.json", inv.get_breakdown(db, "client"))
        write("breakdown-location.json", inv.get_breakdown(db, "location"))
        write("receiving.json", inv.get_receiving(db))

        orders = orders_list(db, limit=1000)
        write("orders.json", orders)
        for item in orders["items"]:
            write(f"orders/{item['id']}.json", single_order(db, str(item["id"])))

    write("meta.json", {"as_of": clock.now().isoformat(), "variance_count": len(variances)})
    print(f"Wrote {sum(1 for _ in OUT.rglob('*.json'))} files to {OUT}")


if __name__ == "__main__":
    main()

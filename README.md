# Fulfill 3PL: Odoo Inventory Accuracy & Reconciliation

Odoo tells you what your stock *should* be. This tool shows you where you can't trust that number, what to fix first, and who is working on it.

It is a demo built for mid-market **3PL warehouses** on top of **Odoo 17**: it pulls stock data from Odoo, turns pending physical counts into a health score, ranks the mismatches, tracks their resolution, and (for admins) can push the correction back to Odoo.

> **Status:** a learning project and demo, built while learning Odoo. The public demo runs on sample data. It is not production software.

![Dashboard](docs/screenshots/dashboard.png)

<table>
  <tr>
    <td><img src="docs/screenshots/exceptions.png" alt="Exception queue"/></td>
    <td><img src="docs/screenshots/variance-drawer.png" alt="Variance review drawer"/></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/accuracy.png" alt="Accuracy by client and location"/></td>
    <td><img src="docs/screenshots/receiving.png" alt="Receiving and cycle counts"/></td>
  </tr>
</table>

<img src="docs/screenshots/mobile-dashboard.png" alt="Mobile dashboard" width="280"/>

## What it does

- **Inventory health score:** one 0–100 number (Good / Needs attention / Critical) with a 14-day trend, plus open, critical and new-this-week counts.
- **Exception queue:** every counted quantity that differs from Odoo, filterable by client, location, severity, status and date. Open a row to mark it *Investigated* or *Resolved* and leave a note.
- **Accuracy breakdown:** accuracy per client and per location, with click-through to the variances behind each number.
- **Receiving & cycle counts:** how many completed receipts matched their order, potential blind receipts, quantity mismatches, and whether the fastest-moving SKUs were counted recently.
- **Write-back to Odoo (admin only):** apply the counted quantity to Odoo with a confirmation step, a required reason, a fresh-state check, read-back verification, a chatter note on the product, and an audit record.
- **Role-based access (JWT):** merchants see only their own client's data; operators work the queue; admins can adjust stock.
- **Order fulfillment view:** the earlier order workflow (Odoo sale orders → pick → pack → dispatch) lives under *Orders*.
- Responsive from phone to desktop.

## How the numbers work

A **variance** is an Odoo `stock.quant` with a pending physical count (`inventory_quantity`) that differs from on-hand (`quantity`).

**Severity.** Shortages are treated as worse than overages, and small differences on small bins are never critical.

| Case | Rule |
|---|---|
| Shortage | **Critical** if the count is below *reserved* stock, ≥ 50 units short, or ≥ 25% *and* ≥ 10 units short. **Moderate** if ≥ 8% *and* ≥ 3 units. Otherwise minor. |
| Overage | **Critical** if ≥ 100 units over. **Moderate** if ≥ 15% *and* ≥ 5 units. Otherwise minor. |

**Health score** = `60% × line accuracy + 40% × unit accuracy`
- *Line accuracy* = 1 − (severity-weighted variances ÷ stock lines), with weights critical 1.0, moderate 0.5, minor 0.25.
- *Unit accuracy* = 1 − (units off ÷ units on hand).
- Bands: **≥ 90** Good, **≥ 75** Needs attention, **< 75** Critical.

This is my own formula, chosen to be explainable, not an industry standard. It lives in one place (`backend/app/services/inventory_service.py`) and is unit-tested.

## Architecture

```
React + Tailwind  ──HTTP/JWT──▶  FastAPI  ──XML-RPC──▶  Odoo 17
 (frontend/)                    (backend/)              (docker-compose)
                                    │
                                    ▼
                               PostgreSQL
              (users, variance reviews, daily snapshots,
               adjustment audit log, fulfillment orders)
```

Odoo owns the stock data. The app owns what Odoo can't hold: who reviewed a variance, the score history, user accounts and the audit trail. Odoo reads are cached for 30 seconds and a lock serialises the XML-RPC calls.

**Stack:** Odoo 17 · FastAPI · SQLAlchemy · Alembic · PostgreSQL · PyJWT + bcrypt · React 18 · TypeScript · Vite · Tailwind CSS · pytest.

## Quick start (local)

**Prerequisites:** Docker, Python 3.12+, Node 18+.

### 1. Start Odoo and Postgres

```bash
docker compose up -d
```

Odoo is at <http://localhost:8070>. Create an Odoo database and install the **Inventory**, **Sales** and **CRM** apps (the `first_module` addon in `addons/` is mounted automatically). The compose file also creates a `fulfillment` Postgres database on port `5433` for this app.

### 2. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirement.txt -r requirements-dev.txt

cat > .env <<'EOF'
DATABASE_URL=postgresql+psycopg2://odoo:odoo@localhost:5433/fulfillment
ODOO_URL=http://localhost:8070
ODOO_DB=your-odoo-database
ODOO_USERNAME=admin
ODOO_PASSWORD=your-odoo-password
JWT_SECRET=<a long random string, 32+ characters>
EOF

alembic upgrade head
uvicorn app.main:app --reload --port 8005
```

The frontend defaults to `http://localhost:8005/api` (override with `VITE_API_BASE`). If you use another port, note that `docker-compose.yml` points Odoo's new-order webhook at `:8001`.

### 3. Seed demo data

```bash
# from the repo root, with the backend venv active
export PYTHONPATH=backend
python scripts/seed_inventory_demo.py   # pending counts, bin stock, receipts, review state, trend history
python scripts/seed_users.py            # demo users; passwords are printed once
```

`seed_inventory_demo.py` **writes to your local Odoo and Postgres** (it moves stock between bins, validates a few receipts and enters counts). Run it only against a demo stack. `--reset` clears the pending counts and review state.

`scripts/seed_odoo.py` creates the original products, merchants and orders. It uses Odoo's in-process API, so it has to run where Odoo's Python package is available (for example inside the Odoo container).

### 4. Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Sign in with one of the users `seed_users.py` printed.

## Roles & permissions

Enforced on the server (`backend/app/api/deps.py`). The UI only hides buttons.

| Permission | merchant | viewer | operator | admin |
|---|:-:|:-:|:-:|:-:|
| View inventory dashboards (merchant: own client only) | ✓ | ✓ | ✓ | ✓ |
| View receiving & counts | | ✓ | ✓ | ✓ |
| Mark variances investigated / resolved | | | ✓ | ✓ |
| Sync from Odoo, advance orders | | | ✓ | ✓ |
| Cancel orders | | | | ✓ |
| **Apply an adjustment to Odoo** | | | | ✓ |

Design notes: a user's role and active flag are read from the database on every request (so demoting or disabling takes effect immediately), the audit actor always comes from the token and never from the request body, and login failures return one generic message.

## API

All routes need `Authorization: Bearer <token>` except `/api/auth/login` and the Odoo webhook (shared secret).

| Method & path | Purpose |
|---|---|
| `POST /api/auth/login` · `GET /api/auth/me` | Sign in, current user and permissions |
| `GET /api/inventory/health` | Score, summary cards, trend, top mismatches |
| `GET /api/inventory/variances` | Queue; filters: `client, location, severity, status, since_days, q, sort, limit, offset` |
| `PATCH /api/inventory/variances/{id}` | Set status and note |
| `POST /api/inventory/variances/{id}/adjust` | Write the counted quantity to Odoo (admin) |
| `GET /api/inventory/breakdown?group_by=client\|location` | Accuracy per group |
| `GET /api/inventory/receiving` | Receipt and cycle-count metrics |
| `POST /api/inventory/sync` | Bypass the cache and re-pull from Odoo |
| `GET/PUT/POST /api/orders/…` | Order fulfillment workflow |

Interactive docs: <http://localhost:8005/docs>.

## Tests

```bash
cd backend && pytest
```

53 tests cover:
- login and token handling (forged, `alg: none`, expired and tampered tokens), role checks and merchant data isolation;
- severity and health-score logic;
- the write-back paths against a fake Odoo (success, stale numbers, permission refusal, wizard responses, errors after a successful apply);
- the demo snapshot client.

## Public demo

The live demo is a **fully static, read-only site**: pre-generated JSON plus a small browser-side adapter that applies the same filtering the API does. There is no server, database or login to run, and it never touches a real Odoo. The adapter was checked against the backend on 805 filter/sort/paging combinations.

```bash
cd frontend && npm run build:static    # outputs frontend/dist
```

`DEPLOY.md` covers refreshing the data and publishing it for $0, and also describes an optional Cloud Run deployment of the real API in a read-only `DEMO_MODE`.

## Project layout

```
backend/
  app/api/          routers (auth, inventory, orders, webhooks) and the permission guards
  app/services/     inventory_service (scoring, variances, write-back), order_service,
                    odoo client, auth (JWT/bcrypt), demo snapshot client
  app/models/       SQLAlchemy models
  alembic/          migrations
  tests/            pytest suite
frontend/src/
  pages/            Dashboard, Exceptions, Accuracy, Receiving, Orders, Login
  components/       ui/ (design primitives) and inventory/ (domain components)
  lib/              API clients, formatting, static-demo adapter
addons/first_module Odoo addon: notifies this app when a sale order is created
scripts/            seeders and snapshot/static-demo exporters
docker-compose.yml  Odoo 17 + Postgres 15
```

## Known limitations

- **Write-back needs Odoo rights.** `action_apply_inventory` requires the integration user to be an *Inventory Administrator* in Odoo. It is tested against a mocked Odoo; run it against a test variance in your own instance before relying on it.
- **"Client" is inferred**, not modelled: it comes from Odoo's `owner_id` if set, otherwise a SKU-prefix map (`GC-`, `UT-`, `HN-`), otherwise "House stock". A real deployment would use consignment ownership or a product field.
- **Score history is only as real as the snapshots.** The first 13 days in the demo are synthetic; real history accumulates one snapshot per day.
- **Cycle-count "velocity"** is derived from confirmed sales orders and outbound moves over 30 days.
- **Not hardened for the internet:** no login rate limiting, the token is kept in `localStorage`, and CORS is restricted to localhost plus `CORS_ORIGINS`.
- Resolving a variance in the UI does not change Odoo; only the explicit *Apply adjustment* action does.

## Security notes

- Keep `backend/.env` out of version control (it holds Odoo credentials and the JWT secret). The repo `.gitignore` excludes it.
- Demo passwords are generated randomly by `seed_users.py`; don't reuse them.
- The demo snapshot and static data contain only Odoo's sample contacts and fictional customers. Review `backend/app/demo/snapshot.json` and `frontend/public/demo-data/` before publishing a fork.

## Roadmap ideas

- Scheduled daily snapshots and alerting on critical variances
- First-class client ownership (consignment) instead of SKU prefixes
- Bulk review and CSV export for the queue
- Login rate limiting and httpOnly-cookie sessions
- Live write-back demo against a hosted Odoo

## License

No license has been chosen yet. Add one (for example MIT) before publishing if you want others to reuse the code.

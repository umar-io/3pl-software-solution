# Publishing the demo

Two ways, both read-only and both safe to share. **A is free and needs no card.**

## A. Static site (recommended, $0, no backend)

The whole demo is a folder of files: the app plus pre-generated JSON
(`frontend/public/demo-data/`). The browser applies the same filtering and sorting
the API would. There is no server, database or login to run or defend, and it never
sleeps. Your Odoo is not involved.

### 1. (Optional) Refresh the data

Only needed if you changed the seed data. This re-reads your running Odoo, then
regenerates the JSON from it.

```bash
# 1. Snapshot Odoo + the local DB
PYTHONPATH=backend backend/.venv/bin/python scripts/export_demo_snapshot.py

# 2. Replay the snapshot through the real backend code into static JSON
docker exec odoo-dev-db-1 psql -U odoo -d postgres -c "CREATE DATABASE fulfillment_demo"
export DEMO_MODE=1 DEMO_VIEWER_PASSWORD=x JWT_SECRET=$(openssl rand -hex 32) \
       DATABASE_URL=postgresql+psycopg2://odoo:odoo@localhost:5433/fulfillment_demo
(cd backend && .venv/bin/alembic upgrade head)
PYTHONPATH=backend backend/.venv/bin/python -m app.demo_seed
PYTHONPATH=backend backend/.venv/bin/python scripts/export_static_demo.py
docker exec odoo-dev-db-1 psql -U odoo -d postgres -c "DROP DATABASE fulfillment_demo"
```

Review `frontend/public/demo-data/` before publishing: it contains the order and
partner data from your Odoo (currently Odoo's sample contacts plus the seed script's
fictional customers).

### 2. Build

```bash
cd frontend
npm ci
npm run build:static      # outputs frontend/dist
```

### 3. Upload `frontend/dist`

Any static host works. Easiest, no CLI and no card:

- **Netlify:** app.netlify.com/drop, then drag the `dist` folder onto the page.
- **Cloudflare Pages:** create a project and upload the `dist` folder directly.

`dist/_redirects` makes deep links (e.g. `/exceptions?severity=critical`) work.

### Check before sharing

- Open every page on desktop and on a phone.
- The banner says it is a read-only demo; there is no login and no sign-out button.
- DevTools → Network: the only external request should be Google Fonts.

## B. Real API on Cloud Run (optional, later)

Needs a Google Cloud billing account (a card, and in some regions a refundable
prepayment). Only worth it if you want the real JWT login and API running publicly.
The container, demo mode and `DEMO_MODE` seeding are already built; the steps are
below.

### B0. Refresh the snapshot (optional)

```bash
PYTHONPATH=backend backend/.venv/bin/python scripts/export_demo_snapshot.py
```
Review `backend/app/demo/snapshot.json` before committing: it holds order and
partner data exactly as it is in your Odoo.

### B1. Database: Neon

1. Create a free project at neon.tech and copy the **connection string**
   (it looks like `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`).
2. If you hit an error about `channel_binding`, delete that parameter from the URL.
3. Nothing to load by hand: the container runs the migrations and seeds the demo
   rows on first boot.

### B2. API: Cloud Run

You need a Google Cloud project with **billing enabled** (Cloud Run's free tier
still requires a card). Create a **budget alert** first (Billing → Budgets) so a
mistake can't surprise you.

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

# Secrets (paste the values when prompted by the shell, don't commit them)
printf '%s' 'YOUR_NEON_CONNECTION_STRING' | gcloud secrets create demo-database-url --data-file=-
python3 -c 'import secrets;print(secrets.token_urlsafe(48),end="")' | gcloud secrets create demo-jwt-secret --data-file=-
printf '%s' 'CHOOSE-A-PUBLIC-VIEWER-PASSWORD' | gcloud secrets create demo-viewer-password --data-file=-

# Let Cloud Run's runtime account read them
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format='value(projectNumber)')
for s in demo-database-url demo-jwt-secret demo-viewer-password; do
  gcloud secrets add-iam-policy-binding $s \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor
done

# Build from ./backend and deploy
gcloud run deploy fulfill-api \
  --source backend \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 2 \
  --memory 512Mi --cpu 1 \
  --set-env-vars DEMO_MODE=1 \
  --set-secrets DATABASE_URL=demo-database-url:latest,JWT_SECRET=demo-jwt-secret:latest,DEMO_VIEWER_PASSWORD=demo-viewer-password:latest
```

`--allow-unauthenticated` only means the *URL* is public; every data route still
needs a JWT. Note the service URL it prints, e.g. `https://fulfill-api-xxxx.a.run.app`.

The first request after idle takes ~15 s (cold start + migrations check).

### B3. Frontend

```bash
cd frontend
cp .env.production.example .env.production   # fill in the API URL + viewer login
npm ci && npm run build                        # outputs frontend/dist
```
Upload `frontend/dist` to Netlify (drag-and-drop), Cloudflare Pages or Firebase
Hosting. `public/_redirects` already makes deep links work on Netlify/Cloudflare.

### B4. Allow the frontend to call the API

```bash
gcloud run services update fulfill-api --region us-central1 \
  --update-env-vars CORS_ORIGINS=https://YOUR-FRONTEND-URL
```

### Checks before you share the link

- Open the site, click **Fill in the demo login**, and visit every page.
- `curl -i https://YOUR-API/api/inventory/health` → `401` (not data).
- Confirm no `.env` or real credentials are in the repo or the image.
- Optional: add `DEMO_ADMIN_PASSWORD` as a secret to create a private admin for
  your own screen recordings. Never publish that password.

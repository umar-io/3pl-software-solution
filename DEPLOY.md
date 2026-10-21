# Deploying the public demo (Cloud Run + Neon + static frontend)

The demo runs with `DEMO_MODE=1`: the API serves a **read-only snapshot** of the
Odoo data (`backend/app/demo/snapshot.json`) instead of calling Odoo, and the only
public login is a read-only `viewer`. Your local Odoo is never exposed.

## 0. Refresh the snapshot (optional)

```bash
PYTHONPATH=backend backend/.venv/bin/python scripts/export_demo_snapshot.py
```
Review `backend/app/demo/snapshot.json` before committing: it holds order and
partner data exactly as it is in your Odoo.

## 1. Database: Neon

1. Create a free project at neon.tech and copy the **connection string**
   (it looks like `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`).
2. If you hit an error about `channel_binding`, delete that parameter from the URL.
3. Nothing to load by hand: the container runs the migrations and seeds the demo
   rows on first boot.

## 2. API: Cloud Run

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

## 3. Frontend: any static host

```bash
cd frontend
cp .env.production.example .env.production   # fill in the API URL + viewer login
npm ci && npm run build                        # outputs frontend/dist
```
Upload `frontend/dist` to Netlify (drag-and-drop), Cloudflare Pages or Firebase
Hosting. `public/_redirects` already makes deep links work on Netlify/Cloudflare.

## 4. Allow the frontend to call the API

```bash
gcloud run services update fulfill-api --region us-central1 \
  --update-env-vars CORS_ORIGINS=https://YOUR-FRONTEND-URL
```

## Checks before you share the link

- Open the site, click **Fill in the demo login**, and visit every page.
- `curl -i https://YOUR-API/api/inventory/health` → `401` (not data).
- Confirm no `.env` or real credentials are in the repo or the image.
- Optional: add `DEMO_ADMIN_PASSWORD` as a secret to create a private admin for
  your own screen recordings. Never publish that password.

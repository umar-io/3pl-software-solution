#!/bin/sh
set -e
# Apply pending migrations, then serve. Cloud Run provides $PORT.
alembic upgrade head
python -m app.demo_seed   # no-op unless DEMO_MODE=1
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8080}" --proxy-headers

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv

COPY requirement.txt .
RUN pip install --no-cache-dir -r requirement.txt

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app
COPY docker-entrypoint.sh .

# Cloud Run runs containers as root by default; drop privileges.
RUN useradd --no-create-home --shell /usr/sbin/nologin app && chmod +x docker-entrypoint.sh
USER app

ENV PORT=8080
EXPOSE 8080
CMD ["./docker-entrypoint.sh"]

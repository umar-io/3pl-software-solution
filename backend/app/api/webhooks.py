import os

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.database import get_db
from app.services.order_service import ingest_order

router = APIRouter()


class OdooWebhookPayload(BaseModel):
    order_id: int


@router.post("/odoo")
def odoo_webhook(
    payload: OdooWebhookPayload,
    db=Depends(get_db),
    x_webhook_secret: str | None = Header(default=None),
):
    """Called by Odoo when a new sale order is created.

    Set WEBHOOK_SECRET in the environment to require the
    `X-Webhook-Secret` header.
    """
    secret = os.getenv("WEBHOOK_SECRET")
    if secret and x_webhook_secret != secret:
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    result = ingest_order(db, payload.order_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Odoo order not found")
    return result

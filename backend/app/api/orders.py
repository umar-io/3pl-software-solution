from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.api.deps import get_current_user, require, scope_client
from app.database import get_db
from app.models.auth import User
from app.services.auth import permissions_for
from app.services.order_service import (
    bulk_advance,
    orders_list,
    single_order,
    sync_orders,
    update_order_status,
)

router = APIRouter()


class StatusUpdate(BaseModel):
    carrier: str | None = None
    tracking_number: str | None = None


class BulkAdvanceRequest(BaseModel):
    ids: list[int]


@router.get("/")
def get_orders(
    db=Depends(get_db),
    user: User = Depends(require("order:read")),
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
    merchant: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    return orders_list(
        db,
        status=status,
        q=q,
        merchant=scope_client(user) or merchant,
        limit=limit,
        offset=offset,
    )


@router.post("/sync")
def sync(db=Depends(get_db), user: User = Depends(require("order:advance"))):
    try:
        return sync_orders(db)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to sync with Odoo: {exc}",
        )


@router.post("/bulk-advance")
def bulk(
    payload: BulkAdvanceRequest,
    db=Depends(get_db),
    user: User = Depends(require("order:advance")),
):
    return bulk_advance(db, payload.ids, actor=user.email)


@router.get("/{id}")
def get_single_order(
    id: str,
    db=Depends(get_db),
    user: User = Depends(require("order:read")),
):
    order = single_order(db, id)
    pinned = scope_client(user)
    # 404 rather than 403 so a merchant can't probe for other clients' order ids.
    if order is None or (pinned and order.get("merchant") != pinned):
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.put("/{id}/{action}")
def update_single_order(
    id: str,
    action: str,
    payload: StatusUpdate | None = None,
    db=Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Cancelling is destructive, so it needs its own permission.
    needed = "order:cancel" if action == "cancelled" else "order:advance"
    if needed not in permissions_for(user.role):
        raise HTTPException(status_code=403, detail="You don't have permission to do that")
    return update_order_status(
        db=db,
        id=id,
        action=action,
        carrier=payload.carrier if payload else None,
        tracking_number=payload.tracking_number if payload else None,
        actor=user.email,
    )

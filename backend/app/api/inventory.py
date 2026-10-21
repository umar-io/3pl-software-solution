from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.deps import require, scope_client
from app.database import get_db
from app.models.auth import User
from app.services import inventory_service as svc

router = APIRouter()


class AdjustRequest(BaseModel):
    # The numbers the user saw; the server refuses if Odoo has moved on.
    expected: float
    counted: float
    reason: str = Field(min_length=3, max_length=500)


class ReviewUpdate(BaseModel):
    status: Literal["open", "investigated", "resolved"]
    note: str | None = Field(default=None, max_length=500)


def _odoo_guard(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except HTTPException:
        raise
    except Exception as exc:  # Odoo unreachable, auth failure, etc.
        raise HTTPException(status_code=502, detail=f"Odoo request failed: {exc}")


@router.get("/health")
def health(db=Depends(get_db), user: User = Depends(require("inventory:read"))):
    return _odoo_guard(svc.get_health, db, scope_client=scope_client(user))


@router.get("/variances")
def variances(
    db=Depends(get_db),
    user: User = Depends(require("inventory:read")),
    client: str | None = None,
    location: str | None = None,
    severity: Literal["critical", "moderate", "minor"] | None = None,
    status: Literal["active", "open", "investigated", "resolved", "all"] = "active",
    since_days: int | None = Query(default=None, ge=1, le=365),
    q: str | None = None,
    sort: Literal["severity", "difference", "age", "sku"] = "severity",
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    pinned = scope_client(user)
    return _odoo_guard(
        svc.list_variances,
        db,
        client=pinned or client,  # a merchant cannot widen this via the query string
        location=location,
        severity=severity,
        status=status,
        since_days=since_days,
        q=q,
        sort=sort,
        limit=limit,
        offset=offset,
        scope_client=pinned,
    )


@router.patch("/variances/{quant_id}")
def update_variance(
    quant_id: int,
    payload: ReviewUpdate,
    db=Depends(get_db),
    user: User = Depends(require("variance:review")),
):
    # The actor is the authenticated user, never something the client claims.
    result = _odoo_guard(
        svc.update_review, db, quant_id, payload.status, payload.note, user.email
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Variance not found")
    return result


@router.post("/variances/{quant_id}/adjust")
def adjust_variance(
    quant_id: int,
    payload: AdjustRequest,
    db=Depends(get_db),
    user: User = Depends(require("variance:adjust")),
):
    try:
        return svc.apply_adjustment(
            db, quant_id, payload.expected, payload.counted, payload.reason, user.email
        )
    except svc.AdjustmentError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Odoo request failed: {exc}")


@router.get("/breakdown")
def breakdown(
    db=Depends(get_db),
    user: User = Depends(require("inventory:read")),
    group_by: Literal["client", "location"] = "client",
):
    return _odoo_guard(svc.get_breakdown, db, group_by, scope_client=scope_client(user))


@router.get("/receiving")
def receiving(db=Depends(get_db), user: User = Depends(require("receiving:read"))):
    return _odoo_guard(svc.get_receiving, db)


@router.post("/sync")
def sync(db=Depends(get_db), user: User = Depends(require("inventory:sync"))):
    return _odoo_guard(svc.sync, db)

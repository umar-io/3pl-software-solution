import re
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func, select

from app.models.fulfillment import FulfillmentEvent, FulfillmentOrder, FulfillmentStatus
from app.services import clock
from app.services.odoo import OdooClient, get_odoo_client

_last_sync: datetime | None = None

ORDER_FIELDS = [
    "id",
    "name",
    "client_order_ref",
    "partner_id",
    "partner_shipping_id",
    "amount_total",
    "state",
    "date_order",
]

LINE_FIELDS = [
    "id",
    "order_id",
    "product_id",
    "name",
    "product_uom_qty",
    "price_unit",
    "price_subtotal",
]

PARTNER_FIELDS = [
    "name",
    "email",
    "phone",
    "street",
    "street2",
    "city",
    "zip",
    "state_id",
    "country_id",
]

# The seed script stores the merchant as a separate partner and never links it
# to the order, so for the demo we infer it from the product code prefix.
MERCHANT_BY_CODE = {
    "GC": "Glow Cosmetics",
    "UT": "Urban Threads",
    "HN": "HomeNest",
}

STATUS_VALUES = [
    FulfillmentStatus.RECEIVED,
    FulfillmentStatus.PICKING,
    FulfillmentStatus.PACKED,
    FulfillmentStatus.DISPATCHED,
    FulfillmentStatus.DELIVERED,
    FulfillmentStatus.CANCELLED,
]


def odoo() -> OdooClient:
    """Lazily connect to Odoo so the app can boot before Odoo is ready."""
    return get_odoo_client()


# Define the permitted transitions in one place.
ALLOWED_TRANSITIONS = {
    FulfillmentStatus.RECEIVED: {
        FulfillmentStatus.PICKING,
        FulfillmentStatus.CANCELLED,
    },
    FulfillmentStatus.PENDING: {
        FulfillmentStatus.PICKING,
        FulfillmentStatus.CANCELLED,
    },
    FulfillmentStatus.PICKING: {
        FulfillmentStatus.PACKED,
        FulfillmentStatus.CANCELLED,
    },
    FulfillmentStatus.PACKED: {
        FulfillmentStatus.DISPATCHED,
        FulfillmentStatus.CANCELLED,
    },
    FulfillmentStatus.DISPATCHED: {
        FulfillmentStatus.DELIVERED,
    },
    FulfillmentStatus.DELIVERED: set(),
    FulfillmentStatus.CANCELLED: set(),
}

FORWARD_TRANSITION = {
    FulfillmentStatus.RECEIVED: FulfillmentStatus.PICKING,
    FulfillmentStatus.PENDING: FulfillmentStatus.PICKING,
    FulfillmentStatus.PICKING: FulfillmentStatus.PACKED,
    FulfillmentStatus.PACKED: FulfillmentStatus.DISPATCHED,
    FulfillmentStatus.DISPATCHED: FulfillmentStatus.DELIVERED,
}


# Translate the action received from the API into an enum.
ACTION_STATUS = {
    "received": FulfillmentStatus.RECEIVED,
    "picking": FulfillmentStatus.PICKING,
    "packed": FulfillmentStatus.PACKED,
    "dispatched": FulfillmentStatus.DISPATCHED,
    "delivered": FulfillmentStatus.DELIVERED,
    "cancelled": FulfillmentStatus.CANCELLED,
}


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _m2o_id(value):
    if isinstance(value, (list, tuple)) and value:
        return value[0]
    if isinstance(value, int):
        return value
    return None


def _m2o_name(value):
    if isinstance(value, (list, tuple)) and len(value) > 1:
        return value[1]
    if isinstance(value, str):
        return value
    return None


def _age_hours(date_order: str | None) -> float | None:
    if not date_order:
        return None
    try:
        parsed = datetime.strptime(date_order, "%Y-%m-%d %H:%M:%S")
    except (TypeError, ValueError):
        return None
    return round((clock.utcnow_naive() - parsed).total_seconds() / 3600, 1)


def _merchant_from_lines(lines: list[dict]) -> str:
    for line in lines:
        name = line.get("name") or ""
        match = re.search(r"\[([A-Za-z]+)-", name)
        if match:
            code = match.group(1).upper()
            if code in MERCHANT_BY_CODE:
                return MERCHANT_BY_CODE[code]
    return "Unassigned"


def _fetch_lines_by_order(order_ids: list[int]) -> dict[int, list[dict]]:
    if not order_ids:
        return {}
    lines = odoo().search_read(
        "sale.order.line",
        domain=[("order_id", "in", order_ids)],
        fields=LINE_FIELDS,
    )
    grouped: dict[int, list[dict]] = {}
    for line in lines:
        order_id = _m2o_id(line.get("order_id"))
        if order_id is None:
            continue
        grouped.setdefault(order_id, []).append(line)
    return grouped


def _fetch_partner(partner_id: int | None) -> dict:
    if not partner_id:
        return {}
    records = odoo().read("res.partner", [partner_id], PARTNER_FIELDS)
    if not records:
        return {}
    partner = records[0]
    return {
        "id": partner.get("id"),
        "name": partner.get("name"),
        "email": partner.get("email") or "",
        "phone": partner.get("phone") or "",
        "street": partner.get("street") or "",
        "street2": partner.get("street2") or "",
        "city": partner.get("city") or "",
        "zip": partner.get("zip") or "",
        "state": _m2o_name(partner.get("state_id")) or "",
        "country": _m2o_name(partner.get("country_id")) or "",
    }


def _serialize_event(event: FulfillmentEvent) -> dict:
    return {
        "id": event.id,
        "from_status": event.from_status,
        "to_status": event.to_status,
        "note": event.note,
        "actor": event.actor,
        "created_at": event.created_at.isoformat() if event.created_at else None,
    }


def _summary(order: dict, fulfillment: FulfillmentOrder) -> dict:
    return {
        "id": order["id"],
        "name": order["name"],
        "ref": order.get("client_order_ref") or "",
        "partner_id": _m2o_id(order.get("partner_id")),
        "partner_name": _m2o_name(order.get("partner_id")) or "—",
        "amount_total": order.get("amount_total") or 0,
        "state": order.get("state"),
        "date_order": order.get("date_order"),
        "age_hours": _age_hours(order.get("date_order")),
        "fulfillment_status": fulfillment.status.value,
        "merchant": fulfillment.merchant or "Unassigned",
        "carrier": fulfillment.carrier,
        "tracking_number": fulfillment.tracking_number,
        "created_at": fulfillment.created_at.isoformat()
        if fulfillment.created_at
        else None,
    }


def _get_fulfillment(db, order_id: int) -> FulfillmentOrder | None:
    query = select(FulfillmentOrder).where(
        FulfillmentOrder.odoo_order_id == order_id
    )
    return db.execute(query).scalars().first()


def _create_fulfillment(
    db, order: dict, lines: list[dict], actor: str
) -> FulfillmentOrder:
    fulfillment = FulfillmentOrder(
        odoo_order_id=order["id"],
        status=FulfillmentStatus.RECEIVED,
        merchant=_merchant_from_lines(lines),
    )
    db.add(fulfillment)
    db.flush()
    db.add(
        FulfillmentEvent(
            fulfillment_order_id=fulfillment.id,
            from_status=None,
            to_status=FulfillmentStatus.RECEIVED.value,
            actor=actor,
            note="Imported from Odoo",
        )
    )
    db.commit()
    db.refresh(fulfillment)
    return fulfillment


def _writeback(fulfillment: FulfillmentOrder, status: FulfillmentStatus, actor: str) -> dict:
    """Push the new status back to Odoo's chatter. Never raises."""
    if status not in {FulfillmentStatus.DISPATCHED, FulfillmentStatus.DELIVERED}:
        return {"attempted": False, "ok": False}

    body = f"[3PL] Fulfillment status: {status.value}."
    if fulfillment.carrier:
        body += f" Carrier: {fulfillment.carrier}."
    if fulfillment.tracking_number:
        body += f" Tracking: {fulfillment.tracking_number}."
    body += f" (by {actor})"

    try:
        odoo().message_post("sale.order", [fulfillment.odoo_order_id], body)
        return {"attempted": True, "ok": True}
    except Exception as exc:  # pragma: no cover - demo resilience
        return {"attempted": True, "ok": False, "error": str(exc)}


# --------------------------------------------------------------------------- #
# Sync / ingest
# --------------------------------------------------------------------------- #


def sync_orders(db) -> dict:
    """Import every Odoo sale order into the local fulfillment table."""
    global _last_sync

    orders = odoo().search_read(
        "sale.order", fields=ORDER_FIELDS, order="date_order desc, id desc"
    )
    fulfillments = db.execute(select(FulfillmentOrder)).scalars().all()
    by_order_id = {f.odoo_order_id: f for f in fulfillments}

    missing = [o for o in orders if o["id"] not in by_order_id]
    needs_merchant = [
        o for o in orders
        if o["id"] in by_order_id
        and not by_order_id[o["id"]].merchant
    ]

    lines_by_order = _fetch_lines_by_order(
        [o["id"] for o in missing + needs_merchant]
    )

    created = 0
    backfilled = 0

    for order in missing:
        lines = lines_by_order.get(order["id"], [])
        fulfillment = FulfillmentOrder(
            odoo_order_id=order["id"],
            status=FulfillmentStatus.RECEIVED,
            merchant=_merchant_from_lines(lines),
        )
        db.add(fulfillment)
        db.flush()
        db.add(
            FulfillmentEvent(
                fulfillment_order_id=fulfillment.id,
                from_status=None,
                to_status=FulfillmentStatus.RECEIVED.value,
                actor="sync",
                note="Imported from Odoo",
            )
        )
        created += 1

    for order in needs_merchant:
        fulfillment = by_order_id[order["id"]]
        fulfillment.merchant = _merchant_from_lines(
            lines_by_order.get(order["id"], [])
        )
        backfilled += 1

    # Orders created before the timeline existed need a synthetic first event.
    event_counts = dict(
        db.execute(
            select(FulfillmentEvent.fulfillment_order_id, func.count())
            .group_by(FulfillmentEvent.fulfillment_order_id)
        ).all()
    )
    events_backfilled = 0
    for fulfillment in by_order_id.values():
        if event_counts.get(fulfillment.id, 0) == 0:
            db.add(
                FulfillmentEvent(
                    fulfillment_order_id=fulfillment.id,
                    from_status=None,
                    to_status=fulfillment.status.value,
                    actor="sync",
                    note="Imported from Odoo",
                    created_at=fulfillment.created_at,
                )
            )
            events_backfilled += 1

    db.commit()
    _last_sync = datetime.utcnow()

    return {
        "scanned": len(orders),
        "created": created,
        "updated": backfilled,
        "events_backfilled": events_backfilled,
        "skipped": len(orders) - created,
        "last_synced_at": _last_sync.isoformat(),
    }


def ingest_order(db, order_id: int, actor: str = "odoo-webhook") -> dict | None:
    """Create a fulfillment row for a single Odoo order (webhook path)."""
    orders = odoo().search_read(
        "sale.order",
        domain=[("id", "=", int(order_id))],
        fields=ORDER_FIELDS,
        limit=1,
    )
    if not orders:
        return None

    order = orders[0]
    fulfillment = _get_fulfillment(db, order_id)
    created = False
    if fulfillment is None:
        lines = _fetch_lines_by_order([order_id]).get(order_id, [])
        fulfillment = _create_fulfillment(db, order, lines, actor=actor)
        created = True

    return {
        "order_id": order_id,
        "created": created,
        "fulfillment_status": fulfillment.status.value,
    }


# --------------------------------------------------------------------------- #
# Read
# --------------------------------------------------------------------------- #


def orders_list(
    db,
    status: str | None = None,
    q: str | None = None,
    merchant: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    odoo_orders = odoo().search_read(
        "sale.order", fields=ORDER_FIELDS, order="date_order desc, id desc"
    )
    fulfillments = db.execute(select(FulfillmentOrder)).scalars().all()
    by_order_id = {f.odoo_order_id: f for f in fulfillments}

    items = [
        _summary(order, by_order_id[order["id"]])
        for order in odoo_orders
        if order["id"] in by_order_id
    ]

    counts = {status_value.value: 0 for status_value in STATUS_VALUES}
    for item in items:
        counts[item["fulfillment_status"]] = (
            counts.get(item["fulfillment_status"], 0) + 1
        )

    filtered = items
    if status:
        filtered = [
            item for item in filtered
            if item["fulfillment_status"] == status
        ]
    if merchant:
        filtered = [
            item for item in filtered if item["merchant"] == merchant
        ]
    if q:
        needle = q.strip().lower()
        filtered = [
            item for item in filtered
            if needle in (item["name"] or "").lower()
            or needle in (item["partner_name"] or "").lower()
            or needle in (item["ref"] or "").lower()
        ]

    total = len(filtered)
    page = filtered[max(offset, 0): max(offset, 0) + max(limit, 0)]

    last_synced = _last_sync
    if last_synced is None:
        newest = max(
            (f.created_at for f in fulfillments if f.created_at),
            default=None,
        )
        last_synced = newest

    return {
        "items": page,
        "total": total,
        "counts": counts,
        "merchants": sorted({item["merchant"] for item in items}),
        "last_synced_at": last_synced.isoformat() if last_synced else None,
    }


def single_order(db, id: str) -> dict | None:
    order_id = int(id)
    orders = odoo().search_read(
        "sale.order",
        domain=[("id", "=", order_id)],
        fields=ORDER_FIELDS,
        limit=1,
    )
    if not orders:
        return None

    order = orders[0]
    fulfillment = _get_fulfillment(db, order_id)
    if fulfillment is None:
        lines = _fetch_lines_by_order([order_id]).get(order_id, [])
        fulfillment = _create_fulfillment(db, order, lines, actor="view")

    lines = _fetch_lines_by_order([order_id]).get(order_id, [])
    shipping = _fetch_partner(
        _m2o_id(order.get("partner_shipping_id"))
        or _m2o_id(order.get("partner_id"))
    )

    data = _summary(order, fulfillment)
    data.update(
        {
            "shipping": shipping,
            "lines": [
                {
                    "id": line["id"],
                    "product": _m2o_name(line.get("product_id")) or line.get("name"),
                    "name": line.get("name"),
                    "quantity": line.get("product_uom_qty"),
                    "unit_price": line.get("price_unit"),
                    "subtotal": line.get("price_subtotal"),
                }
                for line in lines
            ],
            "events": [_serialize_event(event) for event in fulfillment.events],
        }
    )
    return data


# --------------------------------------------------------------------------- #
# Write
# --------------------------------------------------------------------------- #


def update_order_status(
    db,
    id: str,
    action: str,
    carrier: str | None = None,
    tracking_number: str | None = None,
    actor: str = "operator",
):
    # 1. Validate the requested action.
    target_status = ACTION_STATUS.get(action)
    if target_status is None:
        raise HTTPException(status_code=400, detail=f"Invalid action: {action}")

    # 2. Find the local fulfillment record.
    fulfillment = _get_fulfillment(db, int(id))
    if fulfillment is None:
        raise HTTPException(status_code=404, detail="Order doesn't exist")

    # 3. Check for a duplicate transition.
    current_status = fulfillment.status
    if current_status == target_status:
        raise HTTPException(
            status_code=409,
            detail=f"Order status is already {current_status.value}",
        )

    # 4. Enforce the transition guardrail.
    if target_status not in ALLOWED_TRANSITIONS.get(current_status, set()):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot transition from {current_status.value} "
                f"to {target_status.value}"
            ),
        )

    # 5. Apply dispatch details before persisting.
    note = None
    if target_status == FulfillmentStatus.DISPATCHED:
        fulfillment.carrier = carrier or fulfillment.carrier
        fulfillment.tracking_number = tracking_number or fulfillment.tracking_number
        parts = []
        if fulfillment.carrier:
            parts.append(fulfillment.carrier)
        if fulfillment.tracking_number:
            parts.append(fulfillment.tracking_number)
        if parts:
            note = "Dispatched · " + " · ".join(parts)

    # 6. Persist the transition and record it in the timeline.
    fulfillment.status = target_status
    db.add(
        FulfillmentEvent(
            fulfillment_order_id=fulfillment.id,
            from_status=current_status.value,
            to_status=target_status.value,
            actor=actor,
            note=note,
        )
    )
    try:
        db.commit()
        db.refresh(fulfillment)
    except Exception:
        db.rollback()
        raise

    writeback = _writeback(fulfillment, target_status, actor)

    return {
        "message": "Status update successful",
        "fulfillment_status": target_status.value,
        "carrier": fulfillment.carrier,
        "tracking_number": fulfillment.tracking_number,
        "odoo_writeback": writeback,
    }


def bulk_advance(db, ids: list[int], actor: str = "operator") -> dict:
    results = []
    for order_id in ids:
        fulfillment = _get_fulfillment(db, int(order_id))
        if fulfillment is None:
            results.append({"id": order_id, "ok": False, "error": "not found"})
            continue

        next_status = FORWARD_TRANSITION.get(fulfillment.status)
        if next_status is None:
            results.append(
                {
                    "id": order_id,
                    "ok": False,
                    "error": f"already {fulfillment.status.value}",
                }
            )
            continue

        previous = fulfillment.status
        fulfillment.status = next_status
        db.add(
            FulfillmentEvent(
                fulfillment_order_id=fulfillment.id,
                from_status=previous.value,
                to_status=next_status.value,
                actor=actor,
                note="Bulk advance",
            )
        )
        db.commit()
        db.refresh(fulfillment)
        _writeback(fulfillment, next_status, actor)
        results.append(
            {
                "id": order_id,
                "ok": True,
                "fulfillment_status": next_status.value,
            }
        )

    return {
        "advanced": sum(1 for result in results if result["ok"]),
        "results": results,
    }

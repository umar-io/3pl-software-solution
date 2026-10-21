"""Inventory accuracy & reconciliation, computed from Odoo stock data.

A *variance* is an Odoo stock.quant with a pending physical count that differs
from the system on-hand quantity (inventory_quantity vs quantity). Workflow
state (open / investigated / resolved) and daily health snapshots are kept in
Postgres because Odoo has nowhere to put them.
"""

import math
import threading
import time
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from html import escape

from app.models.inventory import (
    REVIEW_STATUSES,
    InventorySnapshot,
    VarianceAdjustment,
    VarianceReview,
)
from app.services import clock
from app.services.odoo import get_odoo_client
from app.services.order_service import MERCHANT_BY_CODE

CACHE_TTL_SECONDS = 30
WINDOW_DAYS = 30
TREND_DAYS = 14
EPSILON = 1e-6

# Health score = 60% line accuracy + 40% unit accuracy. A variance counts against
# line accuracy in proportion to its severity, so a 2-unit slip is not treated
# like a missing pallet.
LINE_WEIGHT = 0.6
UNIT_WEIGHT = 0.4
SEVERITY_WEIGHT = {"critical": 1.0, "moderate": 0.5, "minor": 0.25}
GOOD_THRESHOLD = 90.0
ATTENTION_THRESHOLD = 75.0

# Severity. Shortages hurt more than overages (missed shipments), and small
# absolute differences on tiny bins are never critical.
SHORT_CRITICAL_PCT, SHORT_CRITICAL_MIN_UNITS, SHORT_CRITICAL_UNITS = 0.25, 10, 50
SHORT_MODERATE_PCT, SHORT_MODERATE_MIN_UNITS = 0.08, 3
OVER_CRITICAL_UNITS = 100
OVER_MODERATE_PCT, OVER_MODERATE_MIN_UNITS = 0.15, 5

SEVERITY_RANK = {"critical": 0, "moderate": 1, "minor": 2}
UNASSIGNED_CLIENT = "House stock"

QUANT_FIELDS = [
    "id",
    "product_id",
    "location_id",
    "quantity",
    "reserved_quantity",
    "inventory_quantity",
    "inventory_quantity_set",
    "last_count_date",
    "write_date",
    "owner_id",
]


class InvalidStatus(ValueError):
    pass


class AdjustmentError(Exception):
    """A write-back failure with the HTTP status the API should answer with."""

    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


# --------------------------------------------------------------------------- #
# Time helpers
# --------------------------------------------------------------------------- #


def _now() -> datetime:
    """"Now" for ages and windows; frozen to the snapshot in demo mode."""
    return clock.now()


def _parse_odoo_dt(value) -> datetime | None:
    """Odoo returns naive UTC strings ('2026-10-07 14:08:20') or False."""
    if not value:
        return None
    try:
        return datetime.strptime(value[:19], "%Y-%m-%d %H:%M:%S").replace(
            tzinfo=timezone.utc
        )
    except ValueError:
        return None


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _odoo_dt(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


# --------------------------------------------------------------------------- #
# Odoo snapshot (cached)
# --------------------------------------------------------------------------- #

_cache_lock = threading.Lock()
_cache: dict = {"stock": None, "receiving": None}


def _fresh(entry: dict | None) -> bool:
    return bool(entry) and time.monotonic() - entry["mono"] < CACHE_TTL_SECONDS


def invalidate_cache() -> None:
    with _cache_lock:
        _cache["stock"] = None
        _cache["receiving"] = None


def _client_for(owner, code: str | None) -> str:
    if owner:
        return owner[1]
    prefix = (code or "").split("-")[0].upper()
    return MERCHANT_BY_CODE.get(prefix, UNASSIGNED_CLIENT)


def _fetch_stock() -> dict:
    odoo = get_odoo_client()
    quants = odoo.search_read(
        "stock.quant",
        domain=[("location_id.usage", "=", "internal")],
        fields=QUANT_FIELDS,
    )
    product_ids = sorted({q["product_id"][0] for q in quants})
    products = (
        {
            p["id"]: p
            for p in odoo.search_read(
                "product.product",
                domain=[("id", "in", product_ids)],
                fields=["default_code", "name"],
            )
        }
        if product_ids
        else {}
    )

    lines = []
    for q in quants:
        product = products.get(q["product_id"][0], {})
        code = product.get("default_code") or None
        counted = bool(q["inventory_quantity_set"])
        expected = float(q["quantity"])
        actual = float(q["inventory_quantity"]) if counted else None
        lines.append(
            {
                "quant_id": q["id"],
                "product_id": q["product_id"][0],
                "sku": code or f"#{q['product_id'][0]}",
                "product": product.get("name") or q["product_id"][1],
                "client": _client_for(q["owner_id"], code),
                "location": q["location_id"][1],
                "expected": expected,
                "actual": actual,
                "reserved": float(q["reserved_quantity"]),
                "counted": counted,
                "last_count_date": _parse_odoo_dt(q["last_count_date"]),
                "write_date": _parse_odoo_dt(q["write_date"]),
            }
        )
    # fetched_at is real time: it drives the "last synced X ago" label.
    return {"lines": lines, "fetched_at": datetime.now(timezone.utc), "mono": time.monotonic()}


def _stock() -> dict:
    with _cache_lock:
        if not _fresh(_cache["stock"]):
            _cache["stock"] = _fetch_stock()
        return _cache["stock"]


# --------------------------------------------------------------------------- #
# Variances
# --------------------------------------------------------------------------- #


def _severity(expected: float, actual: float, reserved: float) -> str:
    diff = abs(actual - expected)
    pct = diff / expected if expected > 0 else 1.0
    if actual < expected:
        # Counting below what is already promised to orders means missed shipments.
        if actual < reserved - EPSILON or diff >= SHORT_CRITICAL_UNITS:
            return "critical"
        if pct >= SHORT_CRITICAL_PCT and diff >= SHORT_CRITICAL_MIN_UNITS:
            return "critical"
        if pct >= SHORT_MODERATE_PCT and diff >= SHORT_MODERATE_MIN_UNITS:
            return "moderate"
        return "minor"
    if diff >= OVER_CRITICAL_UNITS:
        return "critical"
    if pct >= OVER_MODERATE_PCT and diff >= OVER_MODERATE_MIN_UNITS:
        return "moderate"
    return "minor"


def _raw_variances(lines: list[dict]) -> list[dict]:
    out = []
    for line in lines:
        if not line["counted"]:
            continue
        diff = line["actual"] - line["expected"]
        if abs(diff) < EPSILON:
            continue
        pct = diff / line["expected"] if line["expected"] > 0 else None
        out.append(
            {
                **line,
                "difference": diff,
                "diff_pct": pct,
                "severity": _severity(line["expected"], line["actual"], line["reserved"]),
                "below_reserved": line["actual"] < line["reserved"] - EPSILON,
            }
        )
    return out


def _sync_reviews(db, raw: list[dict]) -> dict[int, VarianceReview]:
    """Make the review table mirror what Odoo currently reports."""
    reviews = {r.quant_id: r for r in db.scalars(select(VarianceReview))}
    active = {v["quant_id"]: v for v in raw}
    now = _now()
    changed = False

    missing = [v for qid, v in active.items() if qid not in reviews]
    if missing:
        db.execute(
            pg_insert(VarianceReview)
            .values(
                [
                    {
                        "quant_id": v["quant_id"],
                        "status": "open",
                        "first_seen_at": v["write_date"] or now,
                    }
                    for v in missing
                ]
            )
            .on_conflict_do_nothing(index_elements=["quant_id"])
        )
        changed = True

    for qid, review in reviews.items():
        if qid in active:
            # A fresh count on a quant we auto-closed earlier is a new issue.
            if review.status == "resolved" and review.actor == "odoo":
                review.status = "open"
                review.note = None
                review.actor = None
                review.first_seen_at = active[qid]["write_date"] or now
                changed = True
        elif review.status != "resolved":
            review.status = "resolved"
            review.actor = "odoo"
            review.note = "Count cleared or adjusted in Odoo"
            changed = True

    if changed:
        db.commit()
        reviews = {r.quant_id: r for r in db.scalars(select(VarianceReview))}
    return reviews


def _build_variances(db, scope_client: str | None = None) -> tuple[list[dict], list[dict], datetime]:
    """Variances plus the stock lines they were computed from.

    Review state is always synced against *all* of Odoo; `scope_client` only
    narrows what is returned, so a scoped caller can never close out or hide
    another client's variances.
    """
    stock = _stock()
    raw = _raw_variances(stock["lines"])
    reviews = _sync_reviews(db, raw)
    now = _now()
    variances = []
    for v in raw:
        review = reviews[v["quant_id"]]
        first_seen = review.first_seen_at
        variances.append(
            {
                "id": v["quant_id"],
                "product_id": v["product_id"],
                "sku": v["sku"],
                "product": v["product"],
                "client": v["client"],
                "location": v["location"],
                "expected": v["expected"],
                "actual": v["actual"],
                "difference": v["difference"],
                "diff_pct": v["diff_pct"],
                "reserved": v["reserved"],
                "below_reserved": v["below_reserved"],
                "severity": v["severity"],
                "status": review.status,
                "note": review.note,
                "actor": review.actor,
                "first_seen_at": _iso(first_seen),
                "age_hours": round((now - first_seen).total_seconds() / 3600, 1),
                "updated_at": _iso(review.updated_at),
            }
        )
    lines = stock["lines"]
    if scope_client is not None:
        variances = [v for v in variances if v["client"] == scope_client]
        lines = [l for l in lines if l["client"] == scope_client]
    return variances, lines, stock["fetched_at"]


def _is_active(v: dict) -> bool:
    return v["status"] != "resolved"


def _sort_key(v: dict):
    return (SEVERITY_RANK[v["severity"]], -abs(v["difference"]))


# --------------------------------------------------------------------------- #
# Health score
# --------------------------------------------------------------------------- #


def _status_for(score: float) -> str:
    if score >= GOOD_THRESHOLD:
        return "good"
    if score >= ATTENTION_THRESHOLD:
        return "attention"
    return "critical"


def _accuracy(lines: list[dict], variances: list[dict]) -> dict:
    total = len(lines)
    active = [v for v in variances if _is_active(v)]
    expected_units = sum(l["expected"] for l in lines)
    abs_diff = sum(abs(v["difference"]) for v in active)
    weighted_errors = sum(SEVERITY_WEIGHT[v["severity"]] for v in active)
    line_acc = max(0.0, 1 - weighted_errors / total) if total else 1.0
    unit_acc = max(0.0, 1 - abs_diff / expected_units) if expected_units > 0 else 1.0
    return {
        "lines": total,
        "variances": len(active),
        "critical": sum(1 for v in active if v["severity"] == "critical"),
        "line_accuracy": line_acc,
        "unit_accuracy": unit_acc,
        "expected_units": expected_units,
        "abs_diff_units": abs_diff,
    }


def _score(acc: dict) -> float:
    base = 100 * (LINE_WEIGHT * acc["line_accuracy"] + UNIT_WEIGHT * acc["unit_accuracy"])
    return round(max(0.0, min(100.0, base)), 1)


def _group_row(name: str, group_lines: list[dict], group_vars: list[dict]) -> dict:
    acc = _accuracy(group_lines, group_vars)
    return {
        "name": name,
        "accuracy_pct": _score(acc),
        "unit_accuracy_pct": round(acc["unit_accuracy"] * 100, 1),
        "lines": acc["lines"],
        "variances": acc["variances"],
        "critical": acc["critical"],
        "abs_diff_units": acc["abs_diff_units"],
    }


def _record_snapshot(db, score: float, acc: dict) -> None:
    values = {
        "snapshot_date": _now().date(),
        "health_score": score,
        "accuracy_pct": round(acc["line_accuracy"] * 100, 1),
        "open_variances": acc["variances"],
        "critical_variances": acc["critical"],
    }
    db.execute(
        pg_insert(InventorySnapshot)
        .values(**values)
        .on_conflict_do_update(
            index_elements=["snapshot_date"],
            set_={k: v for k, v in values.items() if k != "snapshot_date"},
        )
    )
    db.commit()


def _trend(db) -> list[dict]:
    since = _now().date() - timedelta(days=TREND_DAYS - 1)
    rows = db.scalars(
        select(InventorySnapshot)
        .where(InventorySnapshot.snapshot_date >= since)
        .order_by(InventorySnapshot.snapshot_date)
    ).all()
    return [
        {
            "date": r.snapshot_date.isoformat(),
            "score": r.health_score,
            "open_variances": r.open_variances,
        }
        for r in rows
    ]


def get_health(db, scope_client: str | None = None) -> dict:
    variances, lines, fetched_at = _build_variances(db, scope_client)
    acc = _accuracy(lines, variances)
    score = _score(acc)
    # Snapshots are the company-wide history; a scoped view must not overwrite them.
    if scope_client is None:
        _record_snapshot(db, score, acc)

    active = sorted((v for v in variances if _is_active(v)), key=_sort_key)
    week_ago = _now() - timedelta(days=7)
    this_week = sum(
        1 for v in active if datetime.fromisoformat(v["first_seen_at"]) >= week_ago
    )
    trend = _trend(db) if scope_client is None else []
    delta = None
    if len(trend) >= 2:
        delta = round(trend[-1]["score"] - trend[0]["score"], 1)

    return {
        "score": score,
        "status": _status_for(score),
        "accuracy_pct": round(acc["line_accuracy"] * 100, 1),
        "unit_accuracy_pct": round(acc["unit_accuracy"] * 100, 1),
        "trend_delta": delta,
        "summary": {
            "open_variances": len(active),
            "critical_variances": acc["critical"],
            "variances_this_week": this_week,
            "lines_tracked": acc["lines"],
            "investigated": sum(1 for v in active if v["status"] == "investigated"),
        },
        "trend": trend,
        "top_mismatches": active[:6],
        "last_synced_at": _iso(fetched_at),
        "methodology": {
            "line_weight": LINE_WEIGHT,
            "unit_weight": UNIT_WEIGHT,
            "severity_weights": SEVERITY_WEIGHT,
            "good_threshold": GOOD_THRESHOLD,
            "attention_threshold": ATTENTION_THRESHOLD,
        },
    }


# --------------------------------------------------------------------------- #
# Variance queue
# --------------------------------------------------------------------------- #


def list_variances(
    db,
    *,
    client: str | None = None,
    location: str | None = None,
    severity: str | None = None,
    status: str = "active",
    since_days: int | None = None,
    q: str | None = None,
    sort: str = "severity",
    limit: int = 50,
    offset: int = 0,
    scope_client: str | None = None,
) -> dict:
    variances, _lines, fetched_at = _build_variances(db, scope_client)
    cutoff = _now() - timedelta(days=since_days) if since_days else None
    needle = q.strip().lower() if q else None

    def matches(v: dict, skip: str | None = None) -> bool:
        if skip != "client" and client and v["client"] != client:
            return False
        if skip != "location" and location and v["location"] != location:
            return False
        if skip != "severity" and severity and v["severity"] != severity:
            return False
        if skip != "status":
            if status == "active" and not _is_active(v):
                return False
            if status in REVIEW_STATUSES and v["status"] != status:
                return False
        if cutoff and datetime.fromisoformat(v["first_seen_at"]) < cutoff:
            return False
        if needle and needle not in f"{v['sku']} {v['product']}".lower():
            return False
        return True

    rows = [v for v in variances if matches(v)]
    sorters = {
        "severity": _sort_key,
        "difference": lambda v: -abs(v["difference"]),
        "age": lambda v: -v["age_hours"],
        "sku": lambda v: v["sku"],
    }
    rows.sort(key=sorters.get(sort, _sort_key))

    sev_scope = [v for v in variances if matches(v, skip="severity")]
    status_scope = [v for v in variances if matches(v, skip="status")]
    return {
        "items": rows[offset : offset + limit],
        "total": len(rows),
        "severity_counts": {
            s: sum(1 for v in sev_scope if v["severity"] == s) for s in SEVERITY_RANK
        },
        "status_counts": {
            "active": sum(1 for v in status_scope if _is_active(v)),
            **{s: sum(1 for v in status_scope if v["status"] == s) for s in REVIEW_STATUSES},
        },
        "clients": sorted({v["client"] for v in variances}),
        "locations": sorted({v["location"] for v in variances}),
        "last_synced_at": _iso(fetched_at),
    }


def update_review(db, quant_id: int, status: str, note: str | None, actor: str) -> dict | None:
    if status not in REVIEW_STATUSES:
        raise InvalidStatus(f"Status must be one of {', '.join(REVIEW_STATUSES)}")
    variances, _lines, _ = _build_variances(db)
    target = next((v for v in variances if v["id"] == quant_id), None)
    if target is None:
        return None
    review = db.scalar(select(VarianceReview).where(VarianceReview.quant_id == quant_id))
    review.status = status
    review.actor = actor
    if note is not None:
        review.note = note.strip()[:500] or None
    db.commit()
    db.refresh(review)
    return {
        **target,
        "status": review.status,
        "note": review.note,
        "actor": review.actor,
        "updated_at": _iso(review.updated_at),
    }


# --------------------------------------------------------------------------- #
# Accuracy breakdown
# --------------------------------------------------------------------------- #


def get_breakdown(db, group_by: str, scope_client: str | None = None) -> dict:
    variances, lines, fetched_at = _build_variances(db, scope_client)
    key = "client" if group_by == "client" else "location"
    groups: dict[str, list[dict]] = {}
    for line in lines:
        groups.setdefault(line[key], []).append(line)

    rows = [
        _group_row(name, group_lines, [v for v in variances if v[key] == name])
        for name, group_lines in groups.items()
    ]
    rows.sort(key=lambda r: (r["accuracy_pct"], -r["variances"], r["name"]))
    return {
        "group_by": key,
        "rows": rows,
        "overall_accuracy_pct": _score(_accuracy(lines, variances)),
        "last_synced_at": _iso(fetched_at),
    }


# --------------------------------------------------------------------------- #
# Receiving & cycle count
# --------------------------------------------------------------------------- #


def _fetch_receiving(lines: list[dict]) -> dict:
    odoo = get_odoo_client()
    since = _now() - timedelta(days=WINDOW_DAYS)
    since_str = _odoo_dt(since)

    pickings = odoo.search_read(
        "stock.picking",
        domain=[
            ("picking_type_code", "=", "incoming"),
            ("state", "!=", "cancel"),
            ("create_date", ">=", since_str),
        ],
        fields=["name", "state", "partner_id", "origin", "scheduled_date", "date_done"],
        order="scheduled_date desc, id desc",
    )
    moves_by_picking: dict[int, list[dict]] = {}
    if pickings:
        for m in odoo.search_read(
            "stock.move",
            domain=[("picking_id", "in", [p["id"] for p in pickings])],
            fields=["picking_id", "product_uom_qty", "quantity", "state"],
        ):
            moves_by_picking.setdefault(m["picking_id"][0], []).append(m)

    receipts = []
    for p in pickings:
        moves = moves_by_picking.get(p["id"], [])
        ordered = sum(m["product_uom_qty"] for m in moves)
        received = sum(m["quantity"] for m in moves) if p["state"] == "done" else 0.0
        done = p["state"] == "done"
        blind = (not p["origin"] and not p["partner_id"]) or any(
            m["product_uom_qty"] < EPSILON and m["quantity"] > EPSILON for m in moves
        )
        mismatch = done and abs(received - ordered) > EPSILON
        receipts.append(
            {
                "id": p["id"],
                "name": p["name"],
                "state": p["state"],
                "partner": p["partner_id"][1] if p["partner_id"] else None,
                "origin": p["origin"] or None,
                "scheduled_date": _iso(_parse_odoo_dt(p["scheduled_date"])),
                "date_done": _iso(_parse_odoo_dt(p["date_done"])),
                "ordered_qty": ordered,
                "received_qty": received if done else None,
                "confirmed": done and not mismatch,
                "blind": blind,
                "mismatch": mismatch,
            }
        )

    completed = sum(1 for r in receipts if r["state"] == "done")
    confirmed = sum(1 for r in receipts if r["confirmed"])

    # Velocity = units ordered in the window; fall back to outbound stock moves
    # for products that are not sold through sales orders.
    velocity: dict[int, float] = {}
    for sol in odoo.search_read(
        "sale.order.line",
        domain=[
            ("order_id.state", "in", ["sale", "done"]),
            ("order_id.date_order", ">=", since_str),
            ("product_id", "!=", False),
        ],
        fields=["product_id", "product_uom_qty"],
    ):
        pid = sol["product_id"][0]
        velocity[pid] = velocity.get(pid, 0.0) + sol["product_uom_qty"]
    moved: dict[int, float] = {}
    for m in odoo.search_read(
        "stock.move",
        domain=[
            ("picking_code", "=", "outgoing"),
            ("state", "not in", ["draft", "cancel"]),
            ("date", ">=", since_str),
        ],
        fields=["product_id", "product_uom_qty"],
    ):
        pid = m["product_id"][0]
        moved[pid] = moved.get(pid, 0.0) + m["product_uom_qty"]
    for pid, qty in moved.items():
        velocity.setdefault(pid, qty)

    by_product: dict[int, list[dict]] = {}
    for line in lines:
        by_product.setdefault(line["product_id"], []).append(line)

    def counted_recently(product_id: int) -> datetime | None:
        latest = None
        for line in by_product.get(product_id, []):
            stamp = line["last_count_date"]
            if line["counted"]:
                stamp = _now()
            if stamp and stamp >= since and (latest is None or stamp > latest):
                latest = stamp
        return latest

    ranked = sorted(
        (pid for pid in velocity if pid in by_product),
        key=lambda pid: -velocity[pid],
    )
    top_n = min(10, max(3, math.ceil(len(ranked) * 0.2))) if ranked else 0
    high_velocity = []
    for pid in ranked[:top_n]:
        sample = by_product[pid][0]
        counted_at = counted_recently(pid)
        high_velocity.append(
            {
                "sku": sample["sku"],
                "product": sample["product"],
                "client": sample["client"],
                "units_30d": velocity[pid],
                "counted": counted_at is not None,
                "last_counted_at": _iso(counted_at),
            }
        )
    hv_counted = sum(1 for h in high_velocity if h["counted"])

    tracked_products = list(by_product)
    products_counted = sum(1 for pid in tracked_products if counted_recently(pid))

    return {
        "window_days": WINDOW_DAYS,
        "receiving": {
            "total": len(receipts),
            "completed": completed,
            "confirmed": confirmed,
            "confirmed_pct": round(100 * confirmed / completed, 1) if completed else None,
            "pending": sum(1 for r in receipts if r["state"] != "done"),
            "mismatches": sum(1 for r in receipts if r["mismatch"]),
            "blind_receipts": sum(1 for r in receipts if r["blind"]),
            "recent": receipts[:8],
        },
        "cycle_count": {
            "high_velocity_total": len(high_velocity),
            "high_velocity_counted": hv_counted,
            "high_velocity_pct": (
                round(100 * hv_counted / len(high_velocity), 1) if high_velocity else None
            ),
            "high_velocity": high_velocity,
            "skus_tracked": len(tracked_products),
            "skus_counted": products_counted,
            "coverage_pct": (
                round(100 * products_counted / len(tracked_products), 1)
                if tracked_products
                else None
            ),
        },
    }


def get_receiving(db) -> dict:
    stock = _stock()
    with _cache_lock:
        if not _fresh(_cache["receiving"]):
            data = _fetch_receiving(stock["lines"])
            _cache["receiving"] = {**data, "mono": time.monotonic()}
        data = {k: v for k, v in _cache["receiving"].items() if k != "mono"}
    return {**data, "last_synced_at": _iso(stock["fetched_at"])}


def sync(db) -> dict:
    invalidate_cache()
    health = get_health(db)
    return {"last_synced_at": health["last_synced_at"], "score": health["score"]}


# --------------------------------------------------------------------------- #
# Write-back: apply a counted quantity to Odoo
# --------------------------------------------------------------------------- #

PERMISSION_HINTS = ("not allowed", "accesserror", "stock manager", "access denied")
INVENTORY_MODE = {"context": {"inventory_mode": True}}


def _verify_applied(odoo, quant_id: int, counted: float) -> bool:
    rows = odoo.read("stock.quant", [quant_id], ["quantity", "inventory_quantity_set"])
    if not rows:  # Odoo vacuums quants that reach zero
        return counted < EPSILON
    return abs(rows[0]["quantity"] - counted) < EPSILON and not rows[0]["inventory_quantity_set"]


def apply_adjustment(
    db,
    quant_id: int,
    expected: float,
    counted: float,
    reason: str,
    actor: str,
) -> dict:
    """Set Odoo's on-hand quantity to the counted one for a single quant.

    Guarded three ways: the caller must send the numbers it saw (so a stale
    screen cannot apply an outdated count), Odoo is read fresh rather than from
    cache, and success is verified by reading the quant back afterwards.
    """
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise AdjustmentError(422, "A reason is required for the audit trail.")

    invalidate_cache()
    variances, _lines, _ = _build_variances(db)
    variance = next((v for v in variances if v["id"] == quant_id), None)
    if variance is None:
        raise AdjustmentError(404, "This variance no longer exists in Odoo. Refresh and check again.")
    if (
        abs(variance["expected"] - expected) > EPSILON
        or abs(variance["actual"] - counted) > EPSILON
    ):
        raise AdjustmentError(
            409,
            f"The numbers changed in Odoo (now {variance['expected']:g} expected, "
            f"{variance['actual']:g} counted). Review the update before applying.",
        )

    odoo = get_odoo_client()
    failure: Exception | None = None
    result = None
    try:
        result = odoo.call("stock.quant", "action_apply_inventory", [[quant_id]], INVENTORY_MODE)
    except Exception as exc:  # may still have applied; verified below
        failure = exc

    # Odoo answers with a wizard action when it needs a human decision.
    if isinstance(result, dict) and result.get("res_model"):
        raise AdjustmentError(
            409, "Odoo needs confirmation for this adjustment. Apply it from Odoo's Physical Inventory screen."
        )

    if not _verify_applied(odoo, quant_id, counted):
        text = str(failure or "").lower()
        if any(hint in text for hint in PERMISSION_HINTS):
            raise AdjustmentError(
                502,
                "Odoo refused: the integration user isn't an Inventory Administrator. "
                "Ask an Odoo admin to grant it, then retry.",
            )
        raise AdjustmentError(502, f"Odoo did not apply the adjustment{': ' + str(failure)[:160] if failure else ''}.")

    posted = False
    try:
        template = odoo.read("product.product", [variance["product_id"]], ["product_tmpl_id"])[0]["product_tmpl_id"][0]
        delta = counted - expected
        body = (
            f"<p><b>Inventory adjusted from Inventory Health</b><br/>"
            f"{escape(variance['location'])}: {expected:g} \u2192 {counted:g} ({delta:+g})<br/>"
            f"By {escape(actor)} &middot; Reason: {escape(reason)}</p>"
        )
        odoo.message_post("product.template", [template], body)
        posted = True
    except Exception:
        pass  # the stock change succeeded; a missing note must not undo or hide it

    db.add(
        VarianceAdjustment(
            quant_id=quant_id,
            sku=variance["sku"],
            client=variance["client"],
            location=variance["location"],
            quantity_before=expected,
            quantity_after=counted,
            reason=reason[:500],
            actor=actor,
            chatter_posted=posted,
        )
    )
    review = db.scalar(select(VarianceReview).where(VarianceReview.quant_id == quant_id))
    if review is not None:
        review.status = "resolved"
        review.actor = actor
        review.note = f"Adjusted in Odoo: {reason}"[:500]
    db.commit()
    invalidate_cache()
    return {
        "quant_id": quant_id,
        "sku": variance["sku"],
        "location": variance["location"],
        "quantity_before": expected,
        "quantity_after": counted,
        "chatter_posted": posted,
    }

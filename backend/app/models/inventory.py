from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.fulfillment import Base

REVIEW_STATUSES = ("open", "investigated", "resolved")


class VarianceReview(Base):
    """Workflow state for a variance. Odoo only knows the count, not who looked at it."""

    __tablename__ = "variance_reviews"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    quant_id: Mapped[int] = mapped_column(nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    actor: Mapped[str | None] = mapped_column(String(80), nullable=True)

    # When we first saw this variance in Odoo; drives the "age" column.
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class InventorySnapshot(Base):
    """One health-score reading per day, for the trend sparkline."""

    __tablename__ = "inventory_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True)
    health_score: Mapped[float] = mapped_column(Float, nullable=False)
    accuracy_pct: Mapped[float] = mapped_column(Float, nullable=False)
    open_variances: Mapped[int] = mapped_column(Integer, nullable=False)
    critical_variances: Mapped[int] = mapped_column(Integer, nullable=False)


class VarianceAdjustment(Base):
    """Immutable audit record of every adjustment pushed to Odoo."""

    __tablename__ = "variance_adjustments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    quant_id: Mapped[int] = mapped_column(nullable=False, index=True)
    sku: Mapped[str] = mapped_column(String(80), nullable=False)
    client: Mapped[str] = mapped_column(String(120), nullable=False)
    location: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity_before: Mapped[float] = mapped_column(Float, nullable=False)
    quantity_after: Mapped[float] = mapped_column(Float, nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    actor: Mapped[str] = mapped_column(String(255), nullable=False)
    chatter_posted: Mapped[bool] = mapped_column(nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

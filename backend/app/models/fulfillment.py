from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class FulfillmentStatus(str, Enum):
    PENDING = "pending"
    RECEIVED = "received"
    PICKING = "picking"
    PACKED = "packed"
    DISPATCHED = "dispatched"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class FulfillmentOrder(Base):
    __tablename__ = "fulfillment_orders"

    # Primary Key (auto-incrementing integer)
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Odoo reference link (stored as integer)
    odoo_order_id: Mapped[int] = mapped_column(nullable=False, index=True)

    # Constrained status field
    status: Mapped[FulfillmentStatus] = mapped_column(
        nullable=False,
        default=FulfillmentStatus.RECEIVED,
    )

    # Denormalised so the list can be filtered without an Odoo round-trip.
    merchant: Mapped[str | None] = mapped_column(String(120), nullable=True)

    # Dispatch details captured when moving to `dispatched`.
    carrier: Mapped[str | None] = mapped_column(String(80), nullable=True)
    tracking_number: Mapped[str | None] = mapped_column(String(120), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    events: Mapped[list["FulfillmentEvent"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="FulfillmentEvent.created_at",
    )

    def __repr__(self) -> str:
        return (
            f"<FulfillmentOrder id={self.id} "
            f"odoo_order_id={self.odoo_order_id} status={self.status.value}>"
        )


class FulfillmentEvent(Base):
    """Audit trail for every status change on an order."""

    __tablename__ = "fulfillment_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    fulfillment_order_id: Mapped[int] = mapped_column(
        ForeignKey("fulfillment_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    from_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_status: Mapped[str] = mapped_column(String(32), nullable=False)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    actor: Mapped[str] = mapped_column(String(80), nullable=False, default="system")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    order: Mapped[FulfillmentOrder] = relationship(back_populates="events")

    def __repr__(self) -> str:
        return (
            f"<FulfillmentEvent order={self.fulfillment_order_id} "
            f"{self.from_status}->{self.to_status}>"
        )

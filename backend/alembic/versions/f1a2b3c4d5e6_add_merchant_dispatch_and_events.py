"""add merchant, dispatch fields and fulfillment events

Revision ID: f1a2b3c4d5e6
Revises: dd3653f2aca3
Create Date: 2026-10-19 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'dd3653f2aca3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'fulfillment_orders',
        sa.Column('merchant', sa.String(length=120), nullable=True),
    )
    op.add_column(
        'fulfillment_orders',
        sa.Column('carrier', sa.String(length=80), nullable=True),
    )
    op.add_column(
        'fulfillment_orders',
        sa.Column('tracking_number', sa.String(length=120), nullable=True),
    )
    op.add_column(
        'fulfillment_orders',
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )
    op.add_column(
        'fulfillment_orders',
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )

    op.create_table(
        'fulfillment_events',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('fulfillment_order_id', sa.Integer(), nullable=False),
        sa.Column('from_status', sa.String(length=32), nullable=True),
        sa.Column('to_status', sa.String(length=32), nullable=False),
        sa.Column('note', sa.String(length=255), nullable=True),
        sa.Column('actor', sa.String(length=80), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ['fulfillment_order_id'],
            ['fulfillment_orders.id'],
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_fulfillment_events_fulfillment_order_id'),
        'fulfillment_events',
        ['fulfillment_order_id'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f('ix_fulfillment_events_fulfillment_order_id'),
        table_name='fulfillment_events',
    )
    op.drop_table('fulfillment_events')
    op.drop_column('fulfillment_orders', 'updated_at')
    op.drop_column('fulfillment_orders', 'created_at')
    op.drop_column('fulfillment_orders', 'tracking_number')
    op.drop_column('fulfillment_orders', 'carrier')
    op.drop_column('fulfillment_orders', 'merchant')

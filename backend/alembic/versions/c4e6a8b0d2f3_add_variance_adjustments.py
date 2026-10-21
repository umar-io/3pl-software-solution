"""add variance adjustment audit table

Revision ID: c4e6a8b0d2f3
Revises: b3d5f7a9c1e2
Create Date: 2026-10-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4e6a8b0d2f3'
down_revision: Union[str, Sequence[str], None] = 'b3d5f7a9c1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'variance_adjustments',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('quant_id', sa.Integer(), nullable=False),
        sa.Column('sku', sa.String(length=80), nullable=False),
        sa.Column('client', sa.String(length=120), nullable=False),
        sa.Column('location', sa.String(length=255), nullable=False),
        sa.Column('quantity_before', sa.Float(), nullable=False),
        sa.Column('quantity_after', sa.Float(), nullable=False),
        sa.Column('reason', sa.String(length=500), nullable=False),
        sa.Column('actor', sa.String(length=255), nullable=False),
        sa.Column('chatter_posted', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_variance_adjustments_quant_id', 'variance_adjustments', ['quant_id'])


def downgrade() -> None:
    op.drop_index('ix_variance_adjustments_quant_id', table_name='variance_adjustments')
    op.drop_table('variance_adjustments')

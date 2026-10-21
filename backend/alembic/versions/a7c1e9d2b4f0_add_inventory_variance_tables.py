"""add variance reviews and inventory snapshots

Revision ID: a7c1e9d2b4f0
Revises: f1a2b3c4d5e6
Create Date: 2026-10-20 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7c1e9d2b4f0'
down_revision: Union[str, Sequence[str], None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'variance_reviews',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('quant_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('note', sa.String(length=500), nullable=True),
        sa.Column('actor', sa.String(length=80), nullable=True),
        sa.Column('first_seen_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_variance_reviews_quant_id', 'variance_reviews', ['quant_id'], unique=True)

    op.create_table(
        'inventory_snapshots',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('snapshot_date', sa.Date(), nullable=False),
        sa.Column('health_score', sa.Float(), nullable=False),
        sa.Column('accuracy_pct', sa.Float(), nullable=False),
        sa.Column('open_variances', sa.Integer(), nullable=False),
        sa.Column('critical_variances', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('snapshot_date'),
    )


def downgrade() -> None:
    op.drop_table('inventory_snapshots')
    op.drop_index('ix_variance_reviews_quant_id', table_name='variance_reviews')
    op.drop_table('variance_reviews')

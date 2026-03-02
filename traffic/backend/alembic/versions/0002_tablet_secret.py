"""add tablet secret

Revision ID: 0002_tablet_secret
Revises: 0001_initial
Create Date: 2026-03-02 15:45:00

"""

from __future__ import annotations

import secrets

from alembic import op
import sqlalchemy as sa


revision = "0002_tablet_secret"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tablets", sa.Column("tablet_secret", sa.String(length=128), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id FROM tablets")).fetchall()
    for row in rows:
        tablet_id = row[0]
        bind.execute(
            sa.text("UPDATE tablets SET tablet_secret = :secret WHERE id = :tablet_id"),
            {"secret": secrets.token_hex(32), "tablet_id": tablet_id},
        )

    op.alter_column("tablets", "tablet_secret", nullable=False)
    op.create_index("ix_tablets_tablet_secret", "tablets", ["tablet_secret"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_tablets_tablet_secret", table_name="tablets")
    op.drop_column("tablets", "tablet_secret")

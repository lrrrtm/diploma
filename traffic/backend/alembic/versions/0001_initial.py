"""initial traffic schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-03-02 01:00:00

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tablets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("reg_pin", sa.String(length=6), nullable=False),
        sa.Column("display_pin", sa.String(length=6), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("building_id", sa.Integer(), nullable=True),
        sa.Column("building_name", sa.String(length=200), nullable=True),
        sa.Column("room_id", sa.Integer(), nullable=True),
        sa.Column("room_name", sa.String(length=100), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tablets_display_pin", "tablets", ["display_pin"], unique=True)
    op.create_index("ix_tablets_reg_pin", "tablets", ["reg_pin"], unique=True)

    op.create_table(
        "teachers",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("full_name", sa.String(length=200), nullable=False),
        sa.Column("ruz_teacher_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_teachers_ruz_teacher_id", "teachers", ["ruz_teacher_id"], unique=True)

    op.create_table(
        "sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tablet_id", sa.String(length=36), nullable=False),
        sa.Column("teacher_id", sa.String(length=36), nullable=True),
        sa.Column("teacher_name", sa.String(length=200), nullable=False),
        sa.Column("discipline", sa.String(length=300), nullable=False),
        sa.Column("qr_secret", sa.String(length=64), nullable=False),
        sa.Column("rotate_seconds", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("schedule_snapshot", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["tablet_id"], ["tablets.id"]),
        sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "attendance",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("student_external_id", sa.String(length=100), nullable=False),
        sa.Column("student_name", sa.String(length=200), nullable=False),
        sa.Column("student_email", sa.String(length=200), nullable=False),
        sa.Column("marked_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id", "student_external_id", name="uq_session_student"),
    )


def downgrade() -> None:
    op.drop_table("attendance")
    op.drop_table("sessions")
    op.drop_index("ix_teachers_ruz_teacher_id", table_name="teachers")
    op.drop_table("teachers")
    op.drop_index("ix_tablets_reg_pin", table_name="tablets")
    op.drop_index("ix_tablets_display_pin", table_name="tablets")
    op.drop_table("tablets")

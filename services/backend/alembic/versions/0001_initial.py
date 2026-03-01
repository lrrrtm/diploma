"""initial services schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-03-02 01:10:00

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    status_enum = sa.Enum(
        "PENDING",
        "IN_PROGRESS",
        "COMPLETED",
        "REJECTED",
        name="applicationstatus",
    )

    op.create_table(
        "departments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_departments_id", "departments", ["id"], unique=False)

    op.create_table(
        "services",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("department_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("required_fields", sa.JSON(), nullable=False),
        sa.Column("requires_attachment", sa.Boolean(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_services_id", "services", ["id"], unique=False)

    op.create_table(
        "executors",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("department_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_executors_id", "executors", ["id"], unique=False)

    op.create_table(
        "applications",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("service_id", sa.String(length=36), nullable=False),
        sa.Column("student_external_id", sa.String(length=255), nullable=False),
        sa.Column("student_name", sa.String(length=255), nullable=False),
        sa.Column("student_email", sa.String(length=255), nullable=True),
        sa.Column("form_data", sa.JSON(), nullable=False),
        sa.Column("status", status_enum, nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("executor_id", sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(["executor_id"], ["executors.id"]),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_applications_id", "applications", ["id"], unique=False)
    op.create_index("ix_applications_student_external_id", "applications", ["student_external_id"], unique=False)

    op.create_table(
        "application_responses",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("application_id", sa.String(length=36), nullable=False),
        sa.Column("department_id", sa.String(length=36), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["application_id"], ["applications.id"]),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_application_responses_id", "application_responses", ["id"], unique=False)

    op.create_table(
        "attachments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("application_id", sa.String(length=36), nullable=False),
        sa.Column("response_id", sa.String(length=36), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("file_path", sa.String(length=512), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["application_id"], ["applications.id"]),
        sa.ForeignKeyConstraint(["response_id"], ["application_responses.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_attachments_id", "attachments", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_attachments_id", table_name="attachments")
    op.drop_table("attachments")

    op.drop_index("ix_application_responses_id", table_name="application_responses")
    op.drop_table("application_responses")

    op.drop_index("ix_applications_student_external_id", table_name="applications")
    op.drop_index("ix_applications_id", table_name="applications")
    op.drop_table("applications")

    op.drop_index("ix_executors_id", table_name="executors")
    op.drop_table("executors")

    op.drop_index("ix_services_id", table_name="services")
    op.drop_table("services")

    op.drop_index("ix_departments_id", table_name="departments")
    op.drop_table("departments")

    bind = op.get_bind()
    status_enum = sa.Enum(
        "PENDING",
        "IN_PROGRESS",
        "COMPLETED",
        "REJECTED",
        name="applicationstatus",
    )
    status_enum.drop(bind, checkfirst=True)

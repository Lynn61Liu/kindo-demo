"""Create four core tables and database invariants."""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "app_user",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("role", sa.String(10), nullable=False),
        sa.CheckConstraint("role IN ('admin', 'parent')", name=op.f("ck_app_user_role")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_app_user")),
    )
    op.create_table(
        "student",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["app_user.id"], name=op.f("fk_student_parent_id_app_user")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_student")),
    )
    op.create_index(op.f("ix_student_parent_id"), "student", ["parent_id"])
    op.create_table(
        "payment_request",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), server_default="NZD", nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(10), server_default="open", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("amount_cents BETWEEN 1 AND 100000000", name=op.f("ck_payment_request_amount")),
        sa.CheckConstraint("currency = 'NZD'", name=op.f("ck_payment_request_currency")),
        sa.CheckConstraint("char_length(btrim(title)) BETWEEN 1 AND 120", name=op.f("ck_payment_request_title")),
        sa.CheckConstraint("description IS NULL OR char_length(description) <= 1000", name=op.f("ck_payment_request_description")),
        sa.CheckConstraint(
            "(status = 'open' AND paid_at IS NULL) OR (status = 'paid' AND paid_at IS NOT NULL)",
            name=op.f("ck_payment_request_status_paid_at"),
        ),
        sa.ForeignKeyConstraint(["student_id"], ["student.id"], name=op.f("fk_payment_request_student_id_student")),
        sa.ForeignKeyConstraint(["created_by"], ["app_user.id"], name=op.f("fk_payment_request_created_by_app_user")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payment_request")),
    )
    op.create_index(op.f("ix_payment_request_student_id"), "payment_request", ["student_id"])
    op.create_table(
        "payment",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("payment_request_id", sa.Integer(), nullable=False),
        sa.Column("payer_id", sa.Integer(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(10), server_default="succeeded", nullable=False),
        sa.Column("provider_reference", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("amount_cents BETWEEN 1 AND 100000000", name=op.f("ck_payment_amount")),
        sa.CheckConstraint("status = 'succeeded'", name=op.f("ck_payment_status")),
        sa.CheckConstraint("provider_reference LIKE 'simulated-%'", name=op.f("ck_payment_simulated_reference")),
        sa.ForeignKeyConstraint(["payment_request_id"], ["payment_request.id"], name=op.f("fk_payment_payment_request_id_payment_request")),
        sa.ForeignKeyConstraint(["payer_id"], ["app_user.id"], name=op.f("fk_payment_payer_id_app_user")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payment")),
        sa.UniqueConstraint("payment_request_id", name=op.f("uq_payment_payment_request_id")),
    )


def downgrade():
    op.drop_table("payment")
    op.drop_table("payment_request")
    op.drop_table("student")
    op.drop_table("app_user")

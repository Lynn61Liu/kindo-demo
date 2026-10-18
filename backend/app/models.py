from datetime import date, datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Identity, Integer, MetaData, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={
        "ix": "ix_%(table_name)s_%(column_0_name)s",
        "uq": "uq_%(table_name)s_%(column_0_name)s",
        "ck": "ck_%(table_name)s_%(constraint_name)s",
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "pk": "pk_%(table_name)s",
    })


class User(Base):
    __tablename__ = "app_user"
    __table_args__ = (CheckConstraint("role IN ('admin', 'parent')", name="role"),)

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(10))


class Student(Base):
    __tablename__ = "student"

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    parent_id: Mapped[int] = mapped_column(ForeignKey("app_user.id"), index=True)


class PaymentRequest(Base):
    __tablename__ = "payment_request"
    __table_args__ = (
        CheckConstraint("amount_cents BETWEEN 1 AND 100000000", name="amount"),
        CheckConstraint("currency = 'NZD'", name="currency"),
        CheckConstraint("char_length(btrim(title)) BETWEEN 1 AND 120", name="title"),
        CheckConstraint("description IS NULL OR char_length(description) <= 1000", name="description"),
        CheckConstraint(
            "(status = 'open' AND paid_at IS NULL) OR (status = 'paid' AND paid_at IS NOT NULL)",
            name="status_paid_at",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("student.id"), index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("app_user.id"))
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    amount_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), server_default="NZD")
    due_date: Mapped[date | None]
    status: Mapped[str] = mapped_column(String(10), server_default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Payment(Base):
    __tablename__ = "payment"
    __table_args__ = (
        CheckConstraint("amount_cents BETWEEN 1 AND 100000000", name="amount"),
        CheckConstraint("status = 'succeeded'", name="status"),
        CheckConstraint("provider_reference LIKE 'simulated-%'", name="simulated_reference"),
    )

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    payment_request_id: Mapped[int] = mapped_column(ForeignKey("payment_request.id"), unique=True)
    payer_id: Mapped[int] = mapped_column(ForeignKey("app_user.id"))
    amount_cents: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(10), server_default="succeeded")
    provider_reference: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

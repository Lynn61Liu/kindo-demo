from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PaymentRequestCreate(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    student_id: Annotated[int, Field(gt=0)]
    title: Annotated[str, Field(min_length=1, max_length=120)]
    description: Annotated[str | None, Field(max_length=1000)] = None
    amount_cents: Annotated[int, Field(ge=1, le=100_000_000)]
    due_date: date | None = None

    @field_validator("title", mode="before")
    @classmethod
    def trim_title(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("description", mode="before")
    @classmethod
    def normalize_empty_description(cls, value):
        return None if isinstance(value, str) and value.strip() == "" else value

    @field_validator("due_date", mode="before")
    @classmethod
    def parse_iso_due_date(cls, value):
        # JSON has no date type, so accept the standard date-input representation
        # while keeping strict validation for every other field.
        if not isinstance(value, str):
            return value
        try:
            parsed = date.fromisoformat(value)
        except ValueError:
            return value
        return parsed if parsed.isoformat() == value else value


class StudentRead(BaseModel):
    id: int
    name: str


class ParentRead(BaseModel):
    id: int
    name: str


class PaymentRead(BaseModel):
    id: int
    payer_id: int
    amount_cents: int
    status: str
    provider_reference: str
    created_at: datetime


class PaymentRequestRead(BaseModel):
    id: int
    student: StudentRead
    parent: ParentRead
    created_by: int
    title: str
    description: str | None
    amount_cents: int
    currency: str
    due_date: date | None
    status: str
    created_at: datetime
    paid_at: datetime | None
    payment: PaymentRead | None = None


class StudentWithParentRead(StudentRead):
    parent: ParentRead


class StudentListRead(BaseModel):
    items: list[StudentWithParentRead]


class PaymentRequestListRead(BaseModel):
    items: list[PaymentRequestRead]


class EmptyPaymentBody(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

from typing import Literal

from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin, require_parent
from app.db import get_session
from app.models import User
from app.payments import (
    create_payment_request,
    get_payment_request,
    list_admin_payment_requests,
    list_admin_students,
    list_parent_payment_requests,
    simulate_payment,
)
from app.schemas import (
    PaymentRequestCreate,
    PaymentRequestListRead,
    PaymentRequestRead,
    StudentListRead,
    EmptyPaymentBody,
)

router = APIRouter(prefix="/api/v1")


@router.get("/admin/students", response_model=StudentListRead)
def get_admin_students(
    session: Session = Depends(get_session),
    _admin: User = Depends(require_admin),
) -> StudentListRead:
    return StudentListRead(items=list_admin_students(session))


@router.get("/admin/payment-requests", response_model=PaymentRequestListRead)
def get_admin_payment_requests(
    status: Literal["open", "paid"] | None = None,
    session: Session = Depends(get_session),
    _admin: User = Depends(require_admin),
) -> PaymentRequestListRead:
    return PaymentRequestListRead(items=list_admin_payment_requests(session, status))


@router.post("/payment-requests", response_model=PaymentRequestRead, status_code=201)
def post_payment_request(
    data: PaymentRequestCreate,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
) -> PaymentRequestRead:
    return create_payment_request(session, data, admin)


@router.get("/payment-requests", response_model=PaymentRequestListRead)
def get_parent_payment_requests(
    status: Literal["open", "paid"] = "open",
    session: Session = Depends(get_session),
    parent: User = Depends(require_parent),
) -> PaymentRequestListRead:
    return PaymentRequestListRead(items=list_parent_payment_requests(session, parent, status))


@router.get("/payment-requests/{request_id}", response_model=PaymentRequestRead)
def get_payment_request_detail(
    request_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> PaymentRequestRead:
    return get_payment_request(session, request_id, user)


@router.post(
    "/payment-requests/{request_id}/simulate-payment",
    response_model=PaymentRequestRead,
)
def post_simulate_payment(
    request_id: int,
    body: EmptyPaymentBody | None = Body(default=None),
    session: Session = Depends(get_session),
    parent: User = Depends(require_parent),
) -> PaymentRequestRead:
    return simulate_payment(session, request_id, parent)

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models import Payment, PaymentRequest, Student, User
from app.schemas import (
    ParentRead,
    PaymentRequestCreate,
    PaymentRequestRead,
    PaymentRead,
    StudentRead,
    StudentWithParentRead,
)


def _not_found() -> HTTPException:
    return HTTPException(404, detail={"code": "not_found", "message": "Resource not found"})


def _payment_read(payment: Payment | None) -> PaymentRead | None:
    if payment is None:
        return None
    return PaymentRead(
        id=payment.id,
        payer_id=payment.payer_id,
        amount_cents=payment.amount_cents,
        status=payment.status,
        provider_reference=payment.provider_reference,
        created_at=payment.created_at,
    )


def _request_read(
    request: PaymentRequest,
    student: Student,
    parent: User,
    payment: Payment | None,
) -> PaymentRequestRead:
    return PaymentRequestRead(
        id=request.id,
        student={"id": student.id, "name": student.name},
        parent={"id": parent.id, "name": parent.name},
        created_by=request.created_by,
        title=request.title,
        description=request.description,
        amount_cents=request.amount_cents,
        currency=request.currency,
        due_date=request.due_date,
        status=request.status,
        created_at=request.created_at,
        paid_at=request.paid_at,
        payment=_payment_read(payment),
    )


def create_payment_request(
    session: Session,
    data: PaymentRequestCreate,
    admin: User,
) -> PaymentRequestRead:
    student_and_parent = session.execute(
        select(Student, User)
        .join(User, Student.parent_id == User.id)
        .where(Student.id == data.student_id)
    ).one_or_none()
    if student_and_parent is None:
        raise HTTPException(404, detail={"code": "not_found", "message": "Student not found"})
    student, parent = student_and_parent

    request = PaymentRequest(
        student_id=student.id,
        created_by=admin.id,
        title=data.title,
        description=data.description,
        amount_cents=data.amount_cents,
        currency="NZD",
        due_date=data.due_date,
        status="open",
        paid_at=None,
    )
    session.add(request)
    try:
        session.flush()
        # Build a detached response snapshot before commit expires ORM attributes.
        result = PaymentRequestRead(
            id=request.id,
            student={"id": student.id, "name": student.name},
            parent={"id": parent.id, "name": parent.name},
            created_by=admin.id,
            title=request.title,
            description=request.description,
            amount_cents=request.amount_cents,
            currency=request.currency,
            due_date=request.due_date,
            status=request.status,
            created_at=request.created_at,
            paid_at=request.paid_at,
            payment=None,
        )
        session.commit()
        return result
    except Exception as exc:
        session.rollback()
        raise HTTPException(
            500,
            detail={"code": "internal_error", "message": "Unable to create payment request"},
        ) from exc


def list_admin_students(session: Session) -> list[StudentWithParentRead]:
    rows = session.execute(
        select(Student, User)
        .join(User, Student.parent_id == User.id)
        .order_by(Student.id)
    ).all()
    return [
        StudentWithParentRead(
            id=student.id,
            name=student.name,
            parent={"id": parent.id, "name": parent.name},
        )
        for student, parent in rows
    ]


def list_admin_payment_requests(
    session: Session,
    status: str | None = None,
) -> list[PaymentRequestRead]:
    query = (
        select(PaymentRequest, Student, User, Payment)
        .join(Student, PaymentRequest.student_id == Student.id)
        .join(User, Student.parent_id == User.id)
        .outerjoin(Payment, Payment.payment_request_id == PaymentRequest.id)
        .order_by(desc(PaymentRequest.created_at), desc(PaymentRequest.id))
    )
    if status is not None:
        query = query.where(PaymentRequest.status == status)

    return [
        _request_read(request, student, parent, payment)
        for request, student, parent, payment in session.execute(query).all()
    ]


def list_parent_payment_requests(
    session: Session,
    parent: User,
    status: str = "open",
) -> list[PaymentRequestRead]:
    query = (
        select(PaymentRequest, Student, User, Payment)
        .join(Student, PaymentRequest.student_id == Student.id)
        .join(User, Student.parent_id == User.id)
        .outerjoin(Payment, Payment.payment_request_id == PaymentRequest.id)
        .where(User.id == parent.id, PaymentRequest.status == status)
        .order_by(desc(PaymentRequest.created_at), desc(PaymentRequest.id))
    )
    return [
        _request_read(request, student, owner, payment)
        for request, student, owner, payment in session.execute(query).all()
    ]


def get_payment_request(
    session: Session,
    request_id: int,
    user: User,
) -> PaymentRequestRead:
    query = (
        select(PaymentRequest, Student, User, Payment)
        .join(Student, PaymentRequest.student_id == Student.id)
        .join(User, Student.parent_id == User.id)
        .outerjoin(Payment, Payment.payment_request_id == PaymentRequest.id)
        .where(PaymentRequest.id == request_id)
    )
    if user.role != "admin":
        query = query.where(User.id == user.id)
    row = session.execute(query).one_or_none()
    if row is None:
        raise _not_found()
    request, student, parent, payment = row
    return _request_read(request, student, parent, payment)


def simulate_payment(
    session: Session,
    request_id: int,
    payer: User,
) -> PaymentRequestRead:
    # Auth dependency may already have autobegun this Session. Keep the existing
    # transaction and lock only the request row while checking ownership and state.
    query = (
        select(PaymentRequest, Student, User, Payment)
        .join(Student, PaymentRequest.student_id == Student.id)
        .join(User, Student.parent_id == User.id)
        .outerjoin(Payment, Payment.payment_request_id == PaymentRequest.id)
        .where(PaymentRequest.id == request_id, User.id == payer.id)
        .with_for_update(of=PaymentRequest)
    )
    row = session.execute(query).one_or_none()
    if row is None:
        raise _not_found()
    request, student, parent, payment = row

    if request.status == "paid":
        # The prior result is already durable. End the read transaction and release
        # its row lock before returning the replay response.
        if payment is None:
            # A SELECT that waited for a concurrent row update retains its original
            # statement snapshot for joined rows. Start a new statement snapshot to
            # see the Payment inserted by the transaction that just released the lock.
            payment = session.scalar(
                select(Payment).where(Payment.payment_request_id == request.id)
            )
        if payment is None:
            session.rollback()
            raise HTTPException(500, detail={"code": "internal_error", "message": "Payment result unavailable"})
        result = _request_read(request, student, parent, payment)
        session.rollback()
        return result

    now = datetime.now(timezone.utc)
    new_payment = Payment(
        payment_request_id=request.id,
        payer_id=payer.id,
        amount_cents=request.amount_cents,
        status="succeeded",
        provider_reference=f"simulated-{request.id}",
        created_at=now,
    )
    request.status = "paid"
    request.paid_at = now
    session.add(new_payment)
    try:
        session.flush()
        result = _request_read(request, student, parent, new_payment)
        session.commit()
        return result
    except Exception as exc:
        session.rollback()
        raise HTTPException(
            500,
            detail={"code": "internal_error", "message": "Unable to complete simulated payment"},
        ) from exc

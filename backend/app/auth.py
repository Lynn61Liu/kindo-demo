import re

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import User


def get_current_user(
    demo_user_id: str | None = Header(default=None, alias="X-Demo-User-Id"),
    session: Session = Depends(get_session),
) -> User:
    if demo_user_id is None or re.fullmatch(r"[1-9][0-9]*", demo_user_id) is None:
        raise HTTPException(401, detail={"code": "unauthenticated", "message": "Demo identity required"})
    user = session.scalar(select(User).where(User.id == int(demo_user_id)))
    if user is None:
        raise HTTPException(401, detail={"code": "unauthenticated", "message": "Demo identity required"})
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, detail={"code": "forbidden", "message": "Administrator access required"})
    return user


def require_parent(user: User = Depends(get_current_user)) -> User:
    if user.role != "parent":
        raise HTTPException(403, detail={"code": "forbidden", "message": "Parent access required"})
    return user

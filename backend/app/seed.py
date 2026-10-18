"""Insert fictional demo identities without changing existing business data."""
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db import get_engine
from app.models import Student, User


def seed(session: Session) -> None:
    # The caller owns the transaction, just like every other database helper.
    session.execute(insert(User).values([
        {"id": 1, "name": "Demo Admin", "role": "admin"},
        {"id": 2, "name": "Parent A", "role": "parent"},
        {"id": 3, "name": "Parent B", "role": "parent"},
    ]).on_conflict_do_nothing(index_elements=[User.id]))
    session.execute(insert(Student).values([
        {"id": 101, "name": "Student A1", "parent_id": 2},
        {"id": 102, "name": "Student A2", "parent_id": 2},
        {"id": 103, "name": "Student B1", "parent_id": 3},
    ]).on_conflict_do_nothing(index_elements=[Student.id]))
    # Explicit seed IDs must not leave generated IDs behind those inserted values.
    # Do not rewind a sequence when a previous generated ID was rolled back/deleted.
    for table in ("app_user", "student"):
        session.execute(text(
            f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
            f"GREATEST((SELECT COALESCE(MAX(id), 1) FROM {table}), "
            f"pg_sequence_last_value(pg_get_serial_sequence('{table}', 'id')::regclass)), true)"
        ))


def main() -> None:
    with Session(get_engine()) as session:
        seed(session)
        session.commit()
    print("Demo identities ready: 1 admin; 2 parents; 3 students. Existing data retained.")


if __name__ == "__main__":
    main()

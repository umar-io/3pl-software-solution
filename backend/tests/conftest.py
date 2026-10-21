import os

os.environ.setdefault("JWT_SECRET", "test-secret-test-secret-test-secret-0123456789")
os.environ.setdefault("DATABASE_URL", "sqlite://")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.main import app
from app.models.auth import User
from app.models.fulfillment import Base
from app.services.auth import create_token, hash_password

PASSWORD = "correct-horse-battery"


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    for email, role, client in [
        ("admin@t.io", "admin", None),
        ("ops@t.io", "operator", None),
        ("glow@t.io", "merchant", "Glow Cosmetics"),
    ]:
        session.add(User(email=email, name=email, role=role, client=client,
                         password_hash=hash_password(PASSWORD)))
    session.add(User(email="off@t.io", name="off", role="admin", active=False,
                     password_hash=hash_password(PASSWORD)))
    session.commit()
    yield session
    session.close()


@pytest.fixture()
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


def headers_for(db, email: str) -> dict:
    user = db.query(User).filter_by(email=email).one()
    return {"Authorization": f"Bearer {create_token(user.id, user.role)}"}

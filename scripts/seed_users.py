"""Create the demo users (idempotent: existing emails are left untouched).

Passwords are random unless DEMO_PASSWORD is set; generated ones are printed once.

  PYTHONPATH=backend backend/.venv/bin/python scripts/seed_users.py
"""

import os
import secrets

from sqlalchemy import select

from app.database import SessionLocal
from app.models.auth import User
from app.services.auth import hash_password

USERS = [
    ("admin@fulfill.demo", "Ada Admin", "admin", None),
    ("ops@fulfill.demo", "Olu Operator", "operator", None),
    ("glow@fulfill.demo", "Glow Cosmetics", "merchant", "Glow Cosmetics"),
    ("urban@fulfill.demo", "Urban Threads", "merchant", "Urban Threads"),
    ("homenest@fulfill.demo", "HomeNest", "merchant", "HomeNest"),
]


def main() -> None:
    shared = os.getenv("DEMO_PASSWORD")
    with SessionLocal() as db:
        for email, name, role, client in USERS:
            if db.scalar(select(User).where(User.email == email)):
                print(f"exists   {email}")
                continue
            password = shared or secrets.token_urlsafe(9)
            db.add(User(email=email, name=name, role=role, client=client,
                        password_hash=hash_password(password)))
            db.commit()
            print(f"created  {email:<24} {role:<9} password: {password}")


if __name__ == "__main__":
    main()

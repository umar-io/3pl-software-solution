"""Password hashing and JWT handling. No FastAPI imports here, so it is easy to test."""

import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from dotenv import load_dotenv

load_dotenv()

ALGORITHM = "HS256"
TOKEN_TTL = timedelta(hours=8)

# Role -> permissions. This table is the single source of truth for RBAC.
ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    # Read-only staff view; used for the public demo account.
    "viewer": frozenset({"inventory:read", "receiving:read", "order:read"}),
    "merchant": frozenset({"inventory:read", "order:read"}),
    "operator": frozenset(
        {
            "inventory:read",
            "inventory:sync",
            "variance:review",
            "receiving:read",
            "order:read",
            "order:advance",
        }
    ),
    "admin": frozenset(
        {
            "inventory:read",
            "inventory:sync",
            "variance:review",
            "variance:adjust",
            "receiving:read",
            "order:read",
            "order:advance",
            "order:cancel",
        }
    ),
}


class TokenError(Exception):
    pass


def _secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret or len(secret) < 32:
        raise RuntimeError("JWT_SECRET must be set to a random string of 32+ characters")
    return secret


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


# Verified against when the email is unknown, so login timing doesn't reveal it.
_DUMMY_HASH = hash_password("not-a-real-password")


def burn_password_check(password: str) -> None:
    verify_password(password, _DUMMY_HASH)


def create_token(user_id: int, role: str, now: datetime | None = None) -> str:
    issued = now or datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": issued,
        "exp": issued + TOKEN_TTL,
    }
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            _secret(),
            algorithms=[ALGORITHM],  # pin the algorithm; never trust the header
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc


def permissions_for(role: str) -> frozenset[str]:
    return ROLE_PERMISSIONS.get(role, frozenset())

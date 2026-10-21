from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select

from app.database import get_db
from app.models.auth import User
from app.services.auth import TokenError, decode_token, permissions_for

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db=Depends(get_db),
) -> User:
    unauthorised = HTTPException(
        status_code=401,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorised
    try:
        claims = decode_token(credentials.credentials)
        user_id = int(claims["sub"])
    except (TokenError, ValueError):
        raise unauthorised

    # Role and status come from the database, not the token, so demoting or
    # disabling a user takes effect immediately.
    user = db.scalar(select(User).where(User.id == user_id))
    if user is None or not user.active:
        raise unauthorised
    return user


def require(permission: str):
    """Dependency factory: 401 if not signed in, 403 if the role lacks `permission`."""

    def checker(user: User = Depends(get_current_user)) -> User:
        if permission not in permissions_for(user.role):
            raise HTTPException(status_code=403, detail="You don't have permission to do that")
        return user

    return checker


def scope_client(user: User) -> str | None:
    """The client a user is pinned to, or None for staff who see everything."""
    return user.client if user.role == "merchant" else None

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import get_current_user
from app.database import get_db
from app.models.auth import User
from app.services.auth import (
    burn_password_check,
    create_token,
    permissions_for,
    verify_password,
)

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


def _public(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "client": user.client,
        "permissions": sorted(permissions_for(user.role)),
    }


@router.post("/login")
def login(payload: LoginRequest, db=Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.strip().lower()))
    if user is None:
        burn_password_check(payload.password)
    if user is None or not user.active or not verify_password(payload.password, user.password_hash):
        # One message for every failure, so the response doesn't reveal which emails exist.
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return {"access_token": create_token(user.id, user.role), "token_type": "bearer", "user": _public(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return _public(user)

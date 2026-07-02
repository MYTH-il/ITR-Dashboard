"""Auth routes."""
from fastapi import APIRouter, HTTPException, Depends, Response
from models import LoginRequest
from auth import verify_password, create_access_token, get_current_user
from db import get_db
from audit import log_audit

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
async def login(req: LoginRequest, response: Response):
    db = get_db()
    email = req.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(user["id"], user["email"], user["role"])
    response.set_cookie("access_token", token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
    safe = {k: v for k, v in user.items() if k not in ("_id", "password_hash")}
    await log_audit(db, safe, "Auth", "Login", entity_id=user["id"])
    return {"token": token, "user": safe}


@router.post("/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    db = get_db()
    await log_audit(db, user, "Auth", "Logout", entity_id=user["id"])
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user

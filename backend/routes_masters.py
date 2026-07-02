"""Master data routes: users, clients, workflow stages, dropdown options."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import Response
from typing import Optional, List
from pymongo.errors import DuplicateKeyError
from models import (
    UserCreate, UserUpdate, ClientCreate, ClientUpdate,
    StageCreate, StageUpdate, StageReorder,
    OptionCreate, OptionUpdate, gen_id, utcnow
)
from auth import get_current_user, require_admin, hash_password
from db import get_db
from audit import log_audit
from utils_export import to_csv, to_xlsx, read_csv_bytes, read_xlsx_bytes

router = APIRouter(tags=["masters"])


# ---------- Users ----------
@router.get("/users")
async def list_users(user: dict = Depends(get_current_user)):
    db = get_db()
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return docs


@router.post("/users")
async def create_user(payload: UserCreate, admin: dict = Depends(require_admin)):
    db = get_db()
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")
    doc = {
        "id": gen_id(),
        "email": email,
        "name": payload.name,
        "password_hash": hash_password(payload.password),
        "role": payload.role,
        "active": payload.active,
        "created_at": utcnow().isoformat(),
    }
    try:
        await db.users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail=f"Email '{email}' already exists")
    await log_audit(db, admin, "Users", "Create", entity_id=doc["id"], new_value={"email": email, "name": payload.name, "role": payload.role})
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return doc


@router.patch("/users/{user_id}")
async def update_user(user_id: str, payload: UserUpdate, admin: dict = Depends(require_admin)):
    db = get_db()
    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(404, "User not found")
    update = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if "password" in update:
        update["password_hash"] = hash_password(update.pop("password"))
    await db.users.update_one({"id": user_id}, {"$set": update})
    await log_audit(db, admin, "Users", "Update", entity_id=user_id, old_value={k: existing.get(k) for k in update}, new_value=update)
    return {"ok": True}


@router.delete("/users/{user_id}")
async def deactivate_user(user_id: str, admin: dict = Depends(require_admin)):
    db = get_db()
    await db.users.update_one({"id": user_id}, {"$set": {"active": False}})
    await log_audit(db, admin, "Users", "Deactivate", entity_id=user_id)
    return {"ok": True}


# ---------- Clients ----------
@router.get("/clients")
async def list_clients(
    search: Optional[str] = None,
    category: Optional[str] = None,
    group: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    q = {}
    if category:
        q["category"] = category
    if group:
        q["group"] = group
    if search:
        q["$or"] = [
            {"file_no": {"$regex": search, "$options": "i"}},
            {"client_name": {"$regex": search, "$options": "i"}},
            {"group": {"$regex": search, "$options": "i"}},
        ]
    docs = await db.clients.find(q, {"_id": 0}).sort("file_no", 1).to_list(5000)
    return docs


@router.post("/clients")
async def create_client(payload: ClientCreate, admin: dict = Depends(require_admin)):
    db = get_db()
    doc = {"id": gen_id(), **payload.model_dump(), "created_at": utcnow().isoformat(), "updated_at": utcnow().isoformat()}
    await db.clients.insert_one(doc)
    await log_audit(db, admin, "Clients", "Create", entity_id=doc["id"], new_value=payload.model_dump())
    doc.pop("_id", None)
    return doc


@router.patch("/clients/{client_id}")
async def update_client(client_id: str, payload: ClientUpdate, admin: dict = Depends(require_admin)):
    db = get_db()
    existing = await db.clients.find_one({"id": client_id})
    if not existing:
        raise HTTPException(404, "Client not found")
    update = payload.model_dump(exclude_none=True)
    update["updated_at"] = utcnow().isoformat()
    await db.clients.update_one({"id": client_id}, {"$set": update})
    await log_audit(db, admin, "Clients", "Update", entity_id=client_id, old_value={k: existing.get(k) for k in update}, new_value=update)
    return {"ok": True}


@router.delete("/clients/{client_id}")
async def delete_client(client_id: str, admin: dict = Depends(require_admin)):
    db = get_db()
    await db.clients.delete_one({"id": client_id})
    await log_audit(db, admin, "Clients", "Delete", entity_id=client_id)
    return {"ok": True}


CLIENT_HEADERS = ["file_no", "group", "client_name", "category"]


@router.get("/clients/export")
async def export_clients(format: str = Query("xlsx"), user: dict = Depends(get_current_user)):
    db = get_db()
    docs = await db.clients.find({}, {"_id": 0}).sort("file_no", 1).to_list(10000)
    if format == "csv":
        data = to_csv(docs, CLIENT_HEADERS)
        return Response(content=data, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=clients.csv"})
    data = to_xlsx(docs, CLIENT_HEADERS, "Clients")
    return Response(content=data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=clients.xlsx"})


@router.post("/clients/import")
async def import_clients(file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    db = get_db()
    content = await file.read()
    name = (file.filename or "").lower()
    if name.endswith(".csv"):
        rows = read_csv_bytes(content)
    elif name.endswith(".xlsx"):
        rows = read_xlsx_bytes(content)
    else:
        raise HTTPException(400, "Unsupported file type. Use .csv or .xlsx")
    inserted = 0
    updated = 0
    for row in rows:
        file_no = str(row.get("file_no") or "").strip()
        if not file_no:
            continue
        client_name = str(row.get("client_name") or "").strip()
        if not client_name:
            continue
        update = {
            "file_no": file_no,
            "group": str(row.get("group") or "").strip(),
            "client_name": client_name,
            "category": str(row.get("category") or "").strip(),
            "updated_at": utcnow().isoformat(),
        }
        existing = await db.clients.find_one({"file_no": file_no})
        if existing:
            await db.clients.update_one({"id": existing["id"]}, {"$set": update})
            updated += 1
        else:
            doc = {"id": gen_id(), **update, "created_at": utcnow().isoformat()}
            await db.clients.insert_one(doc)
            inserted += 1
    await log_audit(db, admin, "Clients", "Import", new_value={"inserted": inserted, "updated": updated})
    return {"inserted": inserted, "updated": updated}


# ---------- Workflow Stages ----------
@router.get("/workflow-stages")
async def list_stages(user: dict = Depends(get_current_user)):
    db = get_db()
    docs = await db.workflow_stages.find({}, {"_id": 0}).sort("sequence", 1).to_list(200)
    return docs


@router.post("/workflow-stages")
async def create_stage(payload: StageCreate, admin: dict = Depends(require_admin)):
    db = get_db()
    doc = {"id": gen_id(), **payload.model_dump(), "created_at": utcnow().isoformat(), "updated_at": utcnow().isoformat()}
    await db.workflow_stages.insert_one(doc)
    await log_audit(db, admin, "WorkflowStages", "Create", entity_id=doc["id"], new_value=payload.model_dump())
    doc.pop("_id", None)
    return doc


@router.patch("/workflow-stages/{stage_id}")
async def update_stage(stage_id: str, payload: StageUpdate, admin: dict = Depends(require_admin)):
    db = get_db()
    existing = await db.workflow_stages.find_one({"id": stage_id})
    if not existing:
        raise HTTPException(404, "Stage not found")
    update = payload.model_dump(exclude_none=True)
    update["updated_at"] = utcnow().isoformat()
    await db.workflow_stages.update_one({"id": stage_id}, {"$set": update})
    await log_audit(db, admin, "WorkflowStages", "Update", entity_id=stage_id, old_value={k: existing.get(k) for k in update}, new_value=update)
    return {"ok": True}


@router.post("/workflow-stages/reorder")
async def reorder_stages(payload: StageReorder, admin: dict = Depends(require_admin)):
    db = get_db()
    for i, sid in enumerate(payload.ordered_ids):
        await db.workflow_stages.update_one({"id": sid}, {"$set": {"sequence": i + 1, "updated_at": utcnow().isoformat()}})
    await log_audit(db, admin, "WorkflowStages", "Reorder", new_value={"ordered_ids": payload.ordered_ids})
    return {"ok": True}


@router.delete("/workflow-stages/{stage_id}")
async def disable_stage(stage_id: str, admin: dict = Depends(require_admin)):
    db = get_db()
    await db.workflow_stages.update_one({"id": stage_id}, {"$set": {"active": False, "updated_at": utcnow().isoformat()}})
    await log_audit(db, admin, "WorkflowStages", "Disable", entity_id=stage_id)
    return {"ok": True}


# ---------- Dropdown Options ----------
@router.get("/dropdown-options")
async def list_options(category: Optional[str] = None, user: dict = Depends(get_current_user)):
    db = get_db()
    q = {}
    if category:
        q["category"] = category
    docs = await db.dropdown_options.find(q, {"_id": 0}).sort([("category", 1), ("sequence", 1)]).to_list(500)
    return docs


@router.post("/dropdown-options")
async def create_option(payload: OptionCreate, admin: dict = Depends(require_admin)):
    db = get_db()
    doc = {"id": gen_id(), **payload.model_dump()}
    await db.dropdown_options.insert_one(doc)
    await log_audit(db, admin, "DropdownOptions", "Create", entity_id=doc["id"], new_value=payload.model_dump())
    doc.pop("_id", None)
    return doc


@router.patch("/dropdown-options/{opt_id}")
async def update_option(opt_id: str, payload: OptionUpdate, admin: dict = Depends(require_admin)):
    db = get_db()
    update = payload.model_dump(exclude_none=True)
    await db.dropdown_options.update_one({"id": opt_id}, {"$set": update})
    await log_audit(db, admin, "DropdownOptions", "Update", entity_id=opt_id, new_value=update)
    return {"ok": True}


@router.delete("/dropdown-options/{opt_id}")
async def delete_option(opt_id: str, admin: dict = Depends(require_admin)):
    db = get_db()
    await db.dropdown_options.delete_one({"id": opt_id})
    await log_audit(db, admin, "DropdownOptions", "Delete", entity_id=opt_id)
    return {"ok": True}

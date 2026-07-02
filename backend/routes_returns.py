"""Return master & query management routes."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import Response
from typing import Optional
from datetime import datetime, timezone
from pymongo.errors import DuplicateKeyError
from models import (
    ReturnCreate, ReturnUpdate, ReassignRequest,
    QueryCreate, QueryUpdate, gen_id, utcnow
)
from auth import get_current_user, require_admin
from db import get_db
from audit import log_audit
from utils_export import to_csv, to_xlsx, to_pdf, read_csv_bytes, read_xlsx_bytes
from escalation import days_in_stage, days_since

router = APIRouter(tags=["operations"])


async def _enrich_return(db, r, stage_map=None, user_map=None):
    if stage_map is None:
        stages = await db.workflow_stages.find({}, {"_id": 0}).to_list(200)
        stage_map = {s["id"]: s for s in stages}
    if user_map is None:
        users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
        user_map = {u["id"]: u for u in users}
    stage = stage_map.get(r.get("current_stage_id"))
    assignee = user_map.get(r.get("person_assigned_id")) if r.get("person_assigned_id") else None
    return {
        **{k: v for k, v in r.items() if k != "_id"},
        "current_stage_name": stage.get("stage_name") if stage else None,
        "current_stage_colour": stage.get("dashboard_colour") if stage else None,
        "next_action_required": stage.get("next_action_required") if stage else "",
        "person_assigned_name": assignee.get("name") if assignee else None,
        "stage_ageing_days": days_in_stage(r.get("stage_entered_at") or r.get("created_at")),
        "total_ageing_days": days_since(r.get("created_at") or r.get("return_inward_date")),
        "last_updated_date": r.get("updated_at"),
    }


@router.get("/returns")
async def list_returns(
    search: Optional[str] = None,
    stage_id: Optional[str] = None,
    person_id: Optional[str] = None,
    return_type: Optional[str] = None,
    fy: Optional[str] = None,
    overdue: Optional[bool] = None,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    q = {}
    if stage_id:
        q["current_stage_id"] = stage_id
    if person_id:
        q["person_assigned_id"] = person_id
    if return_type:
        q["return_type"] = return_type
    if fy:
        q["fy"] = fy
    if search:
        q["$or"] = [
            {"return_inward_no": {"$regex": search, "$options": "i"}},
            {"client_name": {"$regex": search, "$options": "i"}},
            {"file_no": {"$regex": search, "$options": "i"}},
            {"task_id": {"$regex": search, "$options": "i"}},
        ]
    docs = await db.returns.find(q, {"_id": 0}).sort("created_at", -1).to_list(5000)
    stages = await db.workflow_stages.find({}, {"_id": 0}).to_list(200)
    stage_map = {s["id"]: s for s in stages}
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    user_map = {u["id"]: u for u in users}
    enriched = [await _enrich_return(db, r, stage_map, user_map) for r in docs]
    if overdue:
        today = datetime.now(timezone.utc).date().isoformat()
        enriched = [e for e in enriched if e.get("due_date") and e["due_date"] < today and (e.get("current_stage_name") or "").lower() != "completed"]
    return enriched


@router.get("/returns/{rid}")
async def get_return(rid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    r = await db.returns.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Not found")
    return await _enrich_return(db, r)


@router.post("/returns")
async def create_return(payload: ReturnCreate, admin: dict = Depends(require_admin)):
    db = get_db()
    stage = await db.workflow_stages.find_one({"id": payload.current_stage_id})
    if not stage:
        raise HTTPException(400, "Invalid stage")
    now = utcnow().isoformat()
    doc = {
        "id": gen_id(),
        **payload.model_dump(),
        "stage_entered_at": now,
        "created_at": now,
        "updated_at": now,
    }
    try:
        await db.returns.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail=f"Return with inward no. '{payload.return_inward_no}' already exists")
    await log_audit(db, admin, "Returns", "Create", entity_id=doc["id"], new_value={"return_inward_no": payload.return_inward_no, "stage": stage["stage_name"]})
    doc.pop("_id", None)
    return await _enrich_return(db, doc)


@router.patch("/returns/{rid}")
async def update_return(rid: str, payload: ReturnUpdate, admin: dict = Depends(require_admin)):
    db = get_db()
    existing = await db.returns.find_one({"id": rid})
    if not existing:
        raise HTTPException(404, "Not found")
    update = payload.model_dump(exclude_none=True)
    if "current_stage_id" in update and update["current_stage_id"] != existing.get("current_stage_id"):
        update["stage_entered_at"] = utcnow().isoformat()
        old_stage = await db.workflow_stages.find_one({"id": existing.get("current_stage_id")})
        new_stage = await db.workflow_stages.find_one({"id": update["current_stage_id"]})
        await log_audit(db, admin, "Returns", "Stage Changed", entity_id=rid,
                        old_value=old_stage["stage_name"] if old_stage else None,
                        new_value=new_stage["stage_name"] if new_stage else None)
    if "person_assigned_id" in update and update["person_assigned_id"] != existing.get("person_assigned_id"):
        old_user = await db.users.find_one({"id": existing.get("person_assigned_id")}) if existing.get("person_assigned_id") else None
        new_user = await db.users.find_one({"id": update["person_assigned_id"]}) if update["person_assigned_id"] else None
        await log_audit(db, admin, "Returns", "Person Assigned Changed", entity_id=rid,
                        old_value=old_user["name"] if old_user else None,
                        new_value=new_user["name"] if new_user else None)
    update["updated_at"] = utcnow().isoformat()
    await db.returns.update_one({"id": rid}, {"$set": update})
    return {"ok": True}


@router.post("/returns/{rid}/reassign")
async def reassign_return(rid: str, payload: ReassignRequest, admin: dict = Depends(require_admin)):
    db = get_db()
    existing = await db.returns.find_one({"id": rid})
    if not existing:
        raise HTTPException(404, "Not found")
    old_user = await db.users.find_one({"id": existing.get("person_assigned_id")}) if existing.get("person_assigned_id") else None
    new_user = await db.users.find_one({"id": payload.person_assigned_id}) if payload.person_assigned_id else None
    await db.returns.update_one({"id": rid}, {"$set": {"person_assigned_id": payload.person_assigned_id, "updated_at": utcnow().isoformat()}})
    await log_audit(db, admin, "Returns", "Person Assigned Changed", entity_id=rid,
                    old_value=old_user["name"] if old_user else None,
                    new_value=new_user["name"] if new_user else None)
    return {"ok": True}


@router.delete("/returns/{rid}")
async def delete_return(rid: str, admin: dict = Depends(require_admin)):
    db = get_db()
    await db.returns.delete_one({"id": rid})
    await db.queries.delete_many({"return_id": rid})
    await log_audit(db, admin, "Returns", "Delete", entity_id=rid)
    return {"ok": True}


RETURN_EXPORT_HEADERS = [
    "return_inward_no", "return_inward_date", "task_id", "fy", "file_no", "group",
    "client_name", "return_type", "itr_form", "due_date",
    "current_stage_name", "next_action_required", "person_assigned_name",
    "stage_ageing_days", "total_ageing_days", "last_updated_date"
]


@router.get("/returns/export/file")
async def export_returns(format: str = Query("xlsx"), user: dict = Depends(get_current_user)):
    db = get_db()
    docs = await db.returns.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    stages = await db.workflow_stages.find({}, {"_id": 0}).to_list(200)
    stage_map = {s["id"]: s for s in stages}
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    user_map = {u["id"]: u for u in users}
    enriched = [await _enrich_return(db, r, stage_map, user_map) for r in docs]
    if format == "csv":
        data = to_csv(enriched, RETURN_EXPORT_HEADERS)
        return Response(content=data, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=returns.csv"})
    if format == "pdf":
        data = to_pdf(enriched, RETURN_EXPORT_HEADERS, "Return Master Report")
        return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=returns.pdf"})
    data = to_xlsx(enriched, RETURN_EXPORT_HEADERS, "Returns")
    return Response(content=data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=returns.xlsx"})


@router.post("/returns/import")
async def import_returns(file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    db = get_db()
    content = await file.read()
    name = (file.filename or "").lower()
    if name.endswith(".csv"):
        rows = read_csv_bytes(content)
    elif name.endswith(".xlsx"):
        rows = read_xlsx_bytes(content)
    else:
        raise HTTPException(400, "Unsupported file type. Use .csv or .xlsx")
    stages = await db.workflow_stages.find({}, {"_id": 0}).to_list(200)
    stage_by_name = {s["stage_name"].lower(): s for s in stages}
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    user_by_email = {u["email"].lower(): u for u in users}
    user_by_name = {u["name"].lower(): u for u in users}

    inserted = 0
    skipped = 0
    for row in rows:
        rin = str(row.get("return_inward_no") or "").strip()
        if not rin:
            skipped += 1
            continue
        stage_name = str(row.get("current_stage_name") or row.get("current_stage") or "").strip().lower()
        stage = stage_by_name.get(stage_name) or stages[0]
        assignee_field = str(row.get("person_assigned") or row.get("person_assigned_name") or row.get("person_assigned_email") or "").strip().lower()
        assignee = user_by_email.get(assignee_field) or user_by_name.get(assignee_field)
        now = utcnow().isoformat()
        doc = {
            "id": gen_id(),
            "return_inward_no": rin,
            "return_inward_date": str(row.get("return_inward_date") or "").strip(),
            "task_id": str(row.get("task_id") or "").strip(),
            "fy": str(row.get("fy") or "").strip(),
            "file_no": str(row.get("file_no") or "").strip(),
            "group": str(row.get("group") or "").strip(),
            "client_name": str(row.get("client_name") or "").strip(),
            "return_type": str(row.get("return_type") or "Original").strip(),
            "itr_form": str(row.get("itr_form") or "").strip(),
            "due_date": str(row.get("due_date") or "").strip(),
            "current_stage_id": stage["id"],
            "person_assigned_id": assignee["id"] if assignee else None,
            "remarks": str(row.get("remarks") or "").strip(),
            "stage_entered_at": now,
            "created_at": now,
            "updated_at": now,
        }
        if await db.returns.find_one({"return_inward_no": rin}):
            skipped += 1
            continue
        await db.returns.insert_one(doc)
        inserted += 1
    await log_audit(db, admin, "Returns", "Import", new_value={"inserted": inserted, "skipped": skipped})
    return {"inserted": inserted, "skipped": skipped}


# =================== Queries ===================
async def _enrich_query(db, q, user_map=None):
    if user_map is None:
        users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
        user_map = {u["id"]: u for u in users}
    raised_by = user_map.get(q.get("query_raised_by_id")) if q.get("query_raised_by_id") else None
    return {
        **{k: v for k, v in q.items() if k != "_id"},
        "query_raised_by_name": raised_by.get("name") if raised_by else None,
    }


@router.get("/queries")
async def list_queries(
    return_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    q = {}
    if return_id:
        q["return_id"] = return_id
    if status:
        q["query_status"] = status
    if search:
        q["query_description"] = {"$regex": search, "$options": "i"}
    docs = await db.queries.find(q, {"_id": 0}).sort("created_at", -1).to_list(5000)
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    user_map = {u["id"]: u for u in users}
    return [await _enrich_query(db, x, user_map) for x in docs]


@router.post("/queries")
async def create_query(payload: QueryCreate, user: dict = Depends(get_current_user)):
    db = get_db()
    ret = await db.returns.find_one({"id": payload.return_id})
    if not ret:
        raise HTTPException(400, "Invalid return")
    now = utcnow().isoformat()
    doc = {
        "id": gen_id(),
        **payload.model_dump(),
        "query_raised_by_id": payload.query_raised_by_id or user["id"],
        "query_raised_date": payload.query_raised_date or utcnow().date().isoformat(),
        "query_closed_date": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.queries.insert_one(doc)
    await log_audit(db, user, "Queries", "Query Added", entity_id=doc["id"], new_value={"return_id": payload.return_id, "description": payload.query_description[:80]})
    doc.pop("_id", None)
    return await _enrich_query(db, doc)


@router.patch("/queries/{qid}")
async def update_query(qid: str, payload: QueryUpdate, user: dict = Depends(get_current_user)):
    db = get_db()
    existing = await db.queries.find_one({"id": qid})
    if not existing:
        raise HTTPException(404, "Query not found")
    update = payload.model_dump(exclude_none=True)
    # auto-close
    if update.get("query_status") == "Closed" and not existing.get("query_closed_date"):
        update["query_closed_date"] = utcnow().date().isoformat()
    update["updated_at"] = utcnow().isoformat()
    await db.queries.update_one({"id": qid}, {"$set": update})
    action = "Query Closed" if update.get("query_status") == "Closed" else "Query Updated"
    await log_audit(db, user, "Queries", action, entity_id=qid,
                    old_value={k: existing.get(k) for k in update},
                    new_value=update)
    return {"ok": True}


@router.delete("/queries/{qid}")
async def delete_query(qid: str, admin: dict = Depends(require_admin)):
    db = get_db()
    await db.queries.delete_one({"id": qid})
    await log_audit(db, admin, "Queries", "Delete", entity_id=qid)
    return {"ok": True}


QUERY_EXPORT_HEADERS = [
    "id", "return_id", "query_raised_by_name", "query_raised_date",
    "query_description", "query_status", "follow_up_date", "query_closed_date", "remarks"
]


@router.get("/queries/export/file")
async def export_queries(format: str = Query("xlsx"), status: Optional[str] = None, user: dict = Depends(get_current_user)):
    db = get_db()
    q = {}
    if status:
        q["query_status"] = status
    docs = await db.queries.find(q, {"_id": 0}).sort("created_at", -1).to_list(10000)
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    user_map = {u["id"]: u for u in users}
    enriched = [await _enrich_query(db, x, user_map) for x in docs]
    if format == "csv":
        data = to_csv(enriched, QUERY_EXPORT_HEADERS)
        return Response(content=data, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=queries.csv"})
    if format == "pdf":
        data = to_pdf(enriched, QUERY_EXPORT_HEADERS, "Queries Report")
        return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=queries.pdf"})
    data = to_xlsx(enriched, QUERY_EXPORT_HEADERS, "Queries")
    return Response(content=data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=queries.xlsx"})

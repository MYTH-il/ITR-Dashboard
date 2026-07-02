"""Dashboard, audit trail, and escalation routes."""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from datetime import datetime, timezone
from auth import get_current_user, require_admin
from db import get_db
from escalation import compute_breaches, run_escalation_job, days_in_stage, days_since
from seed_test_fixtures import seed_escalation_fixtures, remove_existing_fixtures

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/kpis")
async def kpis(user: dict = Depends(get_current_user)):
    db = get_db()
    stages = await db.workflow_stages.find({}, {"_id": 0}).to_list(200)
    name_by_id = {s["id"]: s["stage_name"] for s in stages}
    returns = await db.returns.find({}, {"_id": 0}).to_list(5000)
    total = len(returns)
    today = datetime.now(timezone.utc).date().isoformat()

    def stage_match(name_substring):
        ids = {sid for sid, n in name_by_id.items() if name_substring.lower() in n.lower()}
        return sum(1 for r in returns if r.get("current_stage_id") in ids)

    pending_verification = stage_match("DVP") + stage_match("DVQ") + stage_match("DVQT") + stage_match("DVNQ") + stage_match("Document Inward")
    ready_to_file = sum(1 for r in returns if (name_by_id.get(r.get("current_stage_id")) or "").upper() == "RTG")
    everif_pending = sum(1 for r in returns if (name_by_id.get(r.get("current_stage_id")) or "") == "Filed-Everification Pending")
    completed = sum(1 for r in returns if (name_by_id.get(r.get("current_stage_id")) or "").lower() == "completed")
    overdue = sum(1 for r in returns if r.get("due_date") and r["due_date"] < today and (name_by_id.get(r.get("current_stage_id")) or "").lower() != "completed")

    queries = await db.queries.find({}, {"_id": 0}).to_list(5000)
    queries_pending = sum(1 for q in queries if q.get("query_status") != "Closed")

    return {
        "total_returns": total,
        "pending_verification": pending_verification,
        "queries_pending": queries_pending,
        "ready_to_file": ready_to_file,
        "everification_pending": everif_pending,
        "completed_returns": completed,
        "overdue_returns": overdue,
    }


@router.get("/dashboard/funnel")
async def funnel(user: dict = Depends(get_current_user)):
    db = get_db()
    stages = await db.workflow_stages.find({"active": True}, {"_id": 0}).sort("sequence", 1).to_list(200)
    returns = await db.returns.find({}, {"_id": 0}).to_list(5000)
    total = len(returns) or 1
    result = []
    for s in stages:
        count = sum(1 for r in returns if r.get("current_stage_id") == s["id"])
        result.append({
            "stage_id": s["id"],
            "stage_name": s["stage_name"],
            "sequence": s["sequence"],
            "colour": s.get("dashboard_colour"),
            "count": count,
            "percentage": round(count * 100 / total, 1),
        })
    return result


@router.get("/dashboard/ageing-heatmap")
async def ageing_heatmap(user: dict = Depends(get_current_user)):
    db = get_db()
    stages = await db.workflow_stages.find({}, {"_id": 0}).to_list(200)
    completed_ids = {s["id"] for s in stages if s["stage_name"].lower() == "completed"}
    returns = await db.returns.find({}, {"_id": 0}).to_list(5000)
    buckets = {"0-3": 0, "4-7": 0, "8-15": 0, "15+": 0}
    bucket_returns = {"0-3": [], "4-7": [], "8-15": [], "15+": []}
    for r in returns:
        if r.get("current_stage_id") in completed_ids:
            continue
        d = days_in_stage(r.get("stage_entered_at") or r.get("created_at"))
        if d <= 3:
            buckets["0-3"] += 1
            bucket_returns["0-3"].append(r["id"])
        elif d <= 7:
            buckets["4-7"] += 1
            bucket_returns["4-7"].append(r["id"])
        elif d <= 15:
            buckets["8-15"] += 1
            bucket_returns["8-15"].append(r["id"])
        else:
            buckets["15+"] += 1
            bucket_returns["15+"].append(r["id"])
    return {"buckets": buckets, "return_ids": bucket_returns}


@router.get("/dashboard/sla")
async def sla_monitoring(user: dict = Depends(get_current_user)):
    db = get_db()
    data = await compute_breaches(db)
    # stage-wise delays
    stages = await db.workflow_stages.find({"active": True}, {"_id": 0}).sort("sequence", 1).to_list(200)
    returns = await db.returns.find({}, {"_id": 0}).to_list(5000)
    stage_delays = []
    for s in stages:
        if s["stage_name"].lower() == "completed":
            continue
        relevant = [r for r in returns if r.get("current_stage_id") == s["id"]]
        if not relevant:
            continue
        breached = 0
        avg_age = 0
        for r in relevant:
            d = days_in_stage(r.get("stage_entered_at") or r.get("created_at"))
            avg_age += d
            if s.get("sla_days", 0) > 0 and d > s["sla_days"]:
                breached += 1
        stage_delays.append({
            "stage_id": s["id"],
            "stage_name": s["stage_name"],
            "colour": s.get("dashboard_colour"),
            "count": len(relevant),
            "avg_age_days": round(avg_age / len(relevant), 1),
            "sla_days": s.get("sla_days"),
            "breaches": breached,
        })
    return {
        "sla_breaches": data["sla_breaches"],
        "upcoming_sla_breaches": data["upcoming_sla_breaches"],
        "stage_delays": stage_delays,
    }


@router.get("/dashboard/queries")
async def queries_dashboard(user: dict = Depends(get_current_user)):
    db = get_db()
    queries = await db.queries.find({}, {"_id": 0}).to_list(5000)
    statuses = {}
    for q in queries:
        s = q.get("query_status") or "Unknown"
        statuses[s] = statuses.get(s, 0) + 1
    return statuses


@router.get("/dashboard/team")
async def team_workload(user: dict = Depends(get_current_user)):
    db = get_db()
    users = await db.users.find({"active": True}, {"_id": 0, "password_hash": 0}).to_list(500)
    returns = await db.returns.find({}, {"_id": 0}).to_list(5000)
    queries = await db.queries.find({}, {"_id": 0}).to_list(5000)
    rows = []
    for u in users:
        assigned = [r for r in returns if r.get("person_assigned_id") == u["id"]]
        raised = [q for q in queries if q.get("query_raised_by_id") == u["id"]]
        closed = [q for q in raised if q.get("query_status") == "Closed"]
        pending = [q for q in raised if q.get("query_status") != "Closed"]
        rows.append({
            "user_id": u["id"],
            "name": u["name"],
            "email": u["email"],
            "role": u["role"],
            "returns_assigned": len(assigned),
            "queries_raised": len(raised),
            "queries_closed": len(closed),
            "queries_pending": len(pending),
        })
    rows.sort(key=lambda x: -x["returns_assigned"])
    return rows


@router.get("/audit-logs")
async def audit_logs(
    module: Optional[str] = None,
    user_id: Optional[str] = None,
    entity_id: Optional[str] = None,
    limit: int = Query(500, le=2000),
    current: dict = Depends(get_current_user),
):
    db = get_db()
    q = {}
    if module:
        q["module"] = module
    if user_id:
        q["user_id"] = user_id
    if entity_id:
        q["entity_id"] = entity_id
    docs = await db.audit_logs.find(q, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return docs


@router.get("/escalations")
async def escalations(current: dict = Depends(get_current_user)):
    db = get_db()
    data = await compute_breaches(db)
    logs = await db.escalation_log.find({}, {"_id": 0}).sort("notified_at", -1).limit(200).to_list(200)
    return {
        "breaches": data["escalation_breaches"],
        "logs": logs,
    }


# --------- Test / QA helpers (admin only) ---------
@router.post("/test-fixtures/escalations/seed")
async def admin_seed_escalation_fixtures(admin: dict = Depends(require_admin)):
    """Create deterministic escalation test data and run the escalation job once.

    Returns:
        scenarios: list of fixtures created (rin, label, return_id)
        breach_summary: breach counts produced
        escalation_log_count: number of escalation_log rows after run
    """
    db = get_db()
    created = await seed_escalation_fixtures(db)
    await run_escalation_job(db)
    breaches = await compute_breaches(db)
    log_count = await db.escalation_log.count_documents({})
    return {
        "scenarios": created,
        "breach_summary": {
            "sla_breaches": len(breaches["sla_breaches"]),
            "upcoming_sla_breaches": len(breaches["upcoming_sla_breaches"]),
            "escalation_breaches": len(breaches["escalation_breaches"]),
        },
        "escalation_log_count": log_count,
    }


@router.delete("/test-fixtures/escalations")
async def admin_clear_escalation_fixtures(admin: dict = Depends(require_admin)):
    db = get_db()
    await remove_existing_fixtures(db)
    return {"ok": True}


@router.post("/escalations/run")
async def admin_run_escalation_job(admin: dict = Depends(require_admin)):
    """Trigger the escalation scan immediately (instead of waiting for the scheduler)."""
    db = get_db()
    data = await run_escalation_job(db)
    return {"ok": True, "data": data}

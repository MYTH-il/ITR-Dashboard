"""Escalation engine - checks SLA breaches and logs escalations."""
import os
import logging
from datetime import datetime, timezone
from models import gen_id

logger = logging.getLogger(__name__)


def parse_iso(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def days_in_stage(stage_entered_at: str) -> int:
    dt = parse_iso(stage_entered_at)
    if not dt:
        return 0
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return max(0, (datetime.now(timezone.utc) - dt).days)


def days_since(created_at: str) -> int:
    return days_in_stage(created_at)


def return_stage_age_days(ret: dict) -> int:
    return days_in_stage(ret.get("stage_entered_at") or ret.get("return_inward_date") or ret.get("created_at"))


def return_total_age_days(ret: dict) -> int:
    return days_since(ret.get("return_inward_date") or ret.get("created_at"))


async def compute_breaches(db):
    """Compute current SLA / escalation breaches across all non-completed returns."""
    stages = await db.workflow_stages.find({}).to_list(100)
    stage_map = {s["id"]: s for s in stages}
    returns = await db.returns.find({}).to_list(5000)
    sla_breaches = []
    escalation_breaches = []
    upcoming = []
    for r in returns:
        stage = stage_map.get(r.get("current_stage_id"))
        if not stage:
            continue
        if (stage.get("stage_name") or "").lower() == "completed":
            continue
        d = return_stage_age_days(r)
        sla = int(stage.get("sla_days") or 0)
        esc = int(stage.get("escalation_days") or 0)
        item = {
            "return_id": r["id"],
            "return_inward_no": r.get("return_inward_no"),
            "client_name": r.get("client_name"),
            "stage_name": stage.get("stage_name"),
            "stage_colour": stage.get("dashboard_colour"),
            "days_in_stage": d,
            "sla_days": sla,
            "escalation_days": esc,
            "person_assigned_id": r.get("person_assigned_id"),
        }
        if sla > 0 and d > sla:
            sla_breaches.append(item)
        elif sla > 0 and d >= max(1, sla - 1):
            upcoming.append(item)
        if esc > 0 and d > esc:
            escalation_breaches.append({**item, "escalation_emails": stage.get("escalation_emails", [])})
    return {
        "sla_breaches": sla_breaches,
        "upcoming_sla_breaches": upcoming,
        "escalation_breaches": escalation_breaches,
    }


async def run_escalation_job(db):
    """Periodic job: identify escalations and create notification entries."""
    try:
        data = await compute_breaches(db)
        for esc in data["escalation_breaches"]:
            existing = await db.escalation_log.find_one({
                "return_id": esc["return_id"],
                "stage_name": esc["stage_name"],
            })
            if not existing:
                doc = {
                    "id": gen_id(),
                    "return_id": esc["return_id"],
                    "return_inward_no": esc["return_inward_no"],
                    "client_name": esc["client_name"],
                    "stage_name": esc["stage_name"],
                    "days_in_stage": esc["days_in_stage"],
                    "escalation_days": esc["escalation_days"],
                    "escalation_emails": esc["escalation_emails"],
                    "notified_at": datetime.now(timezone.utc).isoformat(),
                    "email_sent": False,
                    "email_status": "pending" if not os.environ.get("RESEND_API_KEY") else "queued",
                }
                await db.escalation_log.insert_one(doc)
                logger.info(f"ESCALATION: {esc['return_inward_no']} stuck at {esc['stage_name']} for {esc['days_in_stage']} days")
        return data
    except Exception as e:
        logger.exception("escalation job failed: %s", e)
        return None

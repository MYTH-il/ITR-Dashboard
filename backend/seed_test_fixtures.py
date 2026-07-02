"""Seed deterministic escalation/SLA test fixtures.

This creates a known set of returns + clients used by automated tests to verify:
  - SLA breach detection      (days_in_stage > stage.sla_days)
  - Escalation breach          (days_in_stage > stage.escalation_days)
  - Upcoming SLA breach        (days_in_stage close to sla_days)
  - Overdue returns            (due_date < today AND not Completed)
  - Escalation log creation     (one row per (return_id, stage_name) once breach is hit)

Convention: All fixture clients have file_no starting with 'TEST-' and Return Inward No.
starts with 'TEST-RIN-'. The seeder removes prior TEST-* fixtures before re-creating to
keep tests deterministic.
"""
import os
from datetime import datetime, timezone, timedelta
from models import gen_id, utcnow


# Each item: (rin_suffix, client_name, stage_name, days_in_stage, due_offset_days, scenario_label)
# stage SLA/escalation reference (from WORKFLOW_STAGES in seed.py):
#   DVQ     -> sla 3, escalation 7
#   DVQT    -> sla 5, escalation 10
#   RTG-CC  -> sla 3, escalation 6
#   RTG     -> sla 2, escalation 4
#   DVP     -> sla 5, escalation 10
TEST_RETURNS = [
    # (rin, client, stage, days_in_stage, due_offset_days, label)
    ("TEST-RIN-FRESH",        "Test Fresh Co.",        "DVQ",    1,   30,   "fresh"),         # well within SLA
    ("TEST-RIN-NEAR-SLA",     "Test Near SLA Co.",     "DVQ",    3,   25,   "near_sla"),      # at SLA edge -> upcoming
    ("TEST-RIN-SLA-BREACH",   "Test SLA Breach Co.",   "DVQ",    5,   20,   "sla_breach"),    # sla=3 breached, escalation=7 NOT yet
    ("TEST-RIN-ESCALATION",   "Test Escalation Co.",   "DVQ",    12,  15,   "escalation"),    # sla=3 + escalation=7 BOTH breached
    ("TEST-RIN-CRITICAL",     "Test Critical Co.",     "RTG-CC", 25,  10,   "critical"),      # escalation_days=6 → big breach
    ("TEST-RIN-OVERDUE",      "Test Overdue Co.",      "DVP",    2,   -5,   "overdue"),       # due in the past
    ("TEST-RIN-OVERDUE-ESC",  "Test Overdue+Esc Co.",  "RTG",    15,  -10,  "overdue_esc"),   # overdue + escalation
    ("TEST-RIN-COMPLETED",    "Test Done Co.",         "Completed", 30, -60,"completed"),    # excluded from breaches
]


async def remove_existing_fixtures(db):
    """Idempotent — wipes prior TEST-* rows so the seed is deterministic."""
    test_returns = await db.returns.find({"return_inward_no": {"$regex": "^TEST-RIN-"}}).to_list(100)
    test_return_ids = [r["id"] for r in test_returns]
    if test_return_ids:
        await db.queries.delete_many({"return_id": {"$in": test_return_ids}})
        await db.escalation_log.delete_many({"return_id": {"$in": test_return_ids}})
        await db.audit_logs.delete_many({"entity_id": {"$in": test_return_ids}})
        await db.returns.delete_many({"id": {"$in": test_return_ids}})
    await db.clients.delete_many({"file_no": {"$regex": "^TEST-"}})


async def seed_escalation_fixtures(db):
    """Create deterministic escalation test data. Safe to call repeatedly."""
    await remove_existing_fixtures(db)

    # Resolve stage map
    stages = await db.workflow_stages.find({}).to_list(200)
    stage_by_name = {s["stage_name"]: s for s in stages}

    # Resolve a test assignee
    users = await db.users.find({"role": "user", "active": True}).to_list(50)
    assignee_id = users[0]["id"] if users else None

    now = datetime.now(timezone.utc)
    created_ids = []
    for idx, (rin, client_name, stage_name, days_in_stage, due_offset, label) in enumerate(TEST_RETURNS):
        stage = stage_by_name.get(stage_name)
        if not stage:
            continue
        file_no = f"TEST-{idx + 1:03d}"
        client_doc = {
            "id": gen_id(),
            "file_no": file_no,
            "group": "Test Fixtures",
            "client_name": client_name,
            "category": "Test",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        await db.clients.insert_one(client_doc)

        stage_entered_at = (now - timedelta(days=days_in_stage)).isoformat()
        due_date = (now + timedelta(days=due_offset)).date().isoformat()
        ret_doc = {
            "id": gen_id(),
            "return_inward_no": rin,
            "return_inward_date": (now - timedelta(days=days_in_stage + 1)).date().isoformat(),
            "task_id": f"TEST-TASK-{idx + 1:03d}",
            "fy": "2024-25",
            "file_no": file_no,
            "group": "Test Fixtures",
            "client_name": client_name,
            "return_type": "Original",
            "itr_form": "ITR-1",
            "due_date": due_date,
            "current_stage_id": stage["id"],
            "stage_entered_at": stage_entered_at,
            "person_assigned_id": assignee_id,
            "remarks": f"Fixture scenario: {label}",
            "test_fixture": True,
            "scenario_label": label,
            "created_at": (now - timedelta(days=days_in_stage + 1)).isoformat(),
            "updated_at": stage_entered_at,
        }
        await db.returns.insert_one(ret_doc)
        created_ids.append({"id": ret_doc["id"], "rin": rin, "label": label})

    return created_ids

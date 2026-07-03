"""Seed required baseline data: admin user, workflow stages, and dropdown options."""
import os
from auth import hash_password, verify_password
from models import gen_id, utcnow


WORKFLOW_STAGES = [
    ("Document Inward", 1, "Verify documents received", "#64748b", 3, 6),
    ("DVP", 2, "Complete Document Verification", "#0ea5e9", 5, 10),
    ("DVQ", 3, "Send Queries", "#3b82f6", 3, 7),
    ("DVQT", 4, "Follow-up Client", "#6366f1", 5, 10),
    ("DVNQ", 5, "Start ITR Preparation", "#8b5cf6", 4, 8),
    ("IP-Q", 6, "Raise IP Queries", "#a855f7", 3, 7),
    ("IPVP", 7, "IP Verification & Processing", "#d946ef", 4, 8),
    ("RTG-Q", 8, "Send Return Generation Queries", "#ec4899", 3, 6),
    ("RTG-CC", 9, "Client Confirmation on Computation", "#f43f5e", 3, 6),
    ("RTG-C", 10, "Computation Approved", "#ef4444", 2, 5),
    ("RTG", 11, "File Return", "#f97316", 2, 4),
    ("Filed-Everification Pending", 12, "Complete E-verification", "#f59e0b", 3, 7),
    ("Filed-Everified", 13, "Initiate Scanning & Filing", "#eab308", 5, 10),
    ("Scanning & Filing", 14, "Archive Records", "#84cc16", 5, 10),
    ("Completed", 15, "No action required", "#10b981", 0, 0),
]

RETURN_TYPES = ["Original", "Revised", "Updated"]
QUERY_STATUSES = ["Open", "Awaiting Client", "Follow-up Required", "Closed"]
FY_VALUES = ["2024-25", "2023-24", "2022-23", "2021-22", "2020-21"]
ITR_FORMS = ["ITR-1", "ITR-2", "ITR-3", "ITR-4", "ITR-5", "ITR-6", "ITR-7"]

async def seed_users(db):
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@taxops.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@123")
    admin_name = os.environ.get("ADMIN_NAME", "Admin")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": gen_id(),
            "email": admin_email,
            "name": admin_name,
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "active": True,
            "created_at": utcnow().isoformat(),
        })
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})


async def seed_stages(db):
    if await db.workflow_stages.count_documents({}) == 0:
        docs = []
        for name, seq, action, colour, sla, esc in WORKFLOW_STAGES:
            docs.append({
                "id": gen_id(),
                "stage_name": name,
                "sequence": seq,
                "next_action_required": action,
                "dashboard_colour": colour,
                "sla_days": sla,
                "escalation_days": esc,
                "escalation_emails": [],
                "active": True,
                "created_at": utcnow().isoformat(),
                "updated_at": utcnow().isoformat(),
            })
        await db.workflow_stages.insert_many(docs)


async def seed_options(db):
    if await db.dropdown_options.count_documents({"category": "return_type"}) == 0:
        for i, v in enumerate(RETURN_TYPES):
            await db.dropdown_options.insert_one({
                "id": gen_id(),
                "category": "return_type",
                "value": v,
                "sequence": i,
                "active": True,
            })
    if await db.dropdown_options.count_documents({"category": "query_status"}) == 0:
        for i, v in enumerate(QUERY_STATUSES):
            await db.dropdown_options.insert_one({
                "id": gen_id(),
                "category": "query_status",
                "value": v,
                "sequence": i,
                "active": True,
            })
    if await db.dropdown_options.count_documents({"category": "fy"}) == 0:
        for i, v in enumerate(FY_VALUES):
            await db.dropdown_options.insert_one({
                "id": gen_id(),
                "category": "fy",
                "value": v,
                "sequence": i,
                "active": True,
            })
    if await db.dropdown_options.count_documents({"category": "itr_form"}) == 0:
        for i, v in enumerate(ITR_FORMS):
            await db.dropdown_options.insert_one({
                "id": gen_id(),
                "category": "itr_form",
                "value": v,
                "sequence": i,
                "active": True,
            })


async def run_all_seeds(db):
    await seed_users(db)
    await seed_stages(db)
    await seed_options(db)

"""Seed initial data: admin user, workflow stages, dropdown options, demo data."""
import os
from datetime import datetime, timezone, timedelta
from auth import hash_password, verify_password
from models import gen_id, utcnow
import random


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

DEMO_USERS = [
    ("priya.sharma@taxops.com", "Priya Sharma", "User@123"),
    ("rahul.mehta@taxops.com", "Rahul Mehta", "User@123"),
    ("anita.desai@taxops.com", "Anita Desai", "User@123"),
]

DEMO_CLIENTS = [
    ("F-0001", "Sharma Group", "Vikram Sharma", "Individual"),
    ("F-0002", "Sharma Group", "Sharma Trading Pvt Ltd", "Company"),
    ("F-0003", "Mehta Holdings", "Rajesh Mehta", "Individual"),
    ("F-0004", "Mehta Holdings", "Mehta Builders LLP", "LLP"),
    ("F-0005", "Independent", "Sneha Kapoor", "Individual"),
    ("F-0006", "Independent", "Arjun Reddy", "Individual"),
    ("F-0007", "Patel Enterprises", "Patel Textiles Pvt Ltd", "Company"),
    ("F-0008", "Patel Enterprises", "Kirti Patel", "Individual"),
    ("F-0009", "Independent", "Meera Joshi HUF", "HUF"),
    ("F-0010", "Singh Group", "Harpreet Singh", "Individual"),
]


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

    for email, name, pwd in DEMO_USERS:
        if not await db.users.find_one({"email": email}):
            await db.users.insert_one({
                "id": gen_id(),
                "email": email,
                "name": name,
                "password_hash": hash_password(pwd),
                "role": "user",
                "active": True,
                "created_at": utcnow().isoformat(),
            })


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


async def seed_clients(db):
    if await db.clients.count_documents({}) == 0:
        for file_no, group, name, category in DEMO_CLIENTS:
            await db.clients.insert_one({
                "id": gen_id(),
                "file_no": file_no,
                "group": group,
                "client_name": name,
                "category": category,
                "created_at": utcnow().isoformat(),
                "updated_at": utcnow().isoformat(),
            })


async def seed_returns(db):
    if await db.returns.count_documents({}) > 0:
        return
    stages = await db.workflow_stages.find({}).sort("sequence", 1).to_list(100)
    clients = await db.clients.find({}).to_list(100)
    users = await db.users.find({"role": "user", "active": True}).to_list(100)
    if not stages or not clients or not users:
        return

    random.seed(42)
    return_types = ["Original", "Revised", "Updated"]
    itr_forms = ["ITR-1", "ITR-2", "ITR-3", "ITR-4", "ITR-5", "ITR-6"]
    now = datetime.now(timezone.utc)

    for idx, client in enumerate(clients):
        # 1-2 returns per client
        for j in range(random.choice([1, 1, 2])):
            stage = random.choice(stages)
            days_ago = random.randint(1, 40)
            inward_date = (now - timedelta(days=days_ago)).date().isoformat()
            stage_entered_at = (now - timedelta(days=random.randint(0, days_ago))).isoformat()
            due_date = (now + timedelta(days=random.randint(-5, 30))).date().isoformat()
            await db.returns.insert_one({
                "id": gen_id(),
                "return_inward_no": f"RIN-2025-{(idx*2+j+1):04d}",
                "return_inward_date": inward_date,
                "task_id": f"TASK-{(idx*2+j+1):04d}",
                "fy": "2024-25",
                "file_no": client["file_no"],
                "group": client["group"],
                "client_name": client["client_name"],
                "return_type": random.choice(return_types),
                "itr_form": random.choice(itr_forms),
                "due_date": due_date,
                "current_stage_id": stage["id"],
                "stage_entered_at": stage_entered_at,
                "person_assigned_id": random.choice(users)["id"],
                "remarks": "",
                "created_at": (now - timedelta(days=days_ago)).isoformat(),
                "updated_at": stage_entered_at,
            })


async def write_test_credentials():
    # Original path was /app/memory -- a path specific to Emergent's own
    # container layout, not writable outside it. Using a path relative to
    # this file's own directory instead, so it works regardless of where
    # the repo is cloned or who owns it.
    memory_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "memory")
    os.makedirs(memory_dir, exist_ok=True)
    content = f"""# Test Credentials

## Admin
- Email: {os.environ.get('ADMIN_EMAIL', 'admin@taxops.com')}
- Password: {os.environ.get('ADMIN_PASSWORD', 'Admin@123')}
- Role: admin

## Demo Users (role: user, password: User@123)
- priya.sharma@taxops.com
- rahul.mehta@taxops.com
- anita.desai@taxops.com

## Auth Endpoints
- POST /api/auth/login
- GET  /api/auth/me
- POST /api/auth/logout
"""
    with open(os.path.join(memory_dir, "test_credentials.md"), "w") as f:
        f.write(content)


async def run_all_seeds(db):
    await seed_users(db)
    await seed_stages(db)
    await seed_options(db)
    await seed_clients(db)
    await seed_returns(db)
    await write_test_credentials()

"""Audit trail helpers."""
from datetime import datetime, timezone
from models import gen_id


async def log_audit(db, user: dict, module: str, action: str, entity_id: str = "", old_value=None, new_value=None):
    doc = {
        "id": gen_id(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user_id": user.get("id"),
        "user_name": user.get("name"),
        "user_email": user.get("email"),
        "module": module,
        "action": action,
        "entity_id": entity_id,
        "old_value": old_value,
        "new_value": new_value,
    }
    await db.audit_logs.insert_one(doc)

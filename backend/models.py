"""Pydantic models for the ITR Operations system."""
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime, timezone
import uuid


def utcnow():
    return datetime.now(timezone.utc)


def gen_id():
    return str(uuid.uuid4())


# ===== Users =====
class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str
    role: str = "user"  # admin | user
    active: bool = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None
    password: Optional[str] = None


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    active: bool
    created_at: datetime


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ===== Clients =====
class ClientCreate(BaseModel):
    file_no: str
    group: str = ""
    client_name: str
    category: str = ""


class ClientUpdate(BaseModel):
    file_no: Optional[str] = None
    group: Optional[str] = None
    client_name: Optional[str] = None
    category: Optional[str] = None


# ===== Workflow Stages =====
class StageCreate(BaseModel):
    stage_name: str
    sequence: int
    next_action_required: str = ""
    dashboard_colour: str = "#10b981"
    sla_days: int = 7
    escalation_days: int = 14
    escalation_emails: List[str] = []
    active: bool = True


class StageUpdate(BaseModel):
    stage_name: Optional[str] = None
    sequence: Optional[int] = None
    next_action_required: Optional[str] = None
    dashboard_colour: Optional[str] = None
    sla_days: Optional[int] = None
    escalation_days: Optional[int] = None
    escalation_emails: Optional[List[str]] = None
    active: Optional[bool] = None


class StageReorder(BaseModel):
    ordered_ids: List[str]


# ===== Dropdown Options (return_type, query_status) =====
class OptionCreate(BaseModel):
    category: str  # 'return_type' | 'query_status'
    value: str
    sequence: int = 0
    active: bool = True


class OptionUpdate(BaseModel):
    value: Optional[str] = None
    sequence: Optional[int] = None
    active: Optional[bool] = None


# ===== Returns =====
class ReturnCreate(BaseModel):
    return_inward_no: str
    return_inward_date: str  # ISO date
    task_id: Optional[str] = ""
    fy: str  # e.g. 2024-25
    file_no: str
    group: Optional[str] = ""
    client_name: str
    return_type: str
    itr_form: Optional[str] = ""
    due_date: Optional[str] = ""  # ISO date
    current_stage_id: str
    person_assigned_id: Optional[str] = None
    remarks: Optional[str] = ""


class ReturnUpdate(BaseModel):
    return_inward_no: Optional[str] = None
    return_inward_date: Optional[str] = None
    task_id: Optional[str] = None
    fy: Optional[str] = None
    file_no: Optional[str] = None
    group: Optional[str] = None
    client_name: Optional[str] = None
    return_type: Optional[str] = None
    itr_form: Optional[str] = None
    due_date: Optional[str] = None
    current_stage_id: Optional[str] = None
    person_assigned_id: Optional[str] = None
    remarks: Optional[str] = None


class ReassignRequest(BaseModel):
    person_assigned_id: Optional[str] = None


# ===== Queries =====
class QueryCreate(BaseModel):
    return_id: str
    query_raised_by_id: Optional[str] = None
    query_raised_date: Optional[str] = None  # ISO date
    query_description: str
    query_status: str = "Open"
    follow_up_date: Optional[str] = None
    remarks: Optional[str] = ""


class QueryUpdate(BaseModel):
    query_description: Optional[str] = None
    query_status: Optional[str] = None
    follow_up_date: Optional[str] = None
    query_closed_date: Optional[str] = None
    remarks: Optional[str] = None

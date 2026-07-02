"""ITR Operations Management - FastAPI main entry."""
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import logging
import asyncio
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from db import init_db, get_db, close_db
from seed import run_all_seeds
from escalation import run_escalation_job

from routes_auth import router as auth_router
from routes_masters import router as masters_router
from routes_returns import router as returns_router
from routes_dashboard import router as dashboard_router

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="ITR Operations Management")

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"status": "ok", "service": "ITR Operations Management"}


api_router.include_router(auth_router)
api_router.include_router(masters_router)
api_router.include_router(returns_router)
api_router.include_router(dashboard_router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

scheduler = None


@app.on_event("startup")
async def startup():
    db = init_db()
    await db.users.create_index("email", unique=True)
    await db.clients.create_index("file_no")
    await db.workflow_stages.create_index("sequence")
    await db.returns.create_index("return_inward_no", unique=True)
    await db.returns.create_index("current_stage_id")
    await db.returns.create_index("person_assigned_id")
    await db.queries.create_index("return_id")
    await db.audit_logs.create_index("timestamp")

    await run_all_seeds(db)

    global scheduler
    interval = int(os.environ.get("ESCALATION_CHECK_INTERVAL_MINUTES", "30"))
    scheduler = AsyncIOScheduler()
    scheduler.add_job(lambda: asyncio.create_task(run_escalation_job(db)), "interval", minutes=interval, next_run_time=None)
    scheduler.start()
    asyncio.create_task(run_escalation_job(db))
    logger.info("Startup complete. Escalation scheduler interval=%s min", interval)


@app.on_event("shutdown")
async def shutdown():
    global scheduler
    if scheduler:
        scheduler.shutdown(wait=False)
    await close_db()

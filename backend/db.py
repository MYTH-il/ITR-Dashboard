"""MongoDB connection."""
import os
from motor.motor_asyncio import AsyncIOMotorClient

_client = None
_db = None


def init_db():
    global _client, _db
    _client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    _db = _client[os.environ["DB_NAME"]]
    return _db


def get_db():
    if _db is None:
        return init_db()
    return _db


async def close_db():
    if _client:
        _client.close()

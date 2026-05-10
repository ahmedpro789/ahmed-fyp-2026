import os
import certifi
import copy
import asyncio
import anthropic
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import List, Dict, Optional
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import CollectionInvalid, OperationFailure
from datetime import datetime, timedelta
from scraper import WebScraper
from vector_store import VectorStore
from dotenv import load_dotenv
from bson import ObjectId
import bcrypt
import jwt
import json
import ipaddress
import re
import sys
from urllib.parse import urlparse

load_dotenv()

# Windows consoles can default to cp1252; force UTF-8 output so log emojis
# from scraper/background jobs never crash the process.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# ═══════════════════════════════════════════════════════
# PASSWORD HASHING
# ═══════════════════════════════════════════════════════

def hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(rounds=12),
    ).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain.encode("utf-8"),
            hashed.encode("utf-8"),
        )
    except (ValueError, TypeError):
        return False

# ═══════════════════════════════════════════════════════
# JWT CONFIG
# ═══════════════════════════════════════════════════════

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    # FIX: Never fall back to a hardcoded secret — fail loudly at startup
    raise ValueError("JWT_SECRET is missing in .env — set a strong random secret")

JWT_ALGORITHM    = "HS256"
JWT_EXPIRE_HOURS = 24 * 7  # 7 days

security = HTTPBearer()

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    return decode_token(credentials.credentials)

def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    payload = decode_token(credentials.credentials)
    return payload["sub"]

# ═══════════════════════════════════════════════════════
# SSRF GUARD
# FIX: Validate that user-supplied scrape URLs point to
#      public internet addresses only — never internal IPs.
# ═══════════════════════════════════════════════════════

_PRIVATE_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]

def _is_safe_url(url: str) -> bool:
    """Return True only for http/https URLs pointing to public IP ranges."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        hostname = parsed.hostname
        if not hostname:
            return False
        # Reject raw private IPs
        try:
            addr = ipaddress.ip_address(hostname)
            return not any(addr in net for net in _PRIVATE_NETWORKS)
        except ValueError:
            # It's a hostname — reject obviously internal names
            bad_suffixes = (".local", ".internal", ".localhost", ".corp", ".lan")
            return not any(hostname.lower().endswith(s) for s in bad_suffixes)
    except Exception:
        return False

def validate_scrape_urls(urls: List[str]) -> List[str]:
    safe = [u for u in urls if _is_safe_url(u)]
    rejected = set(urls) - set(safe)
    if rejected:
        raise HTTPException(400, f"Rejected unsafe URLs: {list(rejected)}")
    return safe

def _is_valid_gmail(email: str) -> bool:
    if not email:
        return False
    return bool(re.fullmatch(r"[A-Za-z0-9._%+-]+@gmail\.com", email.strip().lower()))

def _is_strong_password(password: str) -> bool:
    """
    Minimum security baseline:
    - at least 8 chars
    - 1 uppercase, 1 lowercase, 1 digit, 1 special char
    """
    if not password or len(password) < 8:
        return False
    has_upper = re.search(r"[A-Z]", password) is not None
    has_lower = re.search(r"[a-z]", password) is not None
    has_digit = re.search(r"\d", password) is not None
    has_special = re.search(r"[^A-Za-z0-9]", password) is not None
    return has_upper and has_lower and has_digit and has_special

# ═══════════════════════════════════════════════════════
# MONGODB — TWO CLIENTS
# ═══════════════════════════════════════════════════════

MONGO_URI      = os.getenv("MONGO_URI")
MONGO_URI_READ = os.getenv("MONGO_URI_READ")

if not MONGO_URI:
    raise ValueError("MONGO_URI is missing in .env")
if not MONGO_URI_READ:
    raise ValueError("MONGO_URI_READ is missing in .env")

_rw_client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
mongo_db   = _rw_client["scholar_ai"]

_ro_client  = MongoClient(MONGO_URI_READ, tlsCAFile=certifi.where())
mongo_db_read = _ro_client["scholar_ai"]

# Write collections
users_col         = mongo_db["users"]
posts_col         = mongo_db["posts"]
messages_col      = mongo_db["messages"]
conversations_col = mongo_db["conversations"]
dm_messages_col   = mongo_db["dm_messages"]
dm_threads_col    = mongo_db["dm_threads"]
scholarships_col  = mongo_db["scholarships"]
internships_col   = mongo_db["internships"]
applications_col  = mongo_db["applications"]
notifications_col = mongo_db["notifications"]

# Read collections
r_users_col       = mongo_db_read["users"]
r_posts_col       = mongo_db_read["posts"]
r_messages_col    = mongo_db_read["messages"]
r_dm_messages_col = mongo_db_read["dm_messages"]
r_dm_threads_col  = mongo_db_read["dm_threads"]
r_scholarships_col  = mongo_db_read["scholarships"]
r_internships_col   = mongo_db_read["internships"]
r_applications_col  = mongo_db_read["applications"]
r_notifications_col = mongo_db_read["notifications"]

from opportunity_scraper import persist_opportunities_from_chunks

def _ensure_collection(name: str, validator: dict) -> None:
    try:
        mongo_db.create_collection(name, validator=validator)
    except CollectionInvalid:
        pass
    except OperationFailure:
        # Atlas shared tiers may restrict collMod/create validators; continue safely.
        pass


def init_database_schema() -> None:
    _ensure_collection(
        "users",
        {
            "$jsonSchema": {
                "bsonType": "object",
                "required": ["name", "email", "password", "user_type", "created_at"],
                "properties": {
                    "name": {"bsonType": "string"},
                    "email": {"bsonType": "string"},
                    "password": {"bsonType": "string"},
                    "user_type": {"enum": ["student", "recruiter"]},
                    "handle": {"bsonType": ["string", "null"]},
                    "avatar": {"bsonType": ["string", "null"]},
                    "bio": {"bsonType": ["string", "null"]},
                    "profile": {"bsonType": ["object", "null"]},
                    "followers": {"bsonType": "array"},
                    "following": {"bsonType": "array"},
                    "saved_posts": {"bsonType": "array"},
                    "created_at": {"bsonType": "date"},
                    "updated_at": {"bsonType": ["date", "null"]},
                },
            }
        },
    )

    _ensure_collection(
        "posts",
        {
            "$jsonSchema": {
                "bsonType": "object",
                "required": ["user_id", "text", "tag", "created_at"],
                "properties": {
                    "user_id": {"bsonType": "string"},
                    "text": {"bsonType": "string"},
                    "tag": {"bsonType": "string"},
                    "likes": {"bsonType": ["int", "long"]},
                    "liked_by": {"bsonType": "array"},
                    "comments": {"bsonType": "array"},
                    "saved_by": {"bsonType": "array"},
                    "created_at": {"bsonType": "date"},
                    "updated_at": {"bsonType": ["date", "null"]},
                },
            }
        },
    )

    _ensure_collection(
        "messages",
        {
            "$jsonSchema": {
                "bsonType": "object",
                "required": ["user_id", "conversation_id", "role", "content", "timestamp"],
                "properties": {
                    "user_id": {"bsonType": "string"},
                    "conversation_id": {"bsonType": "string"},
                    "role": {"enum": ["user", "assistant"]},
                    "content": {"bsonType": "string"},
                    "sources": {"bsonType": ["array", "null"]},
                    "timestamp": {"bsonType": "date"},
                },
            }
        },
    )

    _ensure_collection(
        "conversations",
        {
            "$jsonSchema": {
                "bsonType": "object",
                "required": ["user_id", "bot_type", "created_at"],
                "properties": {
                    "user_id": {"bsonType": "string"},
                    "title": {"bsonType": ["string", "null"]},
                    "bot_type": {"enum": ["merit", "need", "phd", "intern", "general", "funded"]},
                    "created_at": {"bsonType": "date"},
                    "updated_at": {"bsonType": ["date", "null"]},
                },
            }
        },
    )

    _ensure_collection(
        "dm_threads",
        {
            "$jsonSchema": {
                "bsonType": "object",
                "required": ["thread_id", "participants", "created_at", "updated_at"],
                "properties": {
                    "thread_id": {"bsonType": "string"},
                    "participants": {"bsonType": "array"},
                    "created_at": {"bsonType": "date"},
                    "updated_at": {"bsonType": "date"},
                },
            }
        },
    )

    _ensure_collection(
        "dm_messages",
        {
            "$jsonSchema": {
                "bsonType": "object",
                "required": ["thread_id", "sender_id", "text", "read", "created_at"],
                "properties": {
                    "thread_id": {"bsonType": "string"},
                    "sender_id": {"bsonType": "string"},
                    "sender_name": {"bsonType": ["string", "null"]},
                    "text": {"bsonType": "string"},
                    "read": {"bsonType": "bool"},
                    "created_at": {"bsonType": "date"},
                },
            }
        },
    )

    _ensure_collection(
        "scholarships",
        {
            "$jsonSchema": {
                "bsonType": "object",
                "required": ["title", "type", "country", "deadline", "apply_url", "created_at"],
                "properties": {
                    "title": {"bsonType": "string"},
                    "type": {"enum": ["merit", "need", "phd", "funded"]},
                    "country": {"bsonType": "string"},
                    "university": {"bsonType": "string"},
                    "amount": {"bsonType": ["double", "int", "long", "decimal", "null"]},
                    "deadline": {"bsonType": "date"},
                    "eligibility": {"bsonType": "string"},
                    "source_url": {"bsonType": "string"},
                    "apply_url": {"bsonType": "string"},
                    "is_fully_funded": {"bsonType": "bool"},
                    "scraped_at": {"bsonType": "date"},
                    "created_at": {"bsonType": "date"},
                    "updated_at": {"bsonType": ["date", "null"]},
                },
            }
        },
    )

    _ensure_collection(
        "internships",
        {
            "$jsonSchema": {
                "bsonType": "object",
                "required": ["title", "company", "location", "deadline", "apply_url", "created_at"],
                "properties": {
                    "title": {"bsonType": "string"},
                    "company": {"bsonType": "string"},
                    "location": {"bsonType": "string"},
                    "is_paid": {"bsonType": "bool"},
                    "stipend": {"bsonType": ["double", "int", "long", "decimal", "null"]},
                    "duration_weeks": {"bsonType": ["int", "long", "null"]},
                    "deadline": {"bsonType": "date"},
                    "field": {"bsonType": "string"},
                    "apply_url": {"bsonType": "string"},
                    "scraped_at": {"bsonType": "date"},
                    "created_at": {"bsonType": "date"},
                    "updated_at": {"bsonType": ["date", "null"]},
                },
            }
        },
    )

    _ensure_collection(
        "applications",
        {
            "$jsonSchema": {
                "bsonType": "object",
                "required": ["user_id", "item_id", "item_type", "status", "created_at"],
                "properties": {
                    "user_id": {"bsonType": "string"},
                    "item_id": {"bsonType": "string"},
                    "item_type": {"enum": ["scholarship", "internship"]},
                    "status": {"enum": ["saved", "applied", "rejected"]},
                    "notes": {"bsonType": ["string", "null"]},
                    "applied_at": {"bsonType": ["date", "null"]},
                    "created_at": {"bsonType": "date"},
                    "updated_at": {"bsonType": ["date", "null"]},
                },
            }
        },
    )

    _ensure_collection(
        "notifications",
        {
            "$jsonSchema": {
                "bsonType": "object",
                "required": ["user_id", "type", "message", "is_read", "created_at"],
                "properties": {
                    "user_id": {"bsonType": "string"},
                    "type": {"enum": ["deadline", "new", "message"]},
                    "message": {"bsonType": "string"},
                    "ref_id": {"bsonType": ["string", "null"]},
                    "is_read": {"bsonType": "bool"},
                    "created_at": {"bsonType": "date"},
                },
            }
        },
    )

    scholarships_col.create_index([("deadline", ASCENDING)])
    scholarships_col.create_index([("type", ASCENDING), ("country", ASCENDING)])
    scholarships_col.create_index([("title", "text"), ("eligibility", "text"), ("university", "text")])
    scholarships_col.create_index([("dedupe_key", ASCENDING)], unique=True, sparse=True)

    internships_col.create_index([("deadline", ASCENDING)])
    internships_col.create_index([("location", ASCENDING), ("field", ASCENDING)])
    internships_col.create_index([("title", "text"), ("company", "text"), ("field", "text")])
    internships_col.create_index([("dedupe_key", ASCENDING)], unique=True, sparse=True)

    applications_col.create_index(
        [("user_id", ASCENDING), ("item_type", ASCENDING), ("item_id", ASCENDING)],
        unique=True,
    )
    applications_col.create_index([("user_id", ASCENDING), ("status", ASCENDING)])

    notifications_col.create_index([("user_id", ASCENDING), ("is_read", ASCENDING), ("created_at", DESCENDING)])

    users_col.create_index([("email", ASCENDING)], unique=True)
    users_col.create_index([("handle", ASCENDING)], unique=True, sparse=True)

    posts_col.create_index([("created_at", DESCENDING)])
    posts_col.create_index([("tag", ASCENDING), ("created_at", DESCENDING)])
    posts_col.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])

    messages_col.create_index([("user_id", ASCENDING), ("conversation_id", ASCENDING), ("timestamp", ASCENDING)])
    conversations_col.create_index([("user_id", ASCENDING), ("updated_at", DESCENDING)])

    dm_threads_col.create_index([("thread_id", ASCENDING)], unique=True)
    dm_threads_col.create_index([("participants", ASCENDING), ("updated_at", DESCENDING)])
    dm_messages_col.create_index([("thread_id", ASCENDING), ("created_at", ASCENDING)])

# ═══════════════════════════════════════════════════════
# ANTHROPIC / RAG CONFIG
# ═══════════════════════════════════════════════════════

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
if not ANTHROPIC_API_KEY:
    raise ValueError("ANTHROPIC_API_KEY is missing in .env")

# FIX: Corrected model identifier
CLAUDE_MODEL = "claude-sonnet-4-5-20251001"

URLS_TO_SCRAPE: List[str] = [
    "https://scholarshiproar.com/",
    "https://www.scholarships.com/",
    "https://www.scholars4dev.com/",
    "https://opportunitiescorners.com/scholarships/",
    "https://www.scholars4dev.com/category/scholarships/",
    "https://opportunitiescorners.com/category/internships/",
    "https://hec.gov.pk/english/scholarshipsgrants/Pages/default.aspx",
]

TOP_K_CHUNKS = 5

claude_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
scraper       = WebScraper()
vector_store  = VectorStore()

_scheduler: BackgroundScheduler | None = None

# ═══════════════════════════════════════════════════════
# BOT PROMPTS
# ═══════════════════════════════════════════════════════

BOT_SYSTEM_PROMPTS = {
    "funded":  "You are FullFund Bot. Focus only on fully-funded scholarships covering tuition, living, flights, and insurance.",
    "merit":   "You are Merit Advisor. Focus on merit-based scholarships, required GPA, and academic excellence programs.",
    "need":    "You are Need-Based Aid advisor. Focus on financial aid, grants, FAFSA, and means-tested programs.",
    "intern":  "You are Internship Pro. Focus on internships, career advice, CVs, and connecting students with recruiters.",
    "phd":     "You are PhD Guide. Focus on doctoral programs, research funding, and supervisor relationships.",
    "general": None,
}

# ═══════════════════════════════════════════════════════
# SCHEMA FIELD WHITELISTS
# ═══════════════════════════════════════════════════════

_USER_MUTABLE_FIELDS   = {"name", "handle", "avatar", "bio", "profile", "followers", "following", "saved_posts", "updated_at"}
_USER_IMMUTABLE_FIELDS = {"email", "password", "user_type", "created_at", "_id"}
_POST_MUTABLE_FIELDS   = {"text", "tag", "updated_at"}
_POST_COUNTER_FIELDS   = {"likes", "liked_by", "saved_by", "comments"}

def _strip_immutable(doc: dict, immutable: set) -> dict:
    return {k: v for k, v in doc.items() if k not in immutable}

def _whitelist(doc: dict, allowed: set) -> dict:
    return {k: v for k, v in doc.items() if k in allowed}

# ═══════════════════════════════════════════════════════
# SCRAPE JOB
# ═══════════════════════════════════════════════════════

def run_scrape(urls: List[str] | None = None, reset: bool = False) -> Dict:
    target_urls = urls or URLS_TO_SCRAPE
    if reset:
        vector_store.clear()
    chunks = scraper.scrape_urls(target_urls)
    opp_stats = persist_opportunities_from_chunks(chunks, scholarships_col, internships_col)
    if not chunks:
        return {"chunks_added": 0, "total": vector_store.count(), **opp_stats}
    added = 0
    for chunk in chunks:
        stored = vector_store.add_chunks(
            chunks=[chunk["text"]],
            url=chunk["url"],
            metadata_extra={
                "source_domain": chunk["source_domain"],
                "scraped_at":    chunk["scraped_at"],
            },
        )
        added += stored
    return {"chunks_added": added, "total": vector_store.count(), **opp_stats}


def run_opportunity_scrape_only() -> Dict:
    """Re-crawl seed URLs and refresh scholarships/internships without touching the vector DB."""
    chunks = scraper.scrape_urls(URLS_TO_SCRAPE)
    stats = persist_opportunities_from_chunks(chunks, scholarships_col, internships_col)
    return {"mode": "opportunities_only", **stats}

def seed_dummy_content() -> None:
    if posts_col.count_documents({}) == 0:
        now = datetime.utcnow()
        posts_col.insert_many([
            {
                "user_id": "seed_user_1",
                "user_name": "Ayesha Raza",
                "user_handle": "ayesharaza",
                "user_type": "student",
                "user_avatar": "AR",
                "text": "Got selected for a fully funded scholarship. Happy to help with SOP reviews.",
                "tag": "Achievement",
                "likes": 41,
                "liked_by": [],
                "comments": [{"comment_id": str(ObjectId()), "user_id": "seed_user_2", "user_name": "Hamza", "user_handle": "hamza", "user_avatar": "H", "text": "Congrats! Please share tips.", "created_at": now}],
                "saved_by": [],
                "created_at": now - timedelta(hours=8),
                "updated_at": None,
            },
            {
                "user_id": "seed_user_2",
                "user_name": "Bilal Ahmed",
                "user_handle": "bilalahmed",
                "user_type": "student",
                "user_avatar": "BA",
                "text": "DAAD applicants should prepare language certificates early.",
                "tag": "Tip",
                "likes": 23,
                "liked_by": [],
                "comments": [],
                "saved_by": [],
                "created_at": now - timedelta(hours=4),
                "updated_at": None,
            },
        ])

    if scholarships_col.count_documents({}) == 0:
        now = datetime.utcnow()
        scholarships_col.insert_many([
            {
                "title": "Chevening Scholarship 2026",
                "type": "funded",
                "country": "United Kingdom",
                "university": "Multiple Universities",
                "amount": None,
                "deadline": now + timedelta(days=90),
                "eligibility": "Strong academic profile and leadership potential",
                "source_url": "https://www.chevening.org/",
                "apply_url": "https://www.chevening.org/apply/",
                "is_fully_funded": True,
                "scraped_at": now,
                "created_at": now,
                "updated_at": None,
            },
            {
                "title": "DAAD EPOS Scholarship",
                "type": "merit",
                "country": "Germany",
                "university": "Partner Universities",
                "amount": None,
                "deadline": now + timedelta(days=120),
                "eligibility": "Relevant bachelor degree and professional experience",
                "source_url": "https://www.daad.de/",
                "apply_url": "https://www.daad.de/en/study-and-research-in-germany/scholarships/",
                "is_fully_funded": True,
                "scraped_at": now,
                "created_at": now,
                "updated_at": None,
            },
        ])

    if internships_col.count_documents({}) == 0:
        now = datetime.utcnow()
        internships_col.insert_many([
            {
                "title": "Software Engineering Intern",
                "company": "TechBridge",
                "location": "Remote",
                "is_paid": True,
                "stipend": 60000,
                "duration_weeks": 12,
                "deadline": now + timedelta(days=45),
                "field": "Software Engineering",
                "apply_url": "https://example.com/internship/apply",
                "scraped_at": now,
                "created_at": now,
                "updated_at": None,
            }
        ])

# ═══════════════════════════════════════════════════════
# LIFESPAN
# ═══════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler
    init_database_schema()
    seed_dummy_content()
    if vector_store.count() == 0:
        # FIX: Use asyncio.to_thread (Python 3.9+) — non-blocking, no deprecated get_event_loop()
        asyncio.create_task(asyncio.to_thread(run_scrape))
    else:
        n_opp = scholarships_col.count_documents({}) + internships_col.count_documents({})
        if n_opp < 8:
            asyncio.create_task(asyncio.to_thread(run_opportunity_scrape_only))
    if _scheduler is None:
        _scheduler = BackgroundScheduler()
        _scheduler.add_job(
            run_scrape, CronTrigger(hour=2, minute=0),
            id="nightly_scrape", replace_existing=True,
        )
        _scheduler.add_job(
            run_opportunity_scrape_only, CronTrigger(hour=14, minute=0),
            id="midday_opportunities", replace_existing=True,
        )
        _scheduler.start()
    yield
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)

# ═══════════════════════════════════════════════════════
# APP
# ═══════════════════════════════════════════════════════

# FIX: Wildcard origin + allow_credentials=True is rejected by browsers
#      and is a security misconfiguration. Default to localhost only.
_raw_origins    = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173",
)
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app = FastAPI(title="ScholarAI API", version="5.1", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ═══════════════════════════════════════════════════════
# WEBSOCKET CONNECTION MANAGER
# ═══════════════════════════════════════════════════════

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections.setdefault(user_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str):
        conns = self.active_connections.get(user_id, [])
        if websocket in conns:
            conns.remove(websocket)
        if not conns:
            self.active_connections.pop(user_id, None)

    async def send_to_user(self, user_id: str, message: dict):
        dead = []
        for ws in self.active_connections.get(user_id, []):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, user_id)

    def is_online(self, user_id: str) -> bool:
        return bool(self.active_connections.get(user_id))


manager = ConnectionManager()

# ═══════════════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════════════

class ChatRequest(BaseModel):
    question: str
    conversation_history: List[dict] = []
    conversation_id: Optional[str] = None   # FIX: proper per-conversation ID
    bot_type: str = "general"

class ScrapeRequest(BaseModel):
    urls: List[str] = []
    reset: bool = False

class SignupRequest(BaseModel):
    name: str
    email: str
    password: str
    user_type: str = "student"
    university: Optional[str] = None
    degree: Optional[str] = None
    major: Optional[str] = None
    country: Optional[str] = None
    target_country: Optional[str] = None
    interests: List[str] = []
    cgpa: Optional[float] = None
    current_field: Optional[str] = None
    interested_fields: List[str] = []
    interested_countries: List[str] = []
    graduation_year: Optional[int] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    languages: List[str] = []

class LoginRequest(BaseModel):
    email: str
    password: str

class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    profile: Optional[dict] = None

class CreatePostRequest(BaseModel):
    text: str
    tag: str

class CommentRequest(BaseModel):
    text: str

class DMThreadRequest(BaseModel):
    recipient_id: str

class DMMessageRequest(BaseModel):
    text: str

class ScholarshipRequest(BaseModel):
    title: str
    type: str
    country: str
    university: Optional[str] = None
    amount: Optional[float] = None
    deadline: datetime
    eligibility: str
    source_url: Optional[str] = None
    apply_url: str
    is_fully_funded: bool = False
    scraped_at: Optional[datetime] = None

class InternshipRequest(BaseModel):
    title: str
    company: str
    location: str
    is_paid: bool = False
    stipend: Optional[float] = None
    duration_weeks: Optional[int] = None
    deadline: datetime
    field: str
    apply_url: str
    scraped_at: Optional[datetime] = None

class ApplicationRequest(BaseModel):
    item_id: str
    item_type: str
    status: str = "saved"
    notes: Optional[str] = None

class NotificationRequest(BaseModel):
    type: str
    message: str
    ref_id: Optional[str] = None

# ═══════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════

def _serialize(doc: dict) -> dict:
    """
    Recursively convert ObjectIds and datetimes to JSON-safe strings.
    FIX: Iterates over list(doc.items()) to avoid mutating dict during iteration.
    FIX: Also handles datetime objects (previously silently broke JSON encoding).
    """
    if doc is None:
        return None
    for k, v in list(doc.items()):   # FIX: list() prevents mutation-during-iteration
        if isinstance(v, ObjectId):
            doc[k] = str(v)
        elif isinstance(v, datetime):   # FIX: serialize datetimes
            doc[k] = v.isoformat()
        elif isinstance(v, list):
            doc[k] = [
                _serialize(i) if isinstance(i, dict)
                else str(i) if isinstance(i, ObjectId)
                else i.isoformat() if isinstance(i, datetime)
                else i
                for i in v
            ]
        elif isinstance(v, dict):
            doc[k] = _serialize(v)
    return doc

def _get_thread_id(uid1: str, uid2: str) -> str:
    return "_".join(sorted([uid1, uid2]))

def _parse_object_id(value: str, field_name: str = "id") -> ObjectId:
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(400, f"Invalid {field_name}")

def _build_system_prompt(contexts: List[dict]) -> str:
    blocks = [
        f"[Source {i} | {c['url']} | score {c['score']}]\n{c['text']}"
        for i, c in enumerate(contexts, 1)
    ]
    return (
        "You are a helpful scholarship research assistant.\n"
        "Answer ONLY from the context below.\n\n"
        "CONTEXT:\n" + "\n\n---\n\n".join(blocks) + "\n\n"
        "RULES:\n"
        "- Be concise and direct.\n"
        "- If the answer is not in the context, say: \"I couldn't find that in the scraped content.\"\n"
        "- Do NOT make up facts.\n"
        "- Mention source URLs.\n"
    )

def _generate_answer(
    question: str, history: List[dict], contexts: List[dict], bot_type: str = "general"
) -> str:
    if not contexts:
        return "I don't have relevant information for that question."
    system     = _build_system_prompt(contexts)
    bot_prefix = BOT_SYSTEM_PROMPTS.get(bot_type)
    if bot_prefix:
        system = bot_prefix + "\n\n" + system
    messages = [{"role": h["role"], "content": h["content"]} for h in history]
    messages.append({"role": "user", "content": question})
    response = claude_client.messages.create(
        model=CLAUDE_MODEL, max_tokens=1024, system=system, messages=messages,
    )
    return response.content[0].text.strip()

# ═══════════════════════════════════════════════════════
# CORE ROUTES
# ═══════════════════════════════════════════════════════

@app.get("/")
def root():
    return {"status": "running", "chunks_in_db": vector_store.count(), "model": CLAUDE_MODEL}

@app.get("/status")
def get_status():
    return {
        "chunks": vector_store.count(),
        "urls":   URLS_TO_SCRAPE,
        "incremental_state": scraper.incremental_status(),
        "scholarships_in_db": r_scholarships_col.count_documents({}),
        "internships_in_db": r_internships_col.count_documents({}),
    }

@app.get("/health")
def health():
    return {
        "status": "ok",
        "mongo": True,
        "vector_chunks": vector_store.count(),
        "scholarships": r_scholarships_col.count_documents({}),
        "internships": r_internships_col.count_documents({}),
    }

@app.post("/scrape")
def manual_scrape(payload: ScrapeRequest, current_user: dict = Depends(get_current_user)):
    # FIX: SSRF guard — validate all user-supplied URLs before passing to scraper
    urls = validate_scrape_urls(payload.urls or URLS_TO_SCRAPE)
    return run_scrape(urls=urls, reset=payload.reset)

@app.post("/scrape/opportunities")
def manual_opportunity_scrape(current_user: dict = Depends(get_current_user)):
    return run_opportunity_scrape_only()

# ═══════════════════════════════════════════════════════
# CHAT (RAG)
# ═══════════════════════════════════════════════════════

@app.post("/chat")
def chat(payload: ChatRequest, current_user: dict = Depends(get_current_user)):
    question = payload.question.strip()
    if not question:
        raise HTTPException(400, "Question must not be empty")
    try:
        history  = payload.conversation_history or []
        contexts = vector_store.query(question, top_k=TOP_K_CHUNKS)
        answer   = _generate_answer(question, history, contexts, payload.bot_type)
        sources  = list(dict.fromkeys(c["url"] for c in contexts))
        user_id  = current_user["sub"]

        # FIX: Use a real conversation_id — fall back to user_id only if not provided
        conversation_id = payload.conversation_id or user_id

        messages_col.insert_many([
            {
                "user_id":         user_id,
                "conversation_id": conversation_id,
                "role":            "user",
                "content":         question,
                "timestamp":       datetime.utcnow(),
            },
            {
                "user_id":         user_id,
                "conversation_id": conversation_id,
                "role":            "assistant",
                "content":         answer,
                "sources":         sources,
                "timestamp":       datetime.utcnow(),
            },
        ])

        return {"answer": answer, "sources": sources, "bot_type": payload.bot_type}
    except anthropic.APIError as exc:
        raise HTTPException(502, f"AI error: {exc}")
    except Exception as exc:
        raise HTTPException(500, str(exc))

@app.get("/chat/history")
def chat_history(current_user: dict = Depends(get_current_user)):
    user_id = current_user["sub"]
    msgs = list(r_messages_col.find({"user_id": user_id}).sort("timestamp", 1))
    for m in msgs:
        m["_id"] = str(m["_id"])
    return msgs

# ═══════════════════════════════════════════════════════
# NEWS
# ═══════════════════════════════════════════════════════

@app.get("/news")
def get_news(limit: int = 20):
    results = vector_store.query("scholarship internship deadline grant", top_k=limit)
    news = [
        {
            "id":         i + 1,
            "title":      r["text"].split("\n")[0][:100],
            "snippet":    r["text"][:200].replace("\n", " "),
            "url":        r["url"],
            "site":       r.get("source_domain", ""),
            "scraped_at": r.get("scraped_at", ""),
            "score":      r.get("score", 0),
        }
        for i, r in enumerate(results)
    ]
    return {"news": news, "total": len(news)}

# ═══════════════════════════════════════════════════════
# AUTH
# ═══════════════════════════════════════════════════════

@app.post("/auth/signup", status_code=201)
def signup(data: SignupRequest):
    email = data.email.strip().lower()
    if not _is_valid_gmail(email):
        raise HTTPException(400, "Only valid @gmail.com emails are allowed")
    if not data.name or len(data.name.strip()) < 3:
        raise HTTPException(400, "Name must be at least 3 characters long")
    if not _is_strong_password(data.password):
        raise HTTPException(
            400,
            "Password must be at least 8 characters and include uppercase, lowercase, number, and special character",
        )
    if r_users_col.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")

    user = {
        "name":      data.name,
        "email":     email,
        "password":  hash_password(data.password),
        "user_type": data.user_type if data.user_type in ("student", "recruiter") else "student",
        "handle":    email.split("@")[0],
        "avatar":    None,
        "bio":       None,
        "profile": {
            "university":           data.university,
            "degree":               data.degree,
            "major":                data.major,
            "country":              data.country,
            "target_country":       data.target_country,
            "interests":            data.interests,
            "cgpa":                 data.cgpa,
            "current_field":        data.current_field,
            "interested_fields":    data.interested_fields,
            "interested_countries": data.interested_countries,
            "graduation_year":      data.graduation_year,
            "phone":                data.phone,
            "linkedin_url":         data.linkedin_url,
            "languages":            data.languages,
        },
        "followers":   [],
        "following":   [],
        "saved_posts": [],
        "created_at":  datetime.utcnow(),
        "updated_at":  None,
    }

    result  = users_col.insert_one(user)
    user_id = str(result.inserted_id)
    token   = create_access_token(user_id, email)

    return {
        "status": "created",
        "token":  token,
        "user": {
            "id":        user_id,
            "name":      data.name,
            "email":     email,
            "user_type": user["user_type"],
            "handle":    user["handle"],
            "profile":   user["profile"],
        },
    }


@app.post("/auth/login")
def login(data: LoginRequest):
    email = data.email.strip().lower()
    if not _is_valid_gmail(email):
        raise HTTPException(400, "Only valid @gmail.com emails are allowed")
    if not data.password or len(data.password) < 8:
        raise HTTPException(400, "Invalid email or password")
    user = r_users_col.find_one({"email": email})
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(401, "Invalid email or password")

    users_col.update_one(
        {"_id": user["_id"]},
        {"$set": {"updated_at": datetime.utcnow(), "last_login_at": datetime.utcnow()}},
    )

    user_id = str(user["_id"])
    token   = create_access_token(user_id, user["email"])

    return {
        "status": "success",
        "token":  token,
        "user": {
            "id":        user_id,
            "name":      user["name"],
            "email":     user["email"],
            "user_type": user["user_type"],
            "handle":    user.get("handle", ""),
            "avatar":    user.get("avatar"),
            "bio":       user.get("bio"),
            "profile":   user.get("profile", {}),
            "followers": user.get("followers", []),
            "following": user.get("following", []),
        },
    }


@app.get("/auth/me")
def me(current_user: dict = Depends(get_current_user)):
    user = r_users_col.find_one({"_id": ObjectId(current_user["sub"])})
    if not user:
        raise HTTPException(404, "User not found")
    user["_id"] = str(user["_id"])
    user.pop("password", None)
    return user

# ═══════════════════════════════════════════════════════
# USERS
# ═══════════════════════════════════════════════════════

@app.get("/users/{user_id}")
def get_user(user_id: str):
    user = r_users_col.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(404, "User not found")
    user["_id"] = str(user["_id"])
    user.pop("password", None)
    return user


@app.put("/users/{user_id}")
def update_user(
    user_id: str,
    data: UpdateUserRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user["sub"] != user_id:
        raise HTTPException(403, "Cannot update another user's profile")

    raw_update: dict = {"updated_at": datetime.utcnow()}
    if data.name is not None:
        raw_update["name"] = data.name
    if data.profile is not None:
        allowed_profile_keys = {
            "university",
            "degree",
            "major",
            "country",
            "target_country",
            "interests",
            "cgpa",
            "current_field",
            "interested_fields",
            "interested_countries",
            "graduation_year",
            "phone",
            "linkedin_url",
            "github_url",
            "website_url",
            "skills",
            "languages",
        }
        raw_update["profile"] = {
            k: v for k, v in data.profile.items() if k in allowed_profile_keys
        }

    safe_update = _strip_immutable(raw_update, _USER_IMMUTABLE_FIELDS)
    users_col.update_one({"_id": ObjectId(user_id)}, {"$set": safe_update})
    return {"status": "updated"}


@app.delete("/users/{user_id}")
def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["sub"] != user_id:
        raise HTTPException(403, "Cannot delete another user's account")

    # FIX: Cascade delete to prevent orphaned documents
    posts_col.delete_many({"user_id": user_id})
    messages_col.delete_many({"user_id": user_id})
    dm_messages_col.delete_many({"sender_id": user_id})
    dm_threads_col.delete_many({"participants": user_id})
    # Remove from other users' followers/following lists
    users_col.update_many({}, {"$pull": {"followers": user_id, "following": user_id}})
    # Remove from saved_posts on posts
    posts_col.update_many({}, {"$pull": {"saved_by": user_id, "liked_by": user_id}})

    users_col.delete_one({"_id": ObjectId(user_id)})
    return {"status": "deleted"}


@app.post("/users/{user_id}/follow")
def follow_user(user_id: str, current_user: dict = Depends(get_current_user)):
    me_id = current_user["sub"]
    if me_id == user_id:
        raise HTTPException(400, "Cannot follow yourself")

    target = r_users_col.find_one({"_id": ObjectId(user_id)})
    if not target:
        raise HTTPException(404, "User not found")

    already_following = me_id in target.get("followers", [])

    if already_following:
        users_col.update_one({"_id": ObjectId(user_id)}, {"$pull":     {"followers": me_id}})
        users_col.update_one({"_id": ObjectId(me_id)},   {"$pull":     {"following": user_id}})
        return {"status": "unfollowed"}
    else:
        users_col.update_one({"_id": ObjectId(user_id)}, {"$addToSet": {"followers": me_id}})
        users_col.update_one({"_id": ObjectId(me_id)},   {"$addToSet": {"following": user_id}})
        return {"status": "followed"}


@app.get("/users/{user_id}/saved-posts")
def saved_posts(user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["sub"] != user_id:
        raise HTTPException(403, "Cannot view another user's saved posts")
    user = r_users_col.find_one({"_id": ObjectId(user_id)}, {"saved_posts": 1})
    saved_ids = [ObjectId(pid) for pid in (user or {}).get("saved_posts", [])]
    posts = list(r_posts_col.find({"_id": {"$in": saved_ids}}).sort("created_at", -1))
    for p in posts:
        p["_id"] = str(p["_id"])
    return posts

# ═══════════════════════════════════════════════════════
# POSTS
# ═══════════════════════════════════════════════════════

ALLOWED_TAGS = {
    "achievement",
    "tip",
    "question",
    "internship open",
    "scholarship alert",
    "experience",
    "scholarship",
    "internship",
    "phd",
    "general",
    "merit",
    "need-based",
    "deadline",
    "result",
}

def _normalize_tag(tag: str) -> str:
    return (tag or "").strip().lower()

@app.post("/posts", status_code=201)
def create_post(data: CreatePostRequest, current_user: dict = Depends(get_current_user)):
    normalized_tag = _normalize_tag(data.tag)
    if not normalized_tag or normalized_tag not in ALLOWED_TAGS:
        raise HTTPException(400, f"Invalid tag. Allowed: {ALLOWED_TAGS}")

    user_id = current_user["sub"]
    user = r_users_col.find_one(
        {"_id": ObjectId(user_id)}, {"name": 1, "handle": 1, "user_type": 1, "avatar": 1}
    )
    if not user:
        raise HTTPException(404, "User not found")

    post = {
        "user_id":     user_id,
        "user_name":   user["name"],
        "user_handle": user.get("handle", ""),
        "user_type":   user.get("user_type", "student"),
        "user_avatar": user.get("avatar"),
        "text":        data.text,
        "tag":         data.tag.strip(),
        "likes":       0,
        "liked_by":    [],
        "comments":    [],
        "saved_by":    [],
        "created_at":  datetime.utcnow(),
        "updated_at":  None,
    }

    result = posts_col.insert_one(post)
    return {"status": "created", "post_id": str(result.inserted_id)}


@app.get("/posts")
def get_posts(page: int = 1, limit: int = 20, tag: Optional[str] = None):
    query = {}
    if tag:
        normalized_tag = _normalize_tag(tag)
        if normalized_tag not in ALLOWED_TAGS:
            raise HTTPException(400, f"Invalid tag. Allowed: {ALLOWED_TAGS}")
        query["tag"] = {"$regex": f"^{re.escape(tag.strip())}$", "$options": "i"}
    skip  = (page - 1) * limit
    posts = list(r_posts_col.find(query).sort("created_at", -1).skip(skip).limit(limit))
    total = r_posts_col.count_documents(query)
    for p in posts:
        p["_id"] = str(p["_id"])
    return {"posts": posts, "total": total, "page": page, "limit": limit}


@app.get("/posts/{post_id}")
def get_post(post_id: str):
    post = r_posts_col.find_one({"_id": ObjectId(post_id)})
    if not post:
        raise HTTPException(404, "Post not found")
    post["_id"] = str(post["_id"])
    return post


@app.put("/posts/{post_id}")
def update_post(
    post_id: str,
    data: CreatePostRequest,
    current_user: dict = Depends(get_current_user),
):
    normalized_tag = _normalize_tag(data.tag)
    if not normalized_tag or normalized_tag not in ALLOWED_TAGS:
        raise HTTPException(400, f"Invalid tag. Allowed: {ALLOWED_TAGS}")

    post = r_posts_col.find_one({"_id": ObjectId(post_id)})
    if not post:
        raise HTTPException(404, "Post not found")
    if post["user_id"] != current_user["sub"]:
        raise HTTPException(403, "Cannot edit another user's post")

    posts_col.update_one(
        {"_id": ObjectId(post_id)},
        {"$set": {"text": data.text, "tag": data.tag.strip(), "updated_at": datetime.utcnow()}},
    )
    return {"status": "updated"}


@app.delete("/posts/{post_id}")
def delete_post(post_id: str, current_user: dict = Depends(get_current_user)):
    post = r_posts_col.find_one({"_id": ObjectId(post_id)})
    if not post:
        raise HTTPException(404, "Post not found")
    if post["user_id"] != current_user["sub"]:
        raise HTTPException(403, "Cannot delete another user's post")
    posts_col.delete_one({"_id": ObjectId(post_id)})
    return {"status": "deleted"}


@app.post("/posts/{post_id}/like")
def like_post(post_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["sub"]
    # FIX: Read from RW client before a write to avoid replica-lag race condition
    post = posts_col.find_one({"_id": ObjectId(post_id)})
    if not post:
        raise HTTPException(404, "Post not found")

    if user_id in post.get("liked_by", []):
        posts_col.update_one(
            {"_id": ObjectId(post_id)},
            {"$pull": {"liked_by": user_id}, "$inc": {"likes": -1}},
        )
        return {"status": "unliked"}
    else:
        posts_col.update_one(
            {"_id": ObjectId(post_id)},
            {"$addToSet": {"liked_by": user_id}, "$inc": {"likes": 1}},
        )
        return {"status": "liked"}


@app.post("/posts/{post_id}/comment")
def add_comment(
    post_id: str,
    data: CommentRequest,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["sub"]
    user    = r_users_col.find_one(
        {"_id": ObjectId(user_id)}, {"name": 1, "handle": 1, "avatar": 1}
    )

    comment = {
        "comment_id":  str(ObjectId()),
        "user_id":     user_id,
        "user_name":   user["name"] if user else "Unknown",
        "user_handle": user.get("handle", "") if user else "",
        "user_avatar": user.get("avatar") if user else None,
        "text":        data.text,
        "created_at":  datetime.utcnow(),
    }

    posts_col.update_one({"_id": ObjectId(post_id)}, {"$push": {"comments": comment}})

    # FIX: _serialize now handles datetime; deep-copy first to avoid mutating the stored doc
    return {"status": "comment added", "comment": _serialize(copy.deepcopy(comment))}


@app.delete("/posts/{post_id}/comment/{comment_id}")
def delete_comment(
    post_id: str,
    comment_id: str,
    current_user: dict = Depends(get_current_user),
):
    post = r_posts_col.find_one({"_id": ObjectId(post_id)})
    if not post:
        raise HTTPException(404, "Post not found")

    comment = next(
        (c for c in post.get("comments", []) if c.get("comment_id") == comment_id), None
    )
    if not comment:
        raise HTTPException(404, "Comment not found")
    if comment["user_id"] != current_user["sub"] and post["user_id"] != current_user["sub"]:
        raise HTTPException(403, "Not authorized to delete this comment")

    posts_col.update_one(
        {"_id": ObjectId(post_id)},
        {"$pull": {"comments": {"comment_id": comment_id}}},
    )
    return {"status": "comment deleted"}


@app.post("/posts/{post_id}/save")
def save_post(post_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["sub"]
    # FIX: Read from RW client before a write to avoid replica-lag race condition
    post = posts_col.find_one({"_id": ObjectId(post_id)})
    if not post:
        raise HTTPException(404, "Post not found")

    user  = users_col.find_one({"_id": ObjectId(user_id)}, {"saved_posts": 1})
    saved = (user or {}).get("saved_posts", [])

    if post_id in saved:
        users_col.update_one({"_id": ObjectId(user_id)}, {"$pull":     {"saved_posts": post_id}})
        posts_col.update_one( {"_id": ObjectId(post_id)},{"$pull":     {"saved_by": user_id}})
        return {"status": "unsaved"}
    else:
        users_col.update_one({"_id": ObjectId(user_id)}, {"$addToSet": {"saved_posts": post_id}})
        posts_col.update_one( {"_id": ObjectId(post_id)},{"$addToSet": {"saved_by": user_id}})
        return {"status": "saved"}

# ═══════════════════════════════════════════════════════
# SCHOLARSHIPS / INTERNSHIPS / APPLICATIONS / NOTIFICATIONS
# ═══════════════════════════════════════════════════════

VALID_SCHOLARSHIP_TYPES = {"merit", "need", "phd", "funded"}
VALID_APPLICATION_STATUSES = {"saved", "applied", "rejected"}
VALID_ITEM_TYPES = {"scholarship", "internship"}
VALID_NOTIFICATION_TYPES = {"deadline", "new", "message"}

@app.post("/scholarships", status_code=201)
def create_scholarship(data: ScholarshipRequest, current_user: dict = Depends(get_current_user)):
    if data.type not in VALID_SCHOLARSHIP_TYPES:
        raise HTTPException(400, f"Invalid scholarship type. Allowed: {VALID_SCHOLARSHIP_TYPES}")
    doc = {
        "title": data.title,
        "type": data.type,
        "country": data.country,
        "university": data.university,
        "amount": data.amount,
        "deadline": data.deadline,
        "eligibility": data.eligibility,
        "source_url": data.source_url,
        "apply_url": data.apply_url,
        "is_fully_funded": data.is_fully_funded,
        "scraped_at": data.scraped_at or datetime.utcnow(),
        "created_at": datetime.utcnow(),
        "updated_at": None,
    }
    result = scholarships_col.insert_one(doc)
    return {"status": "created", "id": str(result.inserted_id)}

@app.get("/scholarships")
def list_scholarships(
    page: int = 1,
    limit: int = 20,
    s_type: Optional[str] = None,
    country: Optional[str] = None,
    q: Optional[str] = None,
):
    query: Dict = {}
    if s_type:
        if s_type not in VALID_SCHOLARSHIP_TYPES:
            raise HTTPException(400, f"Invalid scholarship type. Allowed: {VALID_SCHOLARSHIP_TYPES}")
        query["type"] = s_type
    if country:
        query["country"] = country
    if q:
        query["$text"] = {"$search": q}

    skip = (page - 1) * limit
    docs = list(r_scholarships_col.find(query).sort("deadline", ASCENDING).skip(skip).limit(limit))
    total = r_scholarships_col.count_documents(query)
    for d in docs:
        d["_id"] = str(d["_id"])
        _serialize(d)
    return {"items": docs, "total": total, "page": page, "limit": limit}

@app.get("/scholarships/{scholarship_id}")
def get_scholarship(scholarship_id: str):
    oid = _parse_object_id(scholarship_id, "scholarship_id")
    doc = r_scholarships_col.find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "Scholarship not found")
    doc["_id"] = str(doc["_id"])
    return _serialize(doc)

@app.put("/scholarships/{scholarship_id}")
def update_scholarship(
    scholarship_id: str,
    data: ScholarshipRequest,
    current_user: dict = Depends(get_current_user),
):
    oid = _parse_object_id(scholarship_id, "scholarship_id")
    if data.type not in VALID_SCHOLARSHIP_TYPES:
        raise HTTPException(400, f"Invalid scholarship type. Allowed: {VALID_SCHOLARSHIP_TYPES}")

    update_doc = {
        "title": data.title,
        "type": data.type,
        "country": data.country,
        "university": data.university,
        "amount": data.amount,
        "deadline": data.deadline,
        "eligibility": data.eligibility,
        "source_url": data.source_url,
        "apply_url": data.apply_url,
        "is_fully_funded": data.is_fully_funded,
        "scraped_at": data.scraped_at or datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    res = scholarships_col.update_one({"_id": oid}, {"$set": update_doc})
    if res.matched_count == 0:
        raise HTTPException(404, "Scholarship not found")
    return {"status": "updated"}

@app.delete("/scholarships/{scholarship_id}")
def delete_scholarship(scholarship_id: str, current_user: dict = Depends(get_current_user)):
    oid = _parse_object_id(scholarship_id, "scholarship_id")
    scholarships_col.delete_one({"_id": oid})
    return {"status": "deleted"}

@app.post("/internships", status_code=201)
def create_internship(data: InternshipRequest, current_user: dict = Depends(get_current_user)):
    doc = {
        "title": data.title,
        "company": data.company,
        "location": data.location,
        "is_paid": data.is_paid,
        "stipend": data.stipend,
        "duration_weeks": data.duration_weeks,
        "deadline": data.deadline,
        "field": data.field,
        "apply_url": data.apply_url,
        "scraped_at": data.scraped_at or datetime.utcnow(),
        "created_at": datetime.utcnow(),
        "updated_at": None,
    }
    result = internships_col.insert_one(doc)
    return {"status": "created", "id": str(result.inserted_id)}

@app.get("/internships")
def list_internships(
    page: int = 1,
    limit: int = 20,
    location: Optional[str] = None,
    field: Optional[str] = None,
    q: Optional[str] = None,
):
    query: Dict = {}
    if location:
        query["location"] = location
    if field:
        query["field"] = field
    if q:
        query["$text"] = {"$search": q}

    skip = (page - 1) * limit
    docs = list(r_internships_col.find(query).sort("deadline", ASCENDING).skip(skip).limit(limit))
    total = r_internships_col.count_documents(query)
    for d in docs:
        d["_id"] = str(d["_id"])
        _serialize(d)
    return {"items": docs, "total": total, "page": page, "limit": limit}

@app.get("/internships/{internship_id}")
def get_internship(internship_id: str):
    oid = _parse_object_id(internship_id, "internship_id")
    doc = r_internships_col.find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "Internship not found")
    doc["_id"] = str(doc["_id"])
    return _serialize(doc)

@app.put("/internships/{internship_id}")
def update_internship(
    internship_id: str,
    data: InternshipRequest,
    current_user: dict = Depends(get_current_user),
):
    oid = _parse_object_id(internship_id, "internship_id")
    update_doc = {
        "title": data.title,
        "company": data.company,
        "location": data.location,
        "is_paid": data.is_paid,
        "stipend": data.stipend,
        "duration_weeks": data.duration_weeks,
        "deadline": data.deadline,
        "field": data.field,
        "apply_url": data.apply_url,
        "scraped_at": data.scraped_at or datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    res = internships_col.update_one({"_id": oid}, {"$set": update_doc})
    if res.matched_count == 0:
        raise HTTPException(404, "Internship not found")
    return {"status": "updated"}

@app.delete("/internships/{internship_id}")
def delete_internship(internship_id: str, current_user: dict = Depends(get_current_user)):
    oid = _parse_object_id(internship_id, "internship_id")
    internships_col.delete_one({"_id": oid})
    return {"status": "deleted"}

@app.post("/applications", status_code=201)
def create_application(data: ApplicationRequest, current_user: dict = Depends(get_current_user)):
    if data.item_type not in VALID_ITEM_TYPES:
        raise HTTPException(400, f"Invalid item_type. Allowed: {VALID_ITEM_TYPES}")
    if data.status not in VALID_APPLICATION_STATUSES:
        raise HTTPException(400, f"Invalid status. Allowed: {VALID_APPLICATION_STATUSES}")

    item_oid = _parse_object_id(data.item_id, "item_id")
    if data.item_type == "scholarship":
        exists = r_scholarships_col.find_one({"_id": item_oid})
    else:
        exists = r_internships_col.find_one({"_id": item_oid})
    if not exists:
        raise HTTPException(404, f"{data.item_type.title()} not found")

    doc = {
        "user_id": current_user["sub"],
        "item_id": data.item_id,
        "item_type": data.item_type,
        "status": data.status,
        "notes": data.notes,
        "applied_at": datetime.utcnow() if data.status == "applied" else None,
        "created_at": datetime.utcnow(),
        "updated_at": None,
    }
    try:
        result = applications_col.insert_one(doc)
    except Exception:
        raise HTTPException(409, "Application already exists for this item")
    return {"status": "created", "id": str(result.inserted_id)}

@app.get("/applications/me")
def list_my_applications(
    status_filter: Optional[str] = None,
    item_type: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    current_user: dict = Depends(get_current_user),
):
    query: Dict = {"user_id": current_user["sub"]}
    if status_filter:
        if status_filter not in VALID_APPLICATION_STATUSES:
            raise HTTPException(400, f"Invalid status_filter. Allowed: {VALID_APPLICATION_STATUSES}")
        query["status"] = status_filter
    if item_type:
        if item_type not in VALID_ITEM_TYPES:
            raise HTTPException(400, f"Invalid item_type. Allowed: {VALID_ITEM_TYPES}")
        query["item_type"] = item_type

    skip = (page - 1) * limit
    docs = list(r_applications_col.find(query).sort("created_at", DESCENDING).skip(skip).limit(limit))
    total = r_applications_col.count_documents(query)
    for d in docs:
        d["_id"] = str(d["_id"])
        _serialize(d)
    return {"items": docs, "total": total, "page": page, "limit": limit}

@app.put("/applications/{application_id}")
def update_application(
    application_id: str,
    data: ApplicationRequest,
    current_user: dict = Depends(get_current_user),
):
    oid = _parse_object_id(application_id, "application_id")
    existing = r_applications_col.find_one({"_id": oid})
    if not existing:
        raise HTTPException(404, "Application not found")
    if existing["user_id"] != current_user["sub"]:
        raise HTTPException(403, "Cannot update another user's application")
    if data.item_type not in VALID_ITEM_TYPES:
        raise HTTPException(400, f"Invalid item_type. Allowed: {VALID_ITEM_TYPES}")
    if data.status not in VALID_APPLICATION_STATUSES:
        raise HTTPException(400, f"Invalid status. Allowed: {VALID_APPLICATION_STATUSES}")

    update_doc = {
        "item_id": data.item_id,
        "item_type": data.item_type,
        "status": data.status,
        "notes": data.notes,
        "updated_at": datetime.utcnow(),
    }
    if data.status == "applied" and not existing.get("applied_at"):
        update_doc["applied_at"] = datetime.utcnow()
    applications_col.update_one({"_id": oid}, {"$set": update_doc})
    return {"status": "updated"}

@app.delete("/applications/{application_id}")
def delete_application(application_id: str, current_user: dict = Depends(get_current_user)):
    oid = _parse_object_id(application_id, "application_id")
    existing = r_applications_col.find_one({"_id": oid})
    if not existing:
        raise HTTPException(404, "Application not found")
    if existing["user_id"] != current_user["sub"]:
        raise HTTPException(403, "Cannot delete another user's application")
    applications_col.delete_one({"_id": oid})
    return {"status": "deleted"}

@app.post("/notifications", status_code=201)
def create_notification(data: NotificationRequest, current_user: dict = Depends(get_current_user)):
    if data.type not in VALID_NOTIFICATION_TYPES:
        raise HTTPException(400, f"Invalid type. Allowed: {VALID_NOTIFICATION_TYPES}")
    doc = {
        "user_id": current_user["sub"],
        "type": data.type,
        "message": data.message,
        "ref_id": data.ref_id,
        "is_read": False,
        "created_at": datetime.utcnow(),
    }
    result = notifications_col.insert_one(doc)
    return {"status": "created", "id": str(result.inserted_id)}

@app.get("/notifications/me")
def list_my_notifications(
    unread_only: bool = False,
    page: int = 1,
    limit: int = 20,
    current_user: dict = Depends(get_current_user),
):
    query: Dict = {"user_id": current_user["sub"]}
    if unread_only:
        query["is_read"] = False
    skip = (page - 1) * limit
    docs = list(r_notifications_col.find(query).sort("created_at", DESCENDING).skip(skip).limit(limit))
    total = r_notifications_col.count_documents(query)
    for d in docs:
        d["_id"] = str(d["_id"])
        _serialize(d)
    return {"items": docs, "total": total, "page": page, "limit": limit}

@app.put("/notifications/{notification_id}/read")
def mark_notification_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    oid = _parse_object_id(notification_id, "notification_id")
    doc = r_notifications_col.find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "Notification not found")
    if doc["user_id"] != current_user["sub"]:
        raise HTTPException(403, "Cannot update another user's notification")
    notifications_col.update_one({"_id": oid}, {"$set": {"is_read": True}})
    return {"status": "read"}

@app.delete("/notifications/{notification_id}")
def delete_notification(notification_id: str, current_user: dict = Depends(get_current_user)):
    oid = _parse_object_id(notification_id, "notification_id")
    doc = r_notifications_col.find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "Notification not found")
    if doc["user_id"] != current_user["sub"]:
        raise HTTPException(403, "Cannot delete another user's notification")
    notifications_col.delete_one({"_id": oid})
    return {"status": "deleted"}

# ═══════════════════════════════════════════════════════
# DIRECT MESSAGES — REST
# ═══════════════════════════════════════════════════════

@app.get("/dm/threads")
def get_dm_threads(current_user: dict = Depends(get_current_user)):
    user_id = current_user["sub"]
    threads = list(r_dm_threads_col.find({"participants": user_id}).sort("updated_at", -1))
    for t in threads:
        t["_id"] = str(t["_id"])
        last_msg = r_dm_messages_col.find_one(
            {"thread_id": t["thread_id"]}, sort=[("created_at", -1)]
        )
        t["last_message"] = _serialize(copy.deepcopy(last_msg)) if last_msg else None
        other_id = next((p for p in t["participants"] if p != user_id), None)
        if other_id:
            other = r_users_col.find_one(
                {"_id": ObjectId(other_id)}, {"name": 1, "handle": 1, "avatar": 1}
            )
            t["other_user"] = _serialize(other) if other else None
    return threads


@app.post("/dm/threads")
def create_or_get_thread(
    data: DMThreadRequest,
    current_user: dict = Depends(get_current_user),
):
    me_id        = current_user["sub"]
    recipient_id = data.recipient_id

    if me_id == recipient_id:
        raise HTTPException(400, "Cannot message yourself")

    thread_id = _get_thread_id(me_id, recipient_id)
    existing  = r_dm_threads_col.find_one({"thread_id": thread_id})

    if existing:
        existing["_id"] = str(existing["_id"])
        return existing

    thread = {
        "thread_id":    thread_id,
        "participants": [me_id, recipient_id],
        "created_at":   datetime.utcnow(),
        "updated_at":   datetime.utcnow(),
    }
    result = dm_threads_col.insert_one(thread)
    thread["_id"] = str(result.inserted_id)
    return thread

@app.post("/dm/threads/{thread_id}/messages", status_code=201)
def send_thread_message(
    thread_id: str,
    data: DMMessageRequest,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["sub"]
    thread = r_dm_threads_col.find_one({"thread_id": thread_id})
    if not thread or user_id not in thread["participants"]:
        raise HTTPException(403, "Access denied")

    text = (data.text or "").strip()
    if not text:
        raise HTTPException(400, "Message text is required")

    user_doc = r_users_col.find_one({"_id": ObjectId(user_id)}, {"name": 1})
    msg_doc = {
        "thread_id": thread_id,
        "sender_id": user_id,
        "sender_name": user_doc["name"] if user_doc else "",
        "text": text,
        "read": False,
        "created_at": datetime.utcnow(),
    }
    result = dm_messages_col.insert_one(msg_doc)
    dm_threads_col.update_one(
        {"thread_id": thread_id},
        {"$set": {"updated_at": datetime.utcnow()}},
    )

    msg_doc["_id"] = str(result.inserted_id)
    return _serialize(msg_doc)


@app.get("/dm/threads/{thread_id}/messages")
def get_thread_messages(
    thread_id: str,
    page: int = 1,
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["sub"]
    thread  = r_dm_threads_col.find_one({"thread_id": thread_id})
    if not thread or user_id not in thread["participants"]:
        raise HTTPException(403, "Access denied")

    skip = (page - 1) * limit
    msgs = list(
        r_dm_messages_col.find({"thread_id": thread_id})
        .sort("created_at", 1)
        .skip(skip)
        .limit(limit)
    )
    for m in msgs:
        m["_id"] = str(m["_id"])
    return msgs

# ═══════════════════════════════════════════════════════
# DIRECT MESSAGES — WEBSOCKET
# ═══════════════════════════════════════════════════════

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, token: str = ""):
    try:
        payload = decode_token(token)
        if payload["sub"] != user_id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(websocket, user_id)
    user_doc = r_users_col.find_one({"_id": ObjectId(user_id)}, {"name": 1, "handle": 1})

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type")

            if msg_type == "message":
                thread_id = data.get("thread_id")
                text      = (data.get("text") or "").strip()
                if not thread_id or not text:
                    continue

                thread = r_dm_threads_col.find_one({"thread_id": thread_id})
                if not thread or user_id not in thread["participants"]:
                    continue

                recipient_id = next(p for p in thread["participants"] if p != user_id)

                msg_doc = {
                    "thread_id":   thread_id,
                    "sender_id":   user_id,
                    "sender_name": user_doc["name"] if user_doc else "",
                    "text":        text,
                    "read":        False,
                    "created_at":  datetime.utcnow(),
                }
                result  = dm_messages_col.insert_one(msg_doc)
                msg_doc["_id"]        = str(result.inserted_id)
                msg_doc["created_at"] = msg_doc["created_at"].isoformat()

                dm_threads_col.update_one(
                    {"thread_id": thread_id},
                    {"$set": {"updated_at": datetime.utcnow()}},
                )

                await manager.send_to_user(recipient_id, {"type": "message", **msg_doc})
                await websocket.send_json({"type": "message_sent", **msg_doc})

            elif msg_type == "typing":
                recipient_id = data.get("recipient_id")
                thread_id    = data.get("thread_id", "")
                if recipient_id:
                    await manager.send_to_user(recipient_id, {
                        "type":      "typing",
                        "sender_id": user_id,
                        "thread_id": thread_id,
                    })

            elif msg_type == "read":
                thread_id = data.get("thread_id")
                if not thread_id:
                    continue

                dm_messages_col.update_many(
                    {"thread_id": thread_id, "sender_id": {"$ne": user_id}, "read": False},
                    {"$set": {"read": True}},
                )

                thread = r_dm_threads_col.find_one({"thread_id": thread_id})
                if thread:
                    other_id = next(
                        (p for p in thread["participants"] if p != user_id), None
                    )
                    if other_id:
                        await manager.send_to_user(other_id, {
                            "type":      "read",
                            "thread_id": thread_id,
                            "reader_id": user_id,
                        })

    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
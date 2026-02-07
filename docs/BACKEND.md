# Backend Documentation

> **Note:** This documentation supplements [CLAUDE.md](../CLAUDE.md), which serves as the master implementation rules. In case of conflicts, CLAUDE.md takes precedence.

## Purpose
This document covers backend architecture, API patterns, FastAPI implementation details, and server development guidelines for the ResearchGPT API.

---

## Stack Overview

- **FastAPI:** 0.109.2+
- **Uvicorn:** 0.27.1+ (ASGI server with standard extras)
- **Pydantic:** 2.6.1+ (Data validation)
- **Pydantic Settings:** 2.1.0+ (Environment configuration)
- **Python Dotenv:** 1.0.1+ (Environment variables)
- **httpx:** 0.27.0+ (Async HTTP client for Supabase token validation)
- **Python:** 3.10+ required

---

## Project Structure

```
backend/
├── main.py              # FastAPI application
├── requirements.txt     # Python dependencies
├── .env.example         # Environment variable template
├── .gitignore          # Git ignore rules
└── venv/               # Virtual environment (not committed)
```

**Future Structure (as project grows):**
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── routers/         # API route modules
│   │   ├── auth.py
│   │   ├── wizard.py
│   │   └── projects.py
│   ├── models/          # Pydantic models
│   ├── services/        # Business logic
│   ├── db/              # Database utilities
│   └── config.py        # Settings management
├── tests/               # Test files
├── requirements.txt
└── .env.example
```

---

## Current Implementation

### main.py
**Location:** [backend/main.py](backend/main.py)

```python
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from dotenv import load_dotenv
import asyncio, httpx, json, os
from datetime import datetime

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

app = FastAPI(title="ResearchGPT API", version="0.1.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/me")
async def get_me(request: Request):
    """Validate Supabase token and return user info."""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid token"})
    token = auth_header.removeprefix("Bearer ")
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": SUPABASE_ANON_KEY,
            },
        )
    if resp.status_code != 200:
        return JSONResponse(status_code=401, content={"detail": "Invalid token"})
    data = resp.json()
    return {"id": data["id"], "email": data.get("email")}

@app.get("/stream/test")
async def stream_test():
    # ... SSE test endpoint (unchanged)
```

---

## API Patterns

### Endpoint Structure

**Naming Conventions:**
- Use lowercase with hyphens: `/api/user-projects`
- Plural for collections: `/projects`, `/runs`
- Singular for actions: `/health`, `/auth/login`

**HTTP Methods:**
- `GET` - Retrieve resources
- `POST` - Create resources
- `PUT` - Update/replace resources
- `PATCH` - Partial updates
- `DELETE` - Remove resources

### Request/Response Validation

Use Pydantic models for automatic validation:

```python
from pydantic import BaseModel, EmailStr

class SignupRequest(BaseModel):
    email: EmailStr
    password: str

class SignupResponse(BaseModel):
    user_id: str
    email: str
    verification_sent: bool

@app.post("/auth/signup", response_model=SignupResponse)
async def signup(data: SignupRequest):
    # Pydantic validates email format and required fields
    # ...
    return SignupResponse(...)
```

### Error Handling

**Standard Error Response:**
```python
from fastapi import HTTPException

@app.get("/projects/{project_id}")
async def get_project(project_id: str):
    project = await db.get_project(project_id)
    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )
    return project
```

**Status Codes:**
- `200 OK` - Success
- `201 Created` - Resource created
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Missing/invalid auth
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource doesn't exist
- `500 Internal Server Error` - Server error

### Async/Await Patterns

FastAPI is async-first. Use `async def` for I/O operations:

```python
# Database queries
async def get_user(user_id: str):
    async with db.pool.acquire() as conn:
        return await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)

# API calls
async def call_groq_api(prompt: str):
    async with httpx.AsyncClient() as client:
        response = await client.post(...)
        return response.json()

# Concurrent operations
results = await asyncio.gather(
    fetch_topic(),
    fetch_critic(),
    fetch_outline()
)
```

---

## Middleware

### CORS Configuration

**Current Setup:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Production:**
```python
allow_origins=[
    "https://your-frontend-domain.com",
    "http://localhost:5173"  # Keep for local dev
]
```

### Future Middleware

**Authentication:**
```python
from fastapi import Request

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    # Extract JWT token from headers
    # Validate with Supabase
    # Attach user to request.state
    response = await call_next(request)
    return response
```

**Request Logging:**
```python
import time

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration = time.time() - start_time
    logger.info(f"{request.method} {request.url.path} - {duration:.3f}s")
    return response
```

---

## SSE Streaming

Server-Sent Events for real-time agent logs.

**Implementation:**
```python
from fastapi.responses import StreamingResponse
import asyncio

@app.get("/stream/logs/{run_id}")
async def stream_logs(run_id: str):
    async def event_generator():
        try:
            # Subscribe to log stream for this run
            async for log_entry in log_stream(run_id):
                data = {
                    "timestamp": log_entry.timestamp,
                    "level": log_entry.level,
                    "message": log_entry.message,
                    "agent": log_entry.agent_name
                }
                yield f"data: {json.dumps(data)}\n\n"
        except asyncio.CancelledError:
            # Client disconnected
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )
```

**Event Format:**
```
data: {"timestamp": "2024-01-01T12:00:00Z", "message": "Processing..."}\n\n
```

---

## Development Workflow

### Running the Server

**With uvicorn directly:**
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
source venv/bin/activate  # Unix/Mac

pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Or run main.py:**
```bash
python main.py
```

**Server URLs:**
- API: http://localhost:8000
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Auto-Reload
Uvicorn's `--reload` flag watches for file changes and auto-restarts the server.

### Debugging

**Print debugging:**
```python
import logging
logger = logging.getLogger(__name__)

@app.get("/test")
async def test():
    logger.info("Test endpoint called")
    return {"status": "ok"}
```

**Python debugger:**
```python
import pdb; pdb.set_trace()
```

**VS Code:**
Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "FastAPI",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": ["main:app", "--reload"],
      "cwd": "${workspaceFolder}/backend"
    }
  ]
}
```

---

## Environment Management

**Location:** [backend/.env.example](backend/.env.example)

```env
GROQ_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

**Loading with python-dotenv:**
```python
from dotenv import load_dotenv
import os

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
```

**Using Pydantic Settings (recommended):**
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    groq_api_key: str
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str

    class Config:
        env_file = ".env"

settings = Settings()
```

---

## Future Integrations

### Groq API Integration

**Pattern:**
```python
import httpx

async def generate_topic(idea: str) -> str:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.groq.com/v1/...",
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            json={"prompt": idea, "model": "..."}
        )
        return response.json()["topic"]
```

**Important:** API key stays backend-only, never exposed to frontend.

### LangGraph Pipeline

**Structure:**
```python
from langgraph import Graph, Node

def create_research_pipeline():
    graph = Graph()
    graph.add_node("idea_validator", validate_idea)
    graph.add_node("topic_generator", generate_topic)
    graph.add_node("critic", critique_topic)
    graph.add_node("outline_generator", generate_outline)

    graph.add_edge("idea_validator", "topic_generator")
    graph.add_edge("topic_generator", "critic")
    graph.add_edge("critic", "outline_generator")

    return graph.compile()
```

### Supabase Python Client

**Installation:**
```bash
pip install supabase
```

**Usage:**
```python
from supabase import create_client

supabase = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key
)

# Query database
projects = supabase.table("projects").select("*").eq("user_id", user_id).execute()

# Insert row
supabase.table("projects").insert({"title": "New Project", "user_id": user_id}).execute()
```

---

## Testing Strategy

**Future: pytest**

```python
# tests/test_api.py
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

@pytest.mark.asyncio
async def test_stream_endpoint():
    # Test SSE streaming
    pass
```

**Run tests:**
```bash
pytest tests/
```

---

## References

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Pydantic Documentation](https://docs.pydantic.dev/)
- [Uvicorn Documentation](https://www.uvicorn.org/)
- [Python Async/Await Guide](https://docs.python.org/3/library/asyncio.html)

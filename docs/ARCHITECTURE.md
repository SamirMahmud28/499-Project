# Architecture Documentation

> **Note:** This documentation supplements [CLAUDE.md](../CLAUDE.md), which serves as the master implementation rules. In case of conflicts, CLAUDE.md takes precedence.

## Purpose
This document describes the system architecture, data flow, component relationships, and key design decisions for the ResearchGPT multi-agent research assistant.

---

## System Overview

**ResearchGPT** is a multi-agent research assistant that guides users through a 3-step wizard workflow to generate structured research outlines. Phase 1 focuses on:

- Chat-first wizard UX
- Real-time streaming agent logs
- Multi-user support with email verification
- Private-only projects (no sharing)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │         React Frontend (Vite + TypeScript)            │ │
│  │                                                       │ │
│  │  ┌──────────┐  ┌──────────────┐  ┌───────────────┐ │ │
│  │  │  Pages   │  │  Components  │  │  Utilities    │ │ │
│  │  │  Home    │  │  Wizard      │  │  API Client   │ │ │
│  │  │  Auth    │  │  Logs Panel  │  │  SSE Handler  │ │ │
│  │  └──────────┘  └──────────────┘  └───────────────┘ │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           │ HTTP/SSE
                           │ (localhost:5173 → localhost:8000)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              FastAPI Backend (Python)                       │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                   API Endpoints                       │ │
│  │  /health  /auth/*  /wizard/*  /projects  /stream/*   │ │
│  └───────────────────────────────────────────────────────┘ │
│                           │                                 │
│  ┌────────────┬──────────┴────────┬──────────────────────┐ │
│  │   CORS     │   Auth Middleware │   LangGraph Pipeline │ │
│  │ Middleware │   (JWT Validation)│   (Multi-Agent)      │ │
│  └────────────┴───────────────────┴──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
          │                    │                    │
          │                    │                    │
          ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐
│   Supabase       │  │   Supabase       │  │  Groq API    │
│   Auth           │  │   PostgreSQL     │  │  (LLM)       │
│                  │  │   + RLS          │  │              │
└──────────────────┘  └──────────────────┘  └──────────────┘
```

---

## 3-Step Wizard Workflow

The core user experience is a sequential wizard with checkpoints:

```
┌─────────────────────────────────────────────────────────────┐
│                    Step 1: IDEA                             │
│  User Input:  "Research idea description"                   │
│  Action:      Submit idea → Create run in database          │
│  Output:      run_id                                        │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Step 2: TOPIC & CRITIC                         │
│  Input:       run_id                                        │
│  Processing:  Agent 1 → Generate topic                      │
│               Agent 2 → Critique topic                      │
│  Output:      Topic + Critic Feedback                       │
│                                                             │
│  Checkpoint: [Regenerate] or [Accept & Continue]           │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ (Accept)
┌─────────────────────────────────────────────────────────────┐
│                 Step 3: OUTLINE                             │
│  Input:       run_id + accepted topic                       │
│  Processing:  Agent 3 → Generate research outline           │
│  Output:      Structured outline with sections             │
│                                                             │
│  Checkpoint: [Regenerate] or [Save to Project]             │
└─────────────────────────────────────────────────────────────┘
```

### Checkpoint Pattern

At each step (except Step 1), users can:
- **Regenerate:** Re-run the agent(s) for that step
- **Accept/Continue:** Proceed to next step or save final result

This allows iterative refinement without losing progress.

---

## Component Architecture

### Frontend Component Tree

```
App.tsx (BrowserRouter)
│
├─ Home.tsx
│  ├─ WizardStepper.tsx
│  │  ├─ Step 1: Idea Input Form
│  │  ├─ Step 2: Topic & Critic Display + Actions
│  │  └─ Step 3: Outline Display + Actions
│  │
│  └─ AgentLogsPanel.tsx
│     └─ LogEntry components (streaming)
│
├─ Login.tsx
│  └─ Auth form (Supabase)
│
├─ Signup.tsx
│  └─ Registration form
│
└─ VerifyEmail.tsx
   └─ Email verification UI
```

### Component Communication

**State Management:**
- **Local State:** `useState` for UI state (wizard step, expanded panels)
- **Server State:** API calls for wizard data (run status, topic, outline)
- **Real-time State:** SSE for streaming agent logs

**Data Flow:**
```
User Action → Component Handler → API Call → Backend Endpoint
                                      ↓
Backend Response ← Component Update ← State Update
```

**SSE Data Flow:**
```
Backend Agent → SSE Stream → EventSource → Component Update → UI Render
```

---

## Data Flow Diagrams

### Wizard Execution Flow

```
[User] → Submit Idea
   ↓
[Frontend] POST /wizard/idea
   ↓
[Backend] Create run record
   ↓
[Backend] Trigger LangGraph pipeline
   ↓
[Agents] topic_generator → critic → outline_generator
   │
   ├─→ Stream logs via SSE to frontend
   │
   └─→ Store results in database
   ↓
[Frontend] Poll or receive notification
   ↓
[Frontend] Display Topic & Critic
   ↓
[User] Accept or Regenerate
```

### Authentication Flow

```
[User] → Enter email + password
   ↓
[Frontend] POST /auth/signup
   ↓
[Backend] → Supabase Auth createUser()
   ↓
[Supabase] Send verification email
   ↓
[User] Click verification link
   ↓
[Frontend] POST /auth/verify-email
   ↓
[Backend] → Supabase verifyEmail()
   ↓
[User] Login via POST /auth/login
   ↓
[Backend] → Supabase signIn()
   ↓
[Backend] Return JWT token
   ↓
[Frontend] Store token + redirect to Home
```

### SSE Streaming Flow

```
[Backend] Agent executes task
   ↓
[Backend] Emit log event
   ↓
[Backend] Queue in log stream
   ↓
[SSE Endpoint] async generator yields event
   ↓
[HTTP Stream] data: {...}\n\n
   ↓
[Frontend] EventSource.onmessage
   ↓
[Frontend] Update logs panel
   ↓
[UI] Display new log entry
```

---

## Integration Points

### 1. Frontend ↔ Backend

**Protocol:** HTTP REST + Server-Sent Events

**REST Endpoints:**
- Authentication: `/auth/signup`, `/auth/login`
- Wizard: `/wizard/idea`, `/wizard/topic/{id}`, `/wizard/outline/{id}`
- Projects: `/projects`, `/projects/{id}`

**SSE Endpoints:**
- Logs: `/stream/logs/{run_id}`

**Data Format:** JSON for REST, JSON-in-SSE for streams

---

### 2. Backend ↔ Groq API

**Protocol:** HTTP REST (async with httpx)

**Integration:**
```python
async def call_groq_api(prompt: str, model: str = "llama-3"):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.groq.com/v1/...",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json={"prompt": prompt, "model": model}
        )
        return response.json()
```

**Security:** API key stored backend-only (never in frontend)

---

### 3. Backend ↔ Supabase (Auth + Database)

**Supabase Auth:**
```python
from supabase import create_client

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Create user
user = supabase.auth.sign_up(email, password)

# Verify email
supabase.auth.verify_otp(token)

# Login
session = supabase.auth.sign_in_with_password(email, password)
```

**Supabase Database:**
```python
# Query with RLS (uses anon key + JWT)
projects = supabase.table("projects") \
    .select("*") \
    .eq("user_id", user_id) \
    .execute()

# Insert
supabase.table("runs").insert({
    "idea": "...",
    "user_id": user_id,
    "status": "processing"
}).execute()
```

**Row Level Security (RLS):**
- Users can only access their own data
- Enforced at database level
- Queries automatically filtered by `user_id`

---

### 4. Backend ↔ LangGraph (Future)

**LangGraph Pipeline:**
```python
from langgraph import Graph

def create_pipeline():
    graph = Graph()

    # Add nodes (agents)
    graph.add_node("topic_gen", generate_topic_node)
    graph.add_node("critic", critique_topic_node)
    graph.add_node("outline_gen", generate_outline_node)

    # Define edges (flow)
    graph.add_edge("topic_gen", "critic")
    graph.add_edge("critic", "outline_gen")

    # Compile
    return graph.compile()

# Execute
result = await pipeline.ainvoke({"idea": user_idea})
```

**Agent Logging:**
Each node emits logs that are streamed to frontend via SSE.

---

## Security Architecture

### API Keys Backend-Only

**Principle:** Never expose API keys or service secrets to the frontend.

- Groq API key: Backend environment variable
- Supabase Service Role Key: Backend only (for admin operations)
- Frontend uses: Supabase Anon Key (public, safe to expose)

### Row Level Security (RLS)

**Database-level isolation:**
```sql
CREATE POLICY "Users can only access own projects"
ON projects FOR ALL
USING (auth.uid() = user_id);
```

**Benefits:**
- Multi-user isolation enforced in database
- Even if backend has bugs, users can't access others' data
- Supabase handles JWT validation automatically

### JWT Token Validation

**Flow:**
1. User logs in → receives JWT from Supabase
2. Frontend includes JWT in `Authorization: Bearer <token>` header
3. Backend validates JWT with Supabase on each request
4. Extracts `user_id` from validated token
5. Uses `user_id` for database queries (combined with RLS)

### Private-Only Projects

**Phase 1:** No sharing features

- Projects belong to single user
- No public/shared access
- No collaboration features

---

## Technology Choices & Trade-offs

### FastAPI over Flask/Django

**Why FastAPI:**
- ✅ Native async/await support (critical for SSE and LLM calls)
- ✅ Automatic API documentation (Swagger UI)
- ✅ Built-in request/response validation with Pydantic
- ✅ High performance (comparable to Node.js/Go)
- ✅ Modern Python 3.10+ features

**Trade-offs:**
- ❌ Smaller ecosystem than Django
- ❌ Less batteries-included (more manual setup)

---

### Vite over Create React App

**Why Vite:**
- ✅ Extremely fast dev server (instant startup)
- ✅ Lightning-fast HMR
- ✅ Better TypeScript support out-of-box
- ✅ Optimized production builds
- ✅ Modern tooling (ESBuild)

**Trade-offs:**
- ❌ Newer (less mature than CRA)
- ❌ Slightly different configuration

---

### Groq API

**Why Groq:**
- ✅ Ultra-fast inference speed (important for real-time UX)
- ✅ Cost-effective
- ✅ Good model selection (Llama, Mixtral, etc.)

**Trade-offs:**
- ❌ Less ecosystem than OpenAI
- ❌ Potential rate limits

---

### SSE over WebSockets

**Why Server-Sent Events:**
- ✅ Simpler than WebSockets (unidirectional: server → client)
- ✅ Built-in browser support (EventSource API)
- ✅ Automatic reconnection
- ✅ Works with standard HTTP (no special server config)
- ✅ Perfect for log streaming (no client → server communication needed)

**Trade-offs:**
- ❌ No client → server messages (but we don't need them for logs)
- ❌ Browser connection limits (6 per domain, but sufficient for our use case)

**When to use WebSockets instead:**
- Bidirectional real-time communication (chat, collaborative editing)
- Low-latency requirements (gaming, trading)

---

## Scalability Considerations

### Current Phase 1 Architecture

- Single backend server
- Supabase managed database
- Synchronous agent execution

### Future Scaling Paths

**Horizontal Scaling:**
- Multiple FastAPI instances behind load balancer
- Session stickiness for SSE connections
- Shared database (Supabase scales automatically)

**Async Task Queue:**
- Celery or RQ for long-running agent tasks
- Decouples HTTP requests from agent execution
- Better fault tolerance

**Caching:**
- Redis for session data
- Cache LLM responses for similar prompts

---

## Monitoring & Observability

### Logging

**Backend:**
```python
import logging

logger = logging.getLogger(__name__)
logger.info("Processing wizard run", extra={"run_id": run_id})
```

**Levels:**
- `INFO` - Normal operations
- `WARNING` - Unusual but handled
- `ERROR` - Errors that need attention

### Health Checks

**Endpoint:** `GET /health`

**Future enhancements:**
- Database connectivity check
- External API health (Groq, Supabase)
- Disk space, memory usage

### Error Tracking

**Future:** Integrate Sentry or similar

```python
import sentry_sdk

sentry_sdk.init(dsn="...")
```

---

## Development vs Production

### Development

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- CORS: Allow localhost
- Debug mode enabled
- Verbose logging

### Production

- Frontend: Deployed to Vercel/Netlify
- Backend: Deployed to Railway/Cloud Run
- CORS: Restrict to production frontend URL
- Debug mode disabled
- Structured logging to external service
- Environment variables via platform secrets

---

## References

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [React Architecture](https://react.dev/learn/thinking-in-react)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [Supabase Documentation](https://supabase.com/docs)
- [Server-Sent Events Specification](https://html.spec.whatwg.org/multipage/server-sent-events.html)

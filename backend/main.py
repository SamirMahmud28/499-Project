from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import asyncio
import httpx
import json
from datetime import datetime

from log_helpers import (
    _run_queues,
    _supabase_headers,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    get_latest_artifact as _get_latest_artifact,
)

app = FastAPI(title="ResearchGPT API", version="0.1.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_token(request: Request) -> str | None:
    """Extract Bearer token from Authorization header."""
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth.removeprefix("Bearer ")
    return None


# ── Health ────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok"}


# ── Auth ──────────────────────────────────────────────────────

@app.get("/me")
async def get_me(request: Request):
    """Validate Supabase token and return user info."""
    token = _get_token(request)
    if not token:
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid token"})

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


# ── Projects ──────────────────────────────────────────────────

@app.get("/projects")
async def list_projects(request: Request):
    """List all projects for current user (RLS enforced)."""
    token = _get_token(request)
    if not token:
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid token"})

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/projects",
            params={"select": "*", "order": "created_at.desc"},
            headers=_supabase_headers(token),
        )

    if resp.status_code != 200:
        return JSONResponse(status_code=resp.status_code, content=resp.json())

    return resp.json()


@app.post("/projects")
async def create_project(request: Request):
    """Create a new project (RLS enforced)."""
    token = _get_token(request)
    if not token:
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid token"})

    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        return JSONResponse(status_code=400, content={"detail": "name is required"})

    payload = {"name": name}
    if body.get("description"):
        payload["description"] = body["description"]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/projects",
            json=payload,
            headers=_supabase_headers(token, prefer="return=representation"),
        )

    if resp.status_code not in (200, 201):
        return JSONResponse(status_code=resp.status_code, content=resp.json())

    rows = resp.json()
    return rows[0] if rows else rows


@app.get("/projects/{project_id}")
async def get_project(project_id: str, request: Request):
    """Get a single project by ID (RLS enforced — returns 404 if not owned)."""
    token = _get_token(request)
    if not token:
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid token"})

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/projects",
            params={"select": "*", "id": f"eq.{project_id}"},
            headers=_supabase_headers(token),
        )

    if resp.status_code != 200:
        return JSONResponse(status_code=resp.status_code, content=resp.json())

    rows = resp.json()
    if not rows:
        return JSONResponse(status_code=404, content={"detail": "Project not found"})

    return rows[0]


# ── Runs ──────────────────────────────────────────────────────

@app.post("/projects/{project_id}/runs")
async def create_run(project_id: str, request: Request):
    """Create a new Phase 1 run for a project."""
    token = _get_token(request)
    if not token:
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid token"})

    payload = {
        "project_id": project_id,
        "phase": "phase1",
        "step": "idea",
        "status": "awaiting_feedback",
        "model_config": {},
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/runs",
            json=payload,
            headers=_supabase_headers(token, prefer="return=representation"),
        )

    if resp.status_code not in (200, 201):
        return JSONResponse(status_code=resp.status_code, content=resp.json())

    rows = resp.json()
    return rows[0] if rows else rows


@app.get("/projects/{project_id}/runs")
async def list_runs(project_id: str, request: Request):
    """List runs for a project, newest first."""
    token = _get_token(request)
    if not token:
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid token"})

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/runs",
            params={
                "select": "*",
                "project_id": f"eq.{project_id}",
                "order": "created_at.desc",
            },
            headers=_supabase_headers(token),
        )

    if resp.status_code != 200:
        return JSONResponse(status_code=resp.status_code, content=resp.json())

    return resp.json()


@app.get("/runs/{run_id}")
async def get_run(run_id: str, request: Request):
    """Get a single run by ID (RLS enforced)."""
    token = _get_token(request)
    if not token:
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid token"})

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/runs",
            params={"select": "*", "id": f"eq.{run_id}"},
            headers=_supabase_headers(token),
        )

    if resp.status_code != 200:
        return JSONResponse(status_code=resp.status_code, content=resp.json())

    rows = resp.json()
    if not rows:
        return JSONResponse(status_code=404, content={"detail": "Run not found"})

    return rows[0]


# ── Artifacts ─────────────────────────────────────────────────

@app.post("/runs/{run_id}/artifacts")
async def create_artifact(run_id: str, request: Request):
    """Create an artifact with auto-incremented version per (run_id, step_name)."""
    token = _get_token(request)
    if not token:
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid token"})

    body = await request.json()
    step_name = body.get("step_name", "").strip()
    content = body.get("content")
    if not step_name or content is None:
        return JSONResponse(status_code=400, content={"detail": "step_name and content are required"})

    headers = _supabase_headers(token)

    # Fetch latest version for this (run_id, step_name)
    async with httpx.AsyncClient() as client:
        ver_resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/artifacts",
            params={
                "select": "version",
                "run_id": f"eq.{run_id}",
                "step_name": f"eq.{step_name}",
                "order": "version.desc",
                "limit": "1",
            },
            headers=headers,
        )

    latest_version = 0
    if ver_resp.status_code == 200:
        rows = ver_resp.json()
        if rows:
            latest_version = rows[0]["version"]

    payload = {
        "run_id": run_id,
        "step_name": step_name,
        "version": latest_version + 1,
        "content": content,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/artifacts",
            json=payload,
            headers=_supabase_headers(token, prefer="return=representation"),
        )

    if resp.status_code not in (200, 201):
        return JSONResponse(status_code=resp.status_code, content=resp.json())

    rows = resp.json()
    return rows[0] if rows else rows


@app.get("/runs/{run_id}/artifacts")
async def list_artifacts(run_id: str, request: Request, step_name: str | None = None):
    """Get latest artifact per step for a run. Optional step_name filter."""
    token = _get_token(request)
    if not token:
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid token"})

    params: dict = {
        "select": "*",
        "run_id": f"eq.{run_id}",
        "order": "step_name,version.desc",
    }
    if step_name:
        params["step_name"] = f"eq.{step_name}"

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/artifacts",
            params=params,
            headers=_supabase_headers(token),
        )

    if resp.status_code != 200:
        return JSONResponse(status_code=resp.status_code, content=resp.json())

    all_artifacts = resp.json()

    # Return only the latest version per step_name
    latest: dict[str, dict] = {}
    for a in all_artifacts:
        sn = a["step_name"]
        if sn not in latest or a["version"] > latest[sn]["version"]:
            latest[sn] = a

    return list(latest.values())


# ── Agent Logs ────────────────────────────────────────────────

@app.post("/runs/{run_id}/logs")
async def create_log(run_id: str, request: Request):
    """Insert an agent log entry and broadcast to SSE listeners."""
    token = _get_token(request)
    if not token:
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid token"})

    body = await request.json()
    agent_name = body.get("agent_name", "").strip()
    event_type = body.get("event_type", "").strip()
    payload = body.get("payload", {})

    if not agent_name or not event_type:
        return JSONResponse(status_code=400, content={"detail": "agent_name and event_type are required"})

    log_payload = {
        "run_id": run_id,
        "agent_name": agent_name,
        "event_type": event_type,
        "payload": payload,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/agent_logs",
            json=log_payload,
            headers=_supabase_headers(token, prefer="return=representation"),
        )

    if resp.status_code not in (200, 201):
        return JSONResponse(status_code=resp.status_code, content=resp.json())

    rows = resp.json()
    log_entry = rows[0] if rows else log_payload

    # Broadcast to SSE listeners
    for q in _run_queues.get(run_id, []):
        await q.put(log_entry)

    return log_entry


@app.get("/runs/{run_id}/logs")
async def list_logs(run_id: str, request: Request):
    """Get all persisted agent logs for a run, oldest first."""
    token = _get_token(request)
    if not token:
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid token"})

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/agent_logs",
            params={
                "select": "*",
                "run_id": f"eq.{run_id}",
                "order": "created_at.asc",
            },
            headers=_supabase_headers(token),
        )

    if resp.status_code != 200:
        return JSONResponse(status_code=resp.status_code, content=resp.json())

    return resp.json()


# ── SSE Streaming ─────────────────────────────────────────────

@app.get("/runs/{run_id}/stream")
async def stream_run_logs(run_id: str, request: Request):
    """SSE endpoint — streams agent log events for a run in real time."""
    token = _get_token(request)
    if not token:
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid token"})

    # Verify run access (RLS)
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/runs",
            params={"select": "id", "id": f"eq.{run_id}"},
            headers=_supabase_headers(token),
        )
    if resp.status_code != 200 or not resp.json():
        return JSONResponse(status_code=404, content={"detail": "Run not found"})

    queue: asyncio.Queue = asyncio.Queue()
    if run_id not in _run_queues:
        _run_queues[run_id] = []
    _run_queues[run_id].append(queue)

    async def event_generator():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(event, default=str)}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            listeners = _run_queues.get(run_id, [])
            if queue in listeners:
                listeners.remove(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


# ── Demo Runner ───────────────────────────────────────────────

@app.post("/runs/{run_id}/demo")
async def demo_run(run_id: str, request: Request):
    """Start a demo that generates fake agent logs + artifacts for testing."""
    token = _get_token(request)
    if not token:
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid token"})

    # Verify run access
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/runs",
            params={"select": "id", "id": f"eq.{run_id}"},
            headers=_supabase_headers(token),
        )
    if resp.status_code != 200 or not resp.json():
        return JSONResponse(status_code=404, content={"detail": "Run not found"})

    asyncio.create_task(_demo_runner(run_id, token))
    return {"status": "demo started", "run_id": run_id}


async def _demo_runner(run_id: str, token: str):
    """Background task: generates fake agent logs and artifacts."""
    demo_events = [
        {"agent_name": "IdeaGenerator", "event_type": "start", "payload": {"message": "Starting idea generation..."}},
        {"agent_name": "IdeaGenerator", "event_type": "thinking", "payload": {"message": "Brainstorming research topics..."}},
        {"agent_name": "IdeaGenerator", "event_type": "output", "payload": {"message": "Generated idea: AI-assisted drug discovery using transformer architectures"}},
        {"agent_name": "IdeaGenerator", "event_type": "complete", "payload": {"message": "Idea generation complete."}},
        {"agent_name": "TopicCritic", "event_type": "start", "payload": {"message": "Starting topic analysis..."}},
        {"agent_name": "TopicCritic", "event_type": "thinking", "payload": {"message": "Evaluating feasibility and novelty..."}},
        {"agent_name": "TopicCritic", "event_type": "output", "payload": {"message": "Topic is feasible with strong novelty. Suggest narrowing scope to protein folding."}},
        {"agent_name": "TopicCritic", "event_type": "complete", "payload": {"message": "Topic critique complete."}},
        {"agent_name": "OutlineWriter", "event_type": "start", "payload": {"message": "Starting outline generation..."}},
        {"agent_name": "OutlineWriter", "event_type": "thinking", "payload": {"message": "Structuring paper sections..."}},
        {"agent_name": "OutlineWriter", "event_type": "output", "payload": {"message": "Outline: 1. Introduction 2. Background 3. Methods 4. Experiments 5. Conclusion"}},
        {"agent_name": "OutlineWriter", "event_type": "complete", "payload": {"message": "Outline generation complete."}},
    ]

    headers = _supabase_headers(token, prefer="return=representation")

    for event in demo_events:
        log_payload = {
            "run_id": run_id,
            "agent_name": event["agent_name"],
            "event_type": event["event_type"],
            "payload": event["payload"],
        }

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{SUPABASE_URL}/rest/v1/agent_logs",
                json=log_payload,
                headers=headers,
            )

        if resp.status_code in (200, 201):
            rows = resp.json()
            log_entry = rows[0] if rows else log_payload
            for q in _run_queues.get(run_id, []):
                await q.put(log_entry)

        await asyncio.sleep(1.5)

    # Create demo artifacts after logs
    demo_artifacts = [
        {
            "step_name": "idea",
            "content": {
                "title": "AI-Assisted Drug Discovery Using Transformer Architectures",
                "summary": "Exploring how transformer models can accelerate the drug discovery pipeline.",
            },
        },
        {
            "step_name": "topic_critic",
            "content": {
                "feedback": "Strong topic with high novelty. Recommend narrowing to protein folding prediction.",
                "score": 8.5,
            },
        },
        {
            "step_name": "outline",
            "content": {
                "sections": [
                    "Introduction",
                    "Background & Related Work",
                    "Methodology",
                    "Experimental Setup",
                    "Results & Discussion",
                    "Conclusion",
                ],
            },
        },
    ]

    for artifact in demo_artifacts:
        # Get latest version
        async with httpx.AsyncClient() as client:
            ver_resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/artifacts",
                params={
                    "select": "version",
                    "run_id": f"eq.{run_id}",
                    "step_name": f"eq.{artifact['step_name']}",
                    "order": "version.desc",
                    "limit": "1",
                },
                headers=_supabase_headers(token),
            )

        latest_version = 0
        if ver_resp.status_code == 200:
            rows = ver_resp.json()
            if rows:
                latest_version = rows[0]["version"]

        payload = {
            "run_id": run_id,
            "step_name": artifact["step_name"],
            "version": latest_version + 1,
            "content": artifact["content"],
        }

        async with httpx.AsyncClient() as client:
            await client.post(
                f"{SUPABASE_URL}/rest/v1/artifacts",
                json=payload,
                headers=_supabase_headers(token, prefer="return=representation"),
            )


# ── Phase 1 Step 2: Topic Proposer + Critic (LangGraph) ───────

@app.post("/runs/{run_id}/phase1/topic_critic")
async def run_topic_critic_endpoint(run_id: str, request: Request):
    """Start the TopicProposer + Critic LangGraph pipeline for a run."""
    token = _get_token(request)
    if not token:
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid token"})

    # Verify run exists and check it's not already running
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/runs",
            params={"select": "id,step,status", "id": f"eq.{run_id}"},
            headers=_supabase_headers(token),
        )
    if resp.status_code != 200 or not resp.json():
        return JSONResponse(status_code=404, content={"detail": "Run not found"})

    run_data = resp.json()[0]
    if run_data.get("status") == "running":
        return JSONResponse(
            status_code=409,
            content={"detail": "A pipeline is already running for this run. Wait for it to complete."},
        )

    # Load the latest idea artifact
    idea_artifact = await _get_latest_artifact(run_id, token, "idea")
    if not idea_artifact:
        return JSONResponse(
            status_code=400,
            content={"detail": "No idea artifact found for this run. Submit an idea first."},
        )

    idea_content = idea_artifact.get("content", {})
    if isinstance(idea_content, dict):
        idea_text = idea_content.get("title", "")
        if idea_content.get("summary"):
            idea_text += f" - {idea_content['summary']}"
    else:
        idea_text = str(idea_content)

    if not idea_text.strip():
        return JSONResponse(status_code=400, content={"detail": "Idea artifact has empty content."})

    # Parse optional body
    feedback = None
    num_candidates = 5
    try:
        body = await request.json()
        feedback = body.get("feedback")
        num_candidates = body.get("num_candidates", 5)
    except Exception:
        pass  # No body or invalid JSON — use defaults

    num_candidates = max(2, min(num_candidates, 10))

    from agents.phase1_step2 import run_topic_critic

    asyncio.create_task(run_topic_critic(
        run_id=run_id,
        token=token,
        idea=idea_text,
        feedback=feedback,
        num_candidates=num_candidates,
    ))

    return {"status": "running", "run_id": run_id, "step": "topic_critic"}


# ── Phase 1: Accept Topic ────────────────────────────────────

@app.post("/runs/{run_id}/phase1/accept_topic")
async def accept_topic_endpoint(run_id: str, request: Request):
    """Accept a topic candidate and advance the run to the outline step."""
    from log_helpers import emit_log, create_artifact as _create_artifact, update_run as _update_run

    token = _get_token(request)
    if not token:
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid token"})

    # Verify run exists
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/runs",
            params={"select": "id,step,status", "id": f"eq.{run_id}"},
            headers=_supabase_headers(token),
        )
    if resp.status_code != 200 or not resp.json():
        return JSONResponse(status_code=404, content={"detail": "Run not found"})

    # Parse body
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"detail": "Request body is required."})

    candidate_index = body.get("candidate_index")
    if candidate_index is None or not isinstance(candidate_index, int):
        return JSONResponse(status_code=400, content={"detail": "candidate_index (integer) is required."})

    # Load latest topic_critic artifact
    tc_artifact = await _get_latest_artifact(run_id, token, "topic_critic")
    if not tc_artifact:
        return JSONResponse(status_code=400, content={
            "detail": "No topic_critic artifact found. Run the Topic Proposer + Critic first."
        })

    tc_content = tc_artifact.get("content", {})
    candidates = tc_content.get("candidates", [])
    if candidate_index < 0 or candidate_index >= len(candidates):
        return JSONResponse(status_code=400, content={
            "detail": f"candidate_index {candidate_index} is out of range (0-{len(candidates)-1})."
        })

    selected = candidates[candidate_index]
    tc_version = tc_artifact.get("version", 1)

    await emit_log(run_id, token, "Orchestrator", "start", {
        "message": "Accepting topic...",
    })

    accepted_content = {
        "selected_index": candidate_index,
        "selected": selected,
        "source_topic_critic_version": tc_version,
        "accepted_at": datetime.utcnow().isoformat() + "Z",
    }

    await _create_artifact(run_id, token, "accepted_topic", accepted_content)

    title = selected.get("title", "Untitled")
    await emit_log(run_id, token, "Orchestrator", "output", {
        "message": f"Accepted: \"{title}\"",
    })

    await _update_run(run_id, token, step="outline", status="awaiting_feedback")

    await emit_log(run_id, token, "Orchestrator", "complete", {
        "message": "Topic accepted. Next: outline",
    })

    # Refresh run data to return
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/runs",
            params={"select": "*", "id": f"eq.{run_id}"},
            headers=_supabase_headers(token),
        )
    run_data = resp.json()[0] if resp.status_code == 200 and resp.json() else {}

    return {"status": "accepted", "run": run_data, "accepted_topic": accepted_content}


# ── Phase 1: Generate Outline (LangGraph) ────────────────────

@app.post("/runs/{run_id}/phase1/outline")
async def run_outline_endpoint(run_id: str, request: Request):
    """Start the OutlineWriter LangGraph pipeline for a run."""
    token = _get_token(request)
    if not token:
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid token"})

    # Verify run exists and not already running
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/runs",
            params={"select": "id,step,status", "id": f"eq.{run_id}"},
            headers=_supabase_headers(token),
        )
    if resp.status_code != 200 or not resp.json():
        return JSONResponse(status_code=404, content={"detail": "Run not found"})

    run_data = resp.json()[0]
    if run_data.get("status") == "running":
        return JSONResponse(
            status_code=409,
            content={"detail": "A pipeline is already running for this run. Wait for it to complete."},
        )

    # Load accepted_topic (required)
    accepted = await _get_latest_artifact(run_id, token, "accepted_topic")
    if not accepted:
        return JSONResponse(status_code=400, content={
            "detail": "No accepted_topic artifact found. Accept a topic first (Step 2)."
        })

    # Load idea (optional, for context)
    idea_artifact = await _get_latest_artifact(run_id, token, "idea")
    idea_text = ""
    if idea_artifact:
        ic = idea_artifact.get("content", {})
        if isinstance(ic, dict):
            idea_text = ic.get("title", "")
            if ic.get("summary"):
                idea_text += f" - {ic['summary']}"
        else:
            idea_text = str(ic)

    # Parse optional body
    outline_feedback = None
    try:
        body = await request.json()
        outline_feedback = body.get("feedback")
    except Exception:
        pass

    from agents.phase1_outline import run_outline

    asyncio.create_task(run_outline(
        run_id=run_id,
        token=token,
        accepted_topic=accepted.get("content", {}),
        idea=idea_text,
        feedback=outline_feedback,
    ))

    return {"status": "running", "run_id": run_id, "step": "outline"}


# ── Legacy SSE test ───────────────────────────────────────────

@app.get("/stream/test")
async def stream_test():
    """Test SSE endpoint that streams events every ~1 second"""

    async def event_generator():
        for i in range(10):
            data = {
                "timestamp": datetime.utcnow().isoformat(),
                "message": f"Test event {i + 1}",
                "counter": i + 1
            }
            yield f"data: {json.dumps(data)}\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

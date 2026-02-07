# 11 – Runs, Artifacts & Agent Logs (Task 6)

## Overview

This task adds the full "engine + persistence + streaming" layer:

- **Runs** — track each Phase 1 execution inside a project
- **Artifacts** — versioned outputs per step (idea, topic_critic, outline)
- **Agent Logs** — per-event log entries, persisted and streamed live via SSE

No LLM/LangGraph logic yet; a demo runner generates fake events for testing.

---

## Backend Endpoints

All endpoints require `Authorization: Bearer <user_token>`. RLS is enforced by forwarding the token to Supabase PostgREST.

### Runs

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/projects/{project_id}/runs` | Create a run (phase=phase1, step=idea, status=awaiting_feedback) |
| `GET` | `/projects/{project_id}/runs` | List runs for project, newest first |
| `GET` | `/runs/{run_id}` | Get single run |

### Artifacts

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/runs/{run_id}/artifacts` | Create artifact — auto-increments version per (run_id, step_name) |
| `GET` | `/runs/{run_id}/artifacts?step_name=idea` | Get latest artifact per step (optional filter) |

**POST body:**
```json
{ "step_name": "idea", "content": { "title": "...", "summary": "..." } }
```

### Agent Logs

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/runs/{run_id}/logs` | Insert log + broadcast to SSE listeners |
| `GET` | `/runs/{run_id}/logs` | Get all persisted logs (oldest first) |

**POST body:**
```json
{ "agent_name": "IdeaGenerator", "event_type": "thinking", "payload": { "message": "..." } }
```

### SSE Streaming

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/runs/{run_id}/stream` | Server-Sent Events — real-time log events |

Uses in-memory `asyncio.Queue` per listener. Heartbeat every 30 s.

Frontend connects with `fetch()` + `ReadableStream` (not `EventSource`) so it can send `Authorization` header.

### Demo Runner

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/runs/{run_id}/demo` | Generates 12 fake log events + 3 artifacts in background |

Events are spaced ~1.5 s apart and are **both** persisted to `agent_logs` **and** broadcast to SSE listeners.

---

## Frontend

### ProjectDetail page (`/projects/:id`)

- **Start Phase 1 Run** button — creates a run and selects it
- **Runs list** — click to select; shows id, step, status, timestamp
- **Stepper** — visual progress (idea → topic_critic → outline)
- **Artifacts panel** — shows latest content per step with version badge
- **Agent Logs panel** — terminal-style live log view with SSE connection
- **Generate Demo Logs** button — triggers `POST /runs/{run_id}/demo`

### SSE deduplication

Logs are fetched from `GET /runs/{run_id}/logs` on run selection. SSE events arriving after are deduplicated by `id` before appending to state.

---

## Data flow

```
User clicks "Generate Demo Logs"
  → POST /runs/{run_id}/demo
  → Backend launches asyncio background task
  → For each demo event:
      1. INSERT into agent_logs via Supabase PostgREST
      2. Push to in-memory queue
  → SSE endpoint reads from queue → streams to frontend
  → Frontend appends to log panel in real time
  → Demo also creates 3 artifacts (idea, topic_critic, outline)
```

On page refresh, persisted logs and artifacts are loaded from
`GET /runs/{run_id}/logs` and `GET /runs/{run_id}/artifacts`.

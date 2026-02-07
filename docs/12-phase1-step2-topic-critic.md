# 12 – Phase 1 Step 2: TopicProposer + Critic (LangGraph)

## Overview

Step 2 replaces demo generation with a real LangGraph workflow that calls Groq to produce research topic candidates and critique them.

**Graph**: `TopicProposer → Critic → END` (deterministic, no branching)

---

## Endpoint

```
POST /runs/{run_id}/phase1/topic_critic
Authorization: Bearer <supabase_access_token>
Content-Type: application/json (optional)
```

### Request body (all fields optional)

```json
{
  "feedback": "Focus more on renewable energy applications",
  "num_candidates": 5
}
```

- `feedback` — user feedback from a previous generation (for regeneration)
- `num_candidates` — number of topic candidates to produce (default 5, clamped 2–10)

### Response (immediate)

```json
{ "status": "running", "run_id": "...", "step": "topic_critic" }
```

The pipeline runs in a background task. Progress is streamed via SSE at `GET /runs/{run_id}/stream`.

### Error responses

| Code | Condition |
|------|-----------|
| 400 | No idea artifact exists for this run |
| 400 | Idea artifact has empty content |
| 401 | Missing or invalid token |
| 404 | Run not found |
| 409 | Pipeline already running for this run |

---

## LangGraph State

```python
class TopicCriticState(TypedDict):
    run_id: str
    token: str
    idea: str
    feedback: str | None
    num_candidates: int
    candidates: list[dict]    # populated by TopicProposer
    critic_result: dict       # populated by Critic
    model: str
```

## Nodes

### TopicProposer

- **Agent name**: `TopicProposer`
- **LLM**: Groq (temperature=0.8)
- **Input**: idea text + optional feedback
- **Output**: list of candidates, each with `title`, `description`, `keywords`
- **Log events**: start → thinking → output → complete

### Critic

- **Agent name**: `TopicCritic`
- **LLM**: Groq (temperature=0.3)
- **Input**: candidates from TopicProposer
- **Output**: rankings, recommendation, suggested narrowing, research questions
- **Log events**: start → thinking → output → complete

---

## Artifact JSON shape (`step_name: "topic_critic"`)

```json
{
  "candidates": [
    {
      "title": "...",
      "description": "...",
      "keywords": ["...", "..."]
    }
  ],
  "critic_result": {
    "rankings": [
      {
        "rank": 1,
        "candidate_index": 0,
        "title": "...",
        "score": 9.2,
        "strengths": ["...", "..."],
        "weaknesses": ["..."]
      }
    ],
    "recommendation": "...",
    "suggested_narrowing": "...",
    "research_questions": ["...", "...", "..."],
    "recommended_index": 0
  },
  "metadata": {
    "num_candidates": 5,
    "model": "llama-3.3-70b-versatile",
    "feedback": null
  }
}
```

---

## Data flow

```
1. Frontend calls POST /runs/{run_id}/phase1/topic_critic
2. Backend validates token, loads idea artifact, returns immediately
3. Background task:
   a. update_run(status="running")
   b. TopicProposer node → Groq call → emit 4 log events
   c. Critic node → Groq call → emit 4 log events
   d. create_artifact(step_name="topic_critic", ...)
   e. update_run(step="topic_critic", status="awaiting_feedback")
4. All logs persisted to agent_logs AND streamed via SSE
5. On error: emit error log + set status="failed"
```

---

## File structure

```
backend/
  log_helpers.py              # Shared: _run_queues, emit_log, create_artifact, etc.
  groq_client.py              # ChatGroq wrapper (GROQ_API_KEY + GROQ_MODEL)
  agents/
    __init__.py
    phase1_step2.py           # LangGraph graph: TopicProposer → Critic
  main.py                     # POST /runs/{run_id}/phase1/topic_critic endpoint
```

---

## Environment variables

```
GROQ_API_KEY=gsk_...          # Required
GROQ_MODEL=llama-3.3-70b-versatile  # Optional (this is the default)
```

# Phase 2 — Task 3: ApproachRecommenderAgent

## Goal
Create the first Phase 2 LangGraph agent that analyzes the user's topic, outline, and constraints to recommend a research approach (best + 2 backups), refine the problem statement, and suggest titles.

## Prerequisites
- Task 2 completed (Phase 2 transition + constraints work)
- Phase 1 artifacts accessible on the run

## Safety Rules
- Create ONE new file: `backend/agents/phase2_approach.py`
- Modify `backend/main.py` — add ONE new endpoint (append, don't change existing)
- Modify `frontend/src/pages/RunDetail.tsx` — add Step 2 UI card below constraints
- DO NOT modify any Phase 1 agent files or existing endpoints

---

## Backend: New Agent

### File: `backend/agents/phase2_approach.py`

Follow the exact same pattern as `backend/agents/phase1_step2.py`:

#### State
```python
class ApproachState(TypedDict):
    run_id: str
    token: str
    model: str
    accepted_topic: dict
    outline: dict
    constraints: dict
    feedback: str | None
    approach_recommendation: dict
```

#### Node: `approach_recommender_node`
- **Temperature**: 0.5
- **System prompt**: Define the 6 research approaches with descriptions. Instruct the LLM to analyze the topic + constraints and produce a structured JSON response.
- **Human prompt**: Include accepted_topic (title, description, keywords), outline summary, and constraints (time_budget, data_availability, resources, user_level).
- **Output JSON structure**: Matches `phase2_approach_recommendation` artifact contract (see PHASE2_ARCHITECTURE.md section 6.2)
- **Logs**: `start` -> `thinking` -> `recommendation` -> `complete`
- **Log details**: Emit the refined problem statement, each suggested title, and the recommended approach with reasons

#### Graph
```python
graph = StateGraph(ApproachState)
graph.add_node("approach_recommender", approach_recommender_node)
graph.set_entry_point("approach_recommender")
graph.add_edge("approach_recommender", END)
approach_graph = graph.compile()
```

#### Entry point
```python
async def run_approach_recommender(
    run_id: str,
    token: str,
    accepted_topic: dict,
    outline: dict,
    constraints: dict,
    feedback: str | None = None,
) -> None:
```
Same pattern as `run_topic_critic`:
1. `await update_run(run_id, token, step="phase2_approach", status="running")`
2. Build initial state, invoke graph
3. `await create_artifact(run_id, token, "phase2_approach_recommendation", result["approach_recommendation"])`
4. `await update_run(run_id, token, step="phase2_approach", status="awaiting_feedback")`
5. Wrap in try/except — emit error log and set status to "failed" on failure

---

## Backend: New Endpoint

### File: `backend/main.py`

Add after the Phase 2 constraints section:

#### `POST /runs/{run_id}/phase2/approach`

**Logic:**
1. Extract token, verify run exists
2. Check `run.phase == "phase2"` — otherwise 400
3. Check `run.status != "running"` — otherwise 409
4. Load required artifacts:
   - `accepted_topic` = `get_latest_artifact(run_id, token, "accepted_topic")`
   - `outline` = `get_latest_artifact(run_id, token, "outline")`
   - `constraints` = `get_latest_artifact(run_id, token, "phase2_constraints")`
5. Validate all 3 exist — otherwise 400 with specific message
6. Parse optional body: `{ "feedback": "..." }`
7. Lazy import: `from agents.phase2_approach import run_approach_recommender`
8. `asyncio.create_task(run_approach_recommender(run_id, token, accepted_topic["content"], outline["content"], constraints["content"], feedback))`
9. Return `{"status": "running", "step": "phase2_approach"}`

---

## Frontend: Step 2 UI

### File: `frontend/src/pages/RunDetail.tsx`

Add Phase 2 Step 2 card below the Constraints card (only visible when `isPhase2`).

**New state variables:**
```typescript
const [runningApproach, setRunningApproach] = useState(false)
const [approachFeedback, setApproachFeedback] = useState('')
```

**New derived state:**
```typescript
const hasApproachRec = artifacts.some((a) => a.step_name === 'phase2_approach_recommendation')
```

**UI Card: "Step 2: Approach Recommendation"**
- Guard: show only if `hasConstraints` (Step 1 done), otherwise show amber warning
- Feedback textarea (optional): for regenerating with guidance
- "Get Recommendations" / "Regenerate" button → calls `POST /runs/{runId}/phase2/approach`
- On success: optimistic update `setRun(prev => prev ? { ...prev, status: 'running', step: 'phase2_approach' } : prev)` + scroll to logs

**Display approach recommendation artifact** (when `hasApproachRec`):
- Refined problem statement (text)
- Research questions (numbered list)
- Suggested titles (radio buttons for selection — used in Task 4)
- Recommended approach card: name, "why it fits" bullets, effort level, "what you must provide"
- 2 alternative approaches: name, why, tradeoffs
- The user doesn't select/accept here — that's Task 4

---

## The 6 Approaches (for LLM prompt)

Include these in the system prompt:
1. **Survey / Questionnaire** (Primary) — Collect new responses; analyze patterns
2. **Controlled Experiment** (Primary) — Manipulate variables; measure outcomes
3. **Interview / Qualitative Study** (Primary) — Open-ended data; thematic analysis
4. **Public Dataset Analysis** (Secondary) — Use existing datasets/records; analyze/model
5. **Systematic Literature Review** (Secondary) — Structured search/screening; synthesize
6. **Comparative Evaluation** (Secondary) — Compare options using rubric/criteria

### Constraint-Based Filtering Rules (include in system prompt)

The LLM MUST apply these hard rules before ranking approaches:

| Constraint | Rule |
|-----------|------|
| `data_availability == "none"` | **Exclude** all Primary approaches (Survey, Experiment, Interview). Only recommend Secondary (Dataset Analysis, Lit Review, Comparative Eval) |
| `data_availability == "public_only"` | **Exclude** Survey and Experiment. Allow Interview only if `participants_access == true` |
| `time_budget == "hours"` | **Exclude** Survey, Experiment, Interview (all require days+). Recommend Comparative Eval or Dataset Analysis |
| `time_budget == "days"` | **Exclude** Experiment (requires weeks+). All others viable |
| `participants_access == false` | **Exclude** Survey and Interview |
| `lab_access == false` | **Exclude** Experiment |
| `user_level == "school"` | **Prefer** Lit Review, Comparative Eval, Dataset Analysis. Only recommend primary approaches if constraints explicitly allow |

After filtering, rank remaining approaches by fit. If fewer than 3 approaches remain after filtering, explain why in the `tradeoffs` field.

### TypeScript Interface (for `frontend/src/types/api.ts`)

Add alongside the Task 2 interfaces:

```typescript
export interface ApproachRecommendation {
  metadata: { model: string; created_at: string }
  refined_problem_statement: string
  refined_research_questions: string[]
  suggested_titles: string[]
  recommended: {
    approach: string
    why_fit: string[]
    effort_level: 'low' | 'medium' | 'high'
    what_user_must_provide: string[]
  }
  alternatives: Array<{
    approach: string
    why: string[]
    tradeoffs: string[]
  }>
}
```

---

## Verification Checklist
- [ ] `backend/agents/phase2_approach.py` created following existing agent patterns
- [ ] `POST /runs/{id}/phase2/approach` endpoint works
- [ ] Agent emits proper SSE logs (start, thinking, recommendation, complete)
- [ ] Artifact `phase2_approach_recommendation` is persisted with correct structure
- [ ] Run status transitions: running -> awaiting_feedback
- [ ] Frontend shows Step 2 card with recommendation display
- [ ] Regeneration with feedback creates new artifact version (v2)
- [ ] All Phase 1 functionality still works
- [ ] Phase 2 Step 1 (constraints) still works

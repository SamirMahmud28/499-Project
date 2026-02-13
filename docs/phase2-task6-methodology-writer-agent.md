# Phase 2 — Task 6: MethodologyWriterAgent (Final Plan Pack)

## Goal
Create the final Phase 2 agent that generates the comprehensive Research Plan Pack — methodology steps, approach-specific templates, risks/constraints/ethics, and next actions.

## Prerequisites
- Task 5 completed (sources_pack + evidence_plan artifacts exist)

## Safety Rules
- Create ONE new file: `backend/agents/phase2_methodology.py`
- Modify `backend/main.py` — add ONE new endpoint (append only)
- Modify `frontend/src/pages/RunDetail.tsx` — add Step 4 UI card
- DO NOT modify any other agent files or Phase 1 code

---

## Backend: New Agent

### File: `backend/agents/phase2_methodology.py`

#### State
```python
class MethodologyState(TypedDict):
    run_id: str
    token: str
    model: str
    accepted_topic: dict
    outline: dict
    constraints: dict
    selected_approach: dict
    sources_pack: dict
    evidence_plan: dict
    feedback: str | None
    research_plan_pack: dict
```

#### Node: `methodology_writer_node`

**LLM Temperature**: 0.6

**System prompt**: You are a research methodology expert. Given all the context (topic, approach, constraints, sources, evidence plan), produce a comprehensive Research Plan Pack in JSON.

**Human prompt** includes:
- Topic title + description + research angle
- Selected approach + effort level
- Constraints (time, resources, data availability)
- Evidence plan summary
- Number of available papers/tools/datasets
- User feedback (if regenerating)

**Output structure** matches `phase2_research_plan_pack` artifact (see PHASE2_ARCHITECTURE.md section 6.6):
- `final_title`, `final_problem_statement`, `final_research_questions`
- `selected_approach`
- `methodology_steps[]` — step number, name, details, deliverables
- `templates{}` — ONLY include templates relevant to the selected approach. Use this exact mapping:

  | Selected Approach | Template Key(s) to Generate | Skip All Others |
  |---|---|---|
  | Survey / Questionnaire | `survey_questions` | Yes |
  | Controlled Experiment | `experiment_checklist` | Yes |
  | Interview / Qualitative Study | `interview_guide` | Yes |
  | Public Dataset Analysis | *(none — methodology steps cover analysis)* | Yes |
  | Systematic Literature Review | `review_protocol` | Yes |
  | Comparative Evaluation | `evaluation_rubric` | Yes |

  The `templates` object in the output MUST only contain the key(s) for the selected approach. Empty object `{}` for Dataset Analysis.
- `risks_constraints_ethics[]` — risk, impact (low/medium/high), mitigation
- `next_actions[]` — ordered list of what the user should do next

**Logging** (detailed, per section):
1. `"MethodologyWriter"` / `"start"` / `"Generating Research Plan Pack for approach: {approach}"`
2. `"MethodologyWriter"` / `"thinking"` / `"Analyzing topic, constraints, and {N} sources..."`
3. `"MethodologyWriter"` / `"section"` / `"Methodology step {i}: {name}"` (per step)
4. `"MethodologyWriter"` / `"templates"` / `"Generated {template_type} template"`
5. `"MethodologyWriter"` / `"risks"` / `"Identified {N} risks/constraints"`
6. `"MethodologyWriter"` / `"output"` / `"Research Plan Pack complete: {N} methodology steps, {M} risks, {K} next actions"`
7. `"MethodologyWriter"` / `"complete"` / `"Phase 2 complete. Research Plan Pack ready for review."`

#### Graph
Single-node graph:
```python
graph = StateGraph(MethodologyState)
graph.add_node("methodology_writer", methodology_writer_node)
graph.set_entry_point("methodology_writer")
graph.add_edge("methodology_writer", END)
methodology_graph = graph.compile()
```

#### Entry point
```python
async def run_methodology_writer(
    run_id, token, accepted_topic, outline, constraints,
    selected_approach, sources_pack, evidence_plan, feedback=None
) -> None:
```
1. `update_run(status="running", step="phase2_plan")`
2. Build state, invoke graph
3. `create_artifact("phase2_research_plan_pack", result["research_plan_pack"])`
4. `update_run(status="completed", step="phase2_plan")`  ← Phase 2 COMPLETE

---

## Backend: New Endpoint

### File: `backend/main.py`

#### `POST /runs/{run_id}/phase2/plan`

**Logic:**
1. Extract token, verify run
2. Check `run.phase == "phase2"`, status != "running"
3. Load 5 artifacts: `accepted_topic`, `outline`, `phase2_constraints`, `phase2_selected_approach`, `phase2_sources_pack`, `phase2_evidence_plan`
4. Require at minimum: accepted_topic, constraints, selected_approach (sources + evidence are strongly recommended but agent can work without them)
5. Parse optional body: `{ "feedback": "..." }`
6. `asyncio.create_task(run_methodology_writer(...))`
7. Return `{"status": "running", "step": "phase2_plan"}`

---

## Frontend: Step 4 UI

### File: `frontend/src/pages/RunDetail.tsx`

Add Step 4 card below Step 3.

**New state:**
```typescript
const [runningPlan, setRunningPlan] = useState(false)
const [planFeedback, setPlanFeedback] = useState('')
```

**New derived state:**
```typescript
const hasPlanPack = artifacts.some((a) => a.step_name === 'phase2_research_plan_pack')
const isPhase2Completed = run?.phase === 'phase2' && run?.step === 'phase2_plan' && run?.status === 'completed'
```

**UI Card: "Step 4: Research Plan Pack"**

Guard: show only if `hasSourcesPack || hasEvidencePlan`, otherwise amber warning.

**Trigger section:**
- Feedback textarea (optional)
- "Generate Plan" / "Regenerate" button
- On click: POST + optimistic update + scroll to logs

**Plan display** (when `hasPlanPack`):

1. **Header**: Final title (large), problem statement (paragraph), research questions (numbered)

2. **Methodology Steps**: Numbered expandable sections
   - Each step: name, detail bullets, deliverables list
   - Visual step indicator (number badge + name)

3. **Templates** (tabs or accordion — only show relevant ones):
   - Survey Questions: numbered list
   - Interview Guide: topic list with probing questions
   - Experiment Checklist: checkbox-style list
   - Review Protocol: databases + screening rules
   - Evaluation Rubric: criteria + scoring table

4. **Risks & Ethics**: Table with columns: Risk | Impact (badge) | Mitigation

5. **Next Actions**: Ordered checklist

**Phase 2 Completion banner** (when `isPhase2Completed`):
- Green banner similar to Phase 1 completion
- "Phase 2 Complete — Your Research Plan Pack is ready."
- Show at the top of the Phase 2 section

---

## TypeScript Interface

### File: `frontend/src/types/api.ts`

```typescript
export interface ResearchPlanPack {
  metadata: {
    model: string
    created_at: string
    source_pack_version: number
  }
  final_title: string
  final_problem_statement: string
  final_research_questions: string[]
  selected_approach: string
  methodology_steps: Array<{
    step: number
    name: string
    details: string[]
    deliverables: string[]
  }>
  templates: {
    survey_questions?: string[]
    interview_guide?: string[]
    experiment_checklist?: string[]
    review_protocol?: {
      databases: string[]
      screening_rules: string[]
    }
    evaluation_rubric?: Array<{
      criterion: string
      scoring: string
    }>
  }
  risks_constraints_ethics: Array<{
    risk: string
    impact: 'low' | 'medium' | 'high'
    mitigation: string
  }>
  next_actions: string[]
}
```

---

## Verification Checklist
- [ ] `backend/agents/phase2_methodology.py` created
- [ ] `POST /runs/{id}/phase2/plan` endpoint works
- [ ] Agent emits detailed SSE logs (start, thinking, section, templates, risks, complete)
- [ ] Artifact `phase2_research_plan_pack` persisted with correct structure
- [ ] Run status transitions to "completed" after plan generation
- [ ] Templates are approach-specific (only relevant ones generated)
- [ ] Frontend renders the full plan: methodology, templates, risks, next actions
- [ ] Phase 2 completion banner appears
- [ ] Regeneration with feedback creates new version
- [ ] Full end-to-end flow works: Phase 1 → Phase 2 (all 4 steps)
- [ ] All previous tasks still work

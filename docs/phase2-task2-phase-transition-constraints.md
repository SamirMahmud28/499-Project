# Phase 2 — Task 2: Phase Transition + Constraints Endpoint

## Goal
Add the backend endpoint to transition a run from Phase 1 to Phase 2, and enable the frontend to submit Phase 2 constraints (Step 1). This is the bridge between phases — no LLM calls, no agents.

## Prerequisites
- Task 1 completed (tools package exists, but not used here)
- Phase 1 working end-to-end

## Safety Rules
- Only modify `backend/main.py` (add new endpoints — do NOT change existing endpoints)
- Only modify `frontend/src/pages/RunDetail.tsx` (add Phase 2 UI below Phase 1 — do NOT change Phase 1 step cards)
- Only modify `frontend/src/types/api.ts` (add new interfaces — do NOT change existing ones)

---

## Backend Changes

### File: `backend/main.py`

Add **2 new endpoints** after the existing Phase 1 endpoints (after the outline endpoint section):

#### 1. `POST /runs/{run_id}/phase2/continue`
Transitions a completed Phase 1 run to Phase 2.

**Logic:**
1. Extract token, verify run exists (RLS)
2. Check `run.step == "outline"` AND `run.status == "completed"` — otherwise return 400 ("Phase 1 must be completed first")
3. Check that `accepted_topic` and `outline` artifacts exist — otherwise return 400
4. Update run: `phase = "phase2"`, `step = "phase2_constraints"`, `status = "awaiting_feedback"`
5. Return `{"status": "ok", "phase": "phase2", "step": "phase2_constraints"}`

**No background task** — this is a synchronous status update.

#### 2. `POST /runs/{run_id}/phase2/constraints` (Dedicated Endpoint)

**Decision**: Use a dedicated endpoint (NOT the generic artifacts endpoint). This is cleaner because it validates constraints-specific fields, advances the run step atomically, and keeps the generic artifacts endpoint unchanged.

**Logic:**
1. Extract token, verify run exists
2. Check `run.phase == "phase2"` and `run.step == "phase2_constraints"` — otherwise return 400
3. Parse body: `{ time_budget, data_availability, user_level, resources: { lab_access, participants_access, software_tools }, notes }`
4. Create artifact: `step_name = "phase2_constraints"`, content = the parsed body + metadata
5. Update run: `step = "phase2_approach"`, `status = "awaiting_feedback"`
6. Return `{"status": "ok", "step": "phase2_approach"}`

---

## Frontend Changes

### File: `frontend/src/types/api.ts`

Add new interface (do NOT modify existing interfaces):

```typescript
export interface Phase2Constraints {
  metadata: { created_at: string; user_level: string }
  time_budget: string
  data_availability: string
  resources: {
    lab_access: boolean
    participants_access: boolean
    software_tools: string[]
  }
  notes: string
}
```

### File: `frontend/src/pages/RunDetail.tsx`

Add Phase 2 UI **below the existing Agent Logs panel** (at the bottom of the return JSX). Only show when Phase 1 is completed.

#### "Continue to Phase 2" Button
- Show when: `run.step === 'outline' && run.status === 'completed' && run.phase === 'phase1'`
- On click: `POST /runs/{runId}/phase2/continue` then `refreshRunData()`
- After success: run.phase becomes "phase2", step becomes "phase2_constraints"

#### Phase 2 Step 1: Constraints Form
- Show when: `run.phase === 'phase2'`
- Form fields:
  - **User Level**: dropdown — School / University / Professional
  - **Time Budget**: dropdown — Hours / Days / Weeks / Months
  - **Data Availability**: dropdown — None / Public Only / Can Collect
  - **Lab Access**: checkbox
  - **Participants Access**: checkbox
  - **Software Tools**: text input (comma-separated)
  - **Notes**: textarea (optional)
- Submit button: `POST /runs/{runId}/phase2/constraints` then `refreshRunData()`
- Show "Done" badge when `phase2_constraints` artifact exists

**State variables to add:**
```typescript
// Phase 2 Step 1
const [userLevel, setUserLevel] = useState('university')
const [timeBudget, setTimeBudget] = useState('weeks')
const [dataAvailability, setDataAvailability] = useState('public_only')
const [labAccess, setLabAccess] = useState(false)
const [participantsAccess, setParticipantsAccess] = useState(false)
const [softwareTools, setSoftwareTools] = useState('')
const [constraintNotes, setConstraintNotes] = useState('')
const [submittingConstraints, setSubmittingConstraints] = useState(false)
```

**Derived state to add:**
```typescript
const hasConstraints = artifacts.some((a) => a.step_name === 'phase2_constraints')
const isPhase2 = run?.phase === 'phase2'
```

---

## Run Status Updates

The `STEPS` constant at the top of RunDetail.tsx currently is:
```typescript
const STEPS = ['idea', 'topic_critic', 'outline']
```

Update to include Phase 2 steps:
```typescript
const PHASE1_STEPS = ['idea', 'topic_critic', 'outline']
const PHASE2_STEPS = ['phase2_constraints', 'phase2_approach', 'phase2_sources', 'phase2_plan']
```

The stepper component should show Phase 1 steps normally. When in Phase 2, show Phase 2 steps below (or extend the stepper). Keep it simple for now — a Phase 2 stepper can be polished in Task 8.

---

## Verification Checklist
- [ ] `POST /runs/{id}/phase2/continue` works — transitions Phase 1 completed run to Phase 2
- [ ] `POST /runs/{id}/phase2/continue` rejects non-completed runs (400)
- [ ] `POST /runs/{id}/phase2/constraints` creates artifact and advances step
- [ ] Frontend shows "Continue to Phase 2" button after Phase 1 completes
- [ ] Frontend shows Constraints form when in Phase 2
- [ ] Constraints form submits correctly and shows "Done" badge
- [ ] All Phase 1 functionality still works (idea, topic critic, accept, outline)
- [ ] Run detail page works for both Phase 1 and Phase 2 runs

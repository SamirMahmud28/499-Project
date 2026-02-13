# Phase 2 — Task 4: Select Approach Endpoint + UI

## Goal
Add the endpoint and frontend UI for the user to select a research approach and title from the recommendations generated in Task 3. This is the "accept" step — similar to Phase 1's accept_topic.

## Prerequisites
- Task 3 completed (ApproachRecommenderAgent + display UI)

## Safety Rules
- Modify `backend/main.py` — add ONE new endpoint (append only)
- Modify `frontend/src/pages/RunDetail.tsx` — add selection UI to the existing Step 2 card
- DO NOT modify agent files or any Phase 1 code

---

## Backend: New Endpoint

### File: `backend/main.py`

#### `POST /runs/{run_id}/phase2/select_approach`

**Body:**
```json
{
  "selected_approach": "survey",
  "selected_title": "User-chosen or edited title",
  "notes": "Optional user notes"
}
```

**Logic:**
1. Extract token, verify run exists
2. Check `run.phase == "phase2"` — otherwise 400
3. Load `phase2_approach_recommendation` artifact — must exist
4. Validate `selected_approach` is one of the 6 valid approaches
5. Create artifact:
   ```json
   {
     "step_name": "phase2_selected_approach",
     "content": {
       "metadata": { "selected_at": "<iso8601>" },
       "selected_approach": "<from body>",
       "selected_title": "<from body>",
       "user_overrides": { "notes": "<from body>" },
       "source_recommendation_version": <version of approach_recommendation artifact>
     }
   }
   ```
6. Update run: `step = "phase2_sources"`, `status = "awaiting_feedback"`
7. Emit orchestrator log: `"Orchestrator"` / `"output"` / `"Approach selected: {approach}. Title: {title}"`
8. Return `{"status": "accepted", "approach": selected_approach, "title": selected_title}`

No background task — this is a synchronous operation.

---

## Frontend Changes

### File: `frontend/src/pages/RunDetail.tsx`

Extend the Step 2 card from Task 3 to include selection UI below the recommendations display.

**New state variables:**
```typescript
const [selectedApproach, setSelectedApproach] = useState<string | null>(null)
const [selectedTitle, setSelectedTitle] = useState('')
const [approachNotes, setApproachNotes] = useState('')
const [acceptingApproach, setAcceptingApproach] = useState(false)
```

**New derived state:**
```typescript
const hasSelectedApproach = artifacts.some((a) => a.step_name === 'phase2_selected_approach')
```

**UI additions to Step 2 card** (below the recommendation display):

1. **Title Selection**: Radio buttons for the 3 suggested titles + an "Edit title" text input
2. **Approach Selection**:
   - The recommended approach shown as pre-selected (highlighted card)
   - 2 alternatives shown as selectable cards
   - Each card: approach name + bullets (why/tradeoffs)
   - Radio or card-click to select
3. **Notes**: Optional textarea for user overrides
4. **"Accept Approach" button**:
   - Disabled until both approach and title are selected
   - Calls `POST /runs/{runId}/phase2/select_approach`
   - On success: `refreshRunData()`
5. After acceptance: show green "Accepted" badge on the Step 2 card header
   - Display selected approach name and title
   - Disable selection UI (read-only)

---

## TypeScript Interface

### File: `frontend/src/types/api.ts`

Add alongside previous Phase 2 interfaces:

```typescript
export interface SelectedApproach {
  metadata: { selected_at: string }
  selected_approach: string
  selected_title: string
  user_overrides: { notes: string }
  source_recommendation_version: number
}
```

---

## Verification Checklist
- [ ] `POST /runs/{id}/phase2/select_approach` endpoint works
- [ ] Artifact `phase2_selected_approach` is persisted correctly
- [ ] Run step advances to "phase2_sources", status to "awaiting_feedback"
- [ ] Orchestrator log emitted and visible in Agent Logs panel
- [ ] Frontend shows approach/title selection UI
- [ ] User can select approach, select/edit title, add notes
- [ ] After acceptance: Step 2 shows "Accepted" badge, selection disabled
- [ ] Re-running approach recommender (Task 3) clears the selection
- [ ] All previous tasks still work

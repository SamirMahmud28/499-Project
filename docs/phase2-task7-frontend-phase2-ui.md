# Phase 2 — Task 7: Frontend Phase 2 Complete UI

## Goal
Refactor and polish the Phase 2 frontend UI. Tasks 2-6 added Phase 2 cards incrementally to RunDetail.tsx. This task consolidates, cleans up, and ensures a polished experience across all 4 Phase 2 steps.

## Prerequisites
- Tasks 2-6 completed (all backend + basic frontend working)

## Safety Rules
- Modify `frontend/src/pages/RunDetail.tsx` — refactor Phase 2 sections
- Optionally extract Phase 2 step cards into separate component files to keep RunDetail manageable
- DO NOT modify any backend files
- DO NOT modify Phase 1 UI sections

---

## Scope

### 1. Run Detail Page Organization

By Task 6, RunDetail.tsx will have grown significantly with Phase 2 cards. Consider:

**Option A (preferred)**: Extract Phase 2 steps into a `Phase2Steps.tsx` component
```
frontend/src/components/Phase2Steps.tsx  (new)
```
- Receives: `run`, `artifacts`, `authHeaders`, `refreshRunData`, `logsPanelRef`
- Contains all 4 Phase 2 step cards
- RunDetail renders `<Phase2Steps ... />` when `run.phase === 'phase2'`

**Option B**: Keep everything in RunDetail but organize with clear section comments.

### 2. Phase 2 Stepper

Add a second stepper below the Phase 1 stepper when the run is in Phase 2:

```
Phase 1: [idea] ─── [topic_critic] ─── [outline] ✓
Phase 2: [constraints] ─── [approach] ─── [sources] ─── [plan]
```

Phase 1 steps all show as green (completed). Phase 2 stepper shows current progress with the same color scheme.

### 3. "Continue to Phase 2" Transition

After Phase 1 completes:
- The completion banner should include a prominent "Continue to Phase 2" button
- After clicking, smoothly transition to Phase 2 UI
- Phase 1 step cards should collapse/minimize (still viewable but not taking space)

### 4. Phase 2 Step Cards Polish

Ensure consistent patterns across all 4 steps:

**Each step card should have:**
- Header with step name + "Done" / "Accepted" / "Running" badge
- Green border when completed (`border-green-200`)
- Guard message if prerequisites not met (amber text)
- Feedback textarea for regeneration (where applicable)
- Action button with loading state
- Optimistic status update + scroll to logs on action

**Step 1 (Constraints)**:
- Clean form layout with labeled dropdowns/checkboxes
- Summary display after submission

**Step 2 (Approach)**:
- Recommendation cards with clear visual hierarchy
- Selected approach highlighted
- Title selection with edit capability

**Step 3 (Sources)**:
- Tab or section layout for Papers / Datasets / Tools / Knowledge Bases
- Each resource: clickable title (opens URL in new tab), metadata, relevance note
- Papers: DOI badge, PDF link button, citation count if available
- Evidence plan in a collapsible section below

**Step 4 (Plan Pack)**:
- Rich display with expandable methodology steps
- Templates in tabs (only show applicable ones)
- Risks table
- Next actions as a visual checklist

### 5. Phase 2 Completion Banner

When `run.phase === 'phase2' && run.step === 'phase2_plan' && run.status === 'completed'`:
- Green banner at the top: "Phase 2 Complete — Research Plan Pack Ready"
- Summary stats: "N methodology steps, M resources found, K risks identified"

---

## Verification Checklist
- [ ] RunDetail.tsx is well-organized (either extracted or clearly sectioned)
- [ ] Phase 2 stepper shows correct progress
- [ ] "Continue to Phase 2" transition is smooth
- [ ] Phase 1 cards minimize when in Phase 2
- [ ] All 4 Phase 2 step cards render correctly
- [ ] All resource links open in new tabs
- [ ] Consistent badge/status/button patterns across steps
- [ ] Phase 2 completion banner shows with summary stats
- [ ] Responsive layout works on different screen sizes
- [ ] No regressions in Phase 1 UI

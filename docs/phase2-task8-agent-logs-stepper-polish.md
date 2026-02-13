# Phase 2 — Task 8: Agent Logs, Stepper & Final Polish

## Goal
Register the 4 new Phase 2 agents in the AgentLogsPanel, polish the stepper to show both phases, and do a final integration pass.

## Prerequisites
- Tasks 2-7 completed (all features working)

## Safety Rules
- Modify `frontend/src/components/AgentLogsPanel.tsx` — add 4 new agent configs (append to AGENT_CONFIG)
- Modify `frontend/src/pages/RunDetail.tsx` — polish stepper
- DO NOT modify backend files
- DO NOT modify Phase 1 logic

---

## 1. Agent Logs Panel Updates

### File: `frontend/src/components/AgentLogsPanel.tsx`

Add 4 new entries to `AGENT_CONFIG` and update `PRIMARY_AGENTS`:

```typescript
import {
  // ... existing imports ...
  Compass,       // ApproachRecommender
  Search,        // SourceScout
  ClipboardList, // EvidencePlanner
  BookOpen,      // MethodologyWriter
} from 'lucide-react'

// Add to AGENT_CONFIG:
ApproachRecommender: {
  icon: Compass,
  color: 'text-teal-600',
  bgColor: 'bg-teal-100',
  label: 'Approach Recommender',
},
SourceScout: {
  icon: Search,
  color: 'text-orange-600',
  bgColor: 'bg-orange-100',
  label: 'Source Scout',
},
EvidencePlanner: {
  icon: ClipboardList,
  color: 'text-cyan-600',
  bgColor: 'bg-cyan-100',
  label: 'Evidence Planner',
},
MethodologyWriter: {
  icon: BookOpen,
  color: 'text-rose-600',
  bgColor: 'bg-rose-100',
  label: 'Methodology Writer',
},
```

Update `PRIMARY_AGENTS` set:
```typescript
const PRIMARY_AGENTS = new Set([
  // Phase 1
  'TopicProposer', 'TopicCritic', 'OutlineWriter',
  // Phase 2
  'ApproachRecommender', 'SourceScout', 'EvidencePlanner', 'MethodologyWriter',
])
```

### New Event Types

Add to `EVENT_STYLES` if used by Phase 2 agents:
```typescript
searching: 'bg-orange-100 text-orange-700',
ranking: 'bg-indigo-100 text-indigo-700',
templates: 'bg-pink-100 text-pink-700',
risks: 'bg-amber-100 text-amber-700',
```

---

## 2. Stepper Polish

### File: `frontend/src/pages/RunDetail.tsx`

Replace the single STEPS stepper with a dual-phase stepper when in Phase 2:

**Phase 1 Stepper** (always visible):
```
[idea] ─── [topic_critic] ─── [outline]
```
- All green when Phase 1 completed

**Phase 2 Stepper** (only when `run.phase === 'phase2'`):
```
[constraints] ─── [approach] ─── [sources] ─── [plan]
```
- Same color logic: past steps green, current blue, future gray
- Visual separator between Phase 1 and Phase 2 steppers (e.g., "Phase 2" label)

**Step labels**: Use human-readable names instead of raw step values:
```typescript
const STEP_LABELS: Record<string, string> = {
  idea: 'Idea',
  topic_critic: 'Topics',
  outline: 'Outline',
  phase2_constraints: 'Constraints',
  phase2_approach: 'Approach',
  phase2_sources: 'Sources',
  phase2_plan: 'Plan',
}
```

---

## 3. Final Integration Pass

### Handoff Detection

The handoff detection in AgentLogsPanel should work across Phase 2 agents automatically (it checks for `complete` -> `start` transitions between different primary agents). Verify:
- SourceScout `complete` -> EvidencePlanner `start` shows a handoff indicator
- Other Phase 2 transitions (if they happen in the same pipeline) show handoffs

### Scroll Behavior

Verify the scroll-to-step effect works for Phase 2 steps:
- When Phase 2 approach finishes → scroll to Step 2 card
- When Phase 2 sources finishes → scroll to Step 3 card
- When Phase 2 plan finishes → scroll to Step 4 card

Update the scroll-to-step logic in RunDetail.tsx to handle Phase 2 step values:
```typescript
useEffect(() => {
  if (prevStatusRef.current === 'running' && run?.status && run.status !== 'running') {
    let target: React.RefObject<HTMLDivElement>
    switch (run.step) {
      case 'topic_critic': target = step2Ref; break
      case 'outline': target = step3Ref; break
      case 'phase2_approach': target = phase2Step2Ref; break
      case 'phase2_sources': target = phase2Step3Ref; break
      case 'phase2_plan': target = phase2Step4Ref; break
      default: target = step2Ref
    }
    setTimeout(() => target.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
  }
  prevStatusRef.current = run?.status
}, [run?.status, run?.step])
```

### Project Detail Page

Verify that the runs list on ProjectDetail.tsx correctly shows Phase 2 step/status badges for runs that have transitioned to Phase 2.

---

## Verification Checklist
- [ ] All 4 Phase 2 agents show correct icons and colors in Agent Logs
- [ ] Handoff indicator shows between SourceScout and EvidencePlanner
- [ ] Active agent badges in logs panel header show Phase 2 agents
- [ ] New event types (searching, ranking, templates, risks) have colored badges
- [ ] Dual-phase stepper renders correctly
- [ ] Step labels are human-readable
- [ ] Scroll-to-step works for all Phase 2 steps
- [ ] Project page shows Phase 2 step/status correctly
- [ ] Full end-to-end flow: Phase 1 (3 steps) → Phase 2 (4 steps) works
- [ ] No visual regressions in Phase 1 UI

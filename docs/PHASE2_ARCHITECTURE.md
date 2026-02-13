# ResearchGPT — Phase 2: Research Plan Pack

## Full Architecture, Pipeline, Tools & Implementation Plan

---

## 1. Overview

Phase 2 begins after Phase 1 produces an **accepted topic** and **structured outline**. It guides the user toward a realistic, actionable research direction by:

- Recommending the best research approach (+ 2 backup options)
- Generating a comprehensive step-by-step plan (the **Research Plan Pack**)
- Providing curated resources **with links** (papers, tools, datasets, knowledge bases)

Phase 2 is designed for all topics (school, university, industry). It does not replace real research — it simulates research planning and provides structured guidance, resources, and templates.

**Key requirement**: Every recommended resource must include a clickable link (URL) whenever available.

---

## 2. Scope

### In Scope (v1)
- Single research approach per run (from 6 supported categories), with 2 alternatives suggested
- Capture user constraints: time, resources, ability to collect data
- Evidence plan + starter resources list (papers/tools/datasets/knowledge bases) with links
- Comprehensive "what to do next" plan + templates (survey questions, interview guide, experiment checklist, review protocol, evaluation rubric, etc.)
- Human checkpoints: user chooses the approach and pins/removes resources
- Live streaming logs (SSE) + persisted logs (reusing Phase 1 infrastructure)

### Out of Scope (v1)
- Auto PDF downloading and full-text ingestion at scale
- Arbitrary web scraping / paywalled scraping
- Running experiments, training models, or executing lab work
- Hybrid (multi-approach) research designs (planned for v2)

---

## 3. Supported Research Approaches (6 Categories)

| # | Approach | Primary/Secondary | Typical Use |
|---|----------|-------------------|-------------|
| 1 | Survey / Questionnaire | Primary | Collect new responses; analyze patterns |
| 2 | Controlled Experiment | Primary | Manipulate variables; measure outcomes |
| 3 | Interview / Qualitative Study | Primary | Open-ended data; thematic analysis |
| 4 | Public Dataset Analysis | Secondary | Use existing datasets/records; analyze/model |
| 5 | Systematic Literature Review | Secondary | Structured search/screening; synthesize |
| 6 | Comparative Evaluation | Secondary | Compare options using rubric/criteria |

The system recommends the best approach based on user constraints and topic, plus 2 backup alternatives.

---

## 4. Inputs & Outputs

### 4.1 Inputs (from Phase 1)
| Artifact | Description |
|----------|-------------|
| `accepted_topic` | Selected topic candidate (title, description, keywords, research_angle) |
| `outline` | Latest structured outline (title, abstract, sections with bullets, keywords) |
| `idea` | Original user idea (title, summary) — optional context |

### 4.2 Outputs (Phase 2 Artifacts)
| Artifact Step Name | Description |
|--------------------|-------------|
| `phase2_constraints` | User's time budget, data availability, resources, level |
| `phase2_approach_recommendation` | Refined problem statement, research questions, titles, best approach + 2 backups |
| `phase2_selected_approach` | User's chosen approach and title |
| `phase2_sources_pack` | Curated papers, datasets, tools, knowledge bases — all with URLs |
| `phase2_evidence_plan` | Evidence type, collection strategy, inclusion/exclusion criteria, analysis overview |
| `phase2_research_plan_pack` | Final comprehensive plan: methodology steps, templates, risks, next actions |

---

## 5. User Workflow (4 Wizard Steps)

Reuses the existing Run -> Steps -> Artifacts -> Logs structure from Phase 1.

```
Step 1: Constraints & Context
  |-- User enters: time budget, data availability, resources, level
  |-- Artifact: phase2_constraints
  |-- No LLM call (form submission only)

Step 2: Approach Recommendation & Selection
  |-- Trigger: ApproachRecommenderAgent (LangGraph)
  |-- Output: Refined question + title options + best approach + 2 backups
  |-- User selects one approach + title
  |-- Artifacts: phase2_approach_recommendation, phase2_selected_approach

Step 3: Evidence & Sources Pack
  |-- Trigger: SourceScoutAgent -> EvidencePlannerAgent (LangGraph pipeline)
  |-- Output: Curated resources list (with links) + evidence plan
  |-- User can pin/remove resources
  |-- Artifacts: phase2_sources_pack, phase2_evidence_plan

Step 4: Research Plan Pack (Final)
  |-- Trigger: MethodologyWriterAgent (LangGraph)
  |-- Output: Step-by-step plan + templates + risks checklist
  |-- User accepts or regenerates with feedback
  |-- Artifact: phase2_research_plan_pack
```

**Versioning rule**: Regenerating any step creates a new artifact version (v2, v3, ...). Previous versions remain in the DB.

---

## 6. Artifact Contracts (JSON Schemas)

### 6.1 `phase2_constraints`
```json
{
  "metadata": { "created_at": "<iso8601>", "user_level": "school|university|professional" },
  "time_budget": "hours|days|weeks|months",
  "data_availability": "none|public_only|can_collect",
  "resources": {
    "lab_access": true,
    "participants_access": false,
    "software_tools": ["Python", "SPSS"]
  },
  "notes": "free-text"
}
```

### 6.2 `phase2_approach_recommendation`
```json
{
  "metadata": { "model": "<groq-model>", "created_at": "<iso8601>" },
  "refined_problem_statement": "...",
  "refined_research_questions": ["RQ1...", "RQ2..."],
  "suggested_titles": ["Title A", "Title B", "Title C"],
  "recommended": {
    "approach": "<one-of-6>",
    "why_fit": ["reason 1", "reason 2"],
    "effort_level": "low|medium|high",
    "what_user_must_provide": ["survey platform", "participants"]
  },
  "alternatives": [
    { "approach": "<one-of-6>", "why": ["..."], "tradeoffs": ["..."] },
    { "approach": "<one-of-6>", "why": ["..."], "tradeoffs": ["..."] }
  ]
}
```

### 6.3 `phase2_selected_approach`
```json
{
  "metadata": { "selected_at": "<iso8601>" },
  "selected_approach": "<one-of-6>",
  "selected_title": "<chosen or edited title>",
  "user_overrides": { "notes": "..." }
}
```

### 6.4 `phase2_sources_pack`
**Hard requirement**: Every resource must include a URL when available. If missing, the system must explain why.
```json
{
  "metadata": {
    "created_at": "<iso8601>",
    "search_keywords": ["keyword1", "keyword2"],
    "source_providers": ["openalex", "semanticscholar", "crossref", "unpaywall", "tavily"]
  },
  "papers": [
    {
      "title": "...",
      "authors": ["Author A", "Author B"],
      "year": 2023,
      "venue": "Conference/Journal name",
      "doi": "10.xxxx/... (optional)",
      "url": "https://... (required if available)",
      "pdf_url": "https://... (optional, from Unpaywall)",
      "why_relevant": "...",
      "credibility_notes": "peer-reviewed|preprint|report|unknown"
    }
  ],
  "datasets": [
    {
      "name": "...",
      "domain": "...",
      "license": "... (if known)",
      "url": "https://... (required if available)",
      "why_relevant": "...",
      "notes": "..."
    }
  ],
  "tools": [
    {
      "name": "...",
      "type": "software|platform|library|instrument",
      "url": "https://... (required if available)",
      "why_useful": "...",
      "notes": "..."
    }
  ],
  "knowledge_bases": [
    { "name": "...", "url": "https://...", "why_useful": "..." }
  ]
}
```

### 6.5 `phase2_evidence_plan`
```json
{
  "metadata": { "created_at": "<iso8601>" },
  "evidence_type": "primary|secondary",
  "collection_strategy": ["Step 1: ...", "Step 2: ..."],
  "inclusion_exclusion": {
    "include": ["criteria 1", "criteria 2"],
    "exclude": ["criteria 1"]
  },
  "analysis_overview": "...",
  "expected_outputs": ["tables", "charts", "themes", "results summary"]
}
```

### 6.6 `phase2_research_plan_pack` (Final Output)
```json
{
  "metadata": {
    "model": "<groq-model>",
    "created_at": "<iso8601>",
    "source_pack_version": 1
  },
  "final_title": "...",
  "final_problem_statement": "...",
  "final_research_questions": ["RQ1...", "RQ2..."],
  "selected_approach": "<one-of-6>",
  "methodology_steps": [
    {
      "step": 1,
      "name": "Literature Review",
      "details": ["Search databases for...", "Screen using criteria..."],
      "deliverables": ["Annotated bibliography", "Gap analysis"]
    }
  ],
  "templates": {
    "survey_questions": ["Q1...", "Q2..."],
    "interview_guide": ["Topic 1...", "Probing questions..."],
    "experiment_checklist": ["Define variables...", "Control group..."],
    "review_protocol": {
      "databases": ["IEEE Xplore", "PubMed"],
      "screening_rules": ["Title/abstract scan", "Full-text review"]
    },
    "evaluation_rubric": [
      { "criterion": "Accuracy", "scoring": "1-5 scale with descriptors" }
    ]
  },
  "risks_constraints_ethics": [
    {
      "risk": "Low response rate",
      "impact": "high",
      "mitigation": "Offer incentives; extend collection window"
    }
  ],
  "next_actions": ["Draft survey instrument", "Submit IRB application"]
}
```

---

## 7. External APIs & Tools

### 7.1 Tool Stack (Decided)

| Tool | Purpose | Auth | Free Tier |
|------|---------|------|-----------|
| **Tavily** | General web search (datasets, tools, knowledge bases) | API key | 1,000 searches/month |
| **OpenAlex** | Paper search — broad coverage, no auth needed | None | Unlimited (polite pool) |
| **Semantic Scholar** | Paper citations, rankings, influential papers | API key | 100 req/s (with key) |
| **Crossref** | DOI metadata verification, clean author/venue data | None (polite pool, mailto) | Unlimited |
| **Unpaywall** | DOI -> open-access PDF link | Email (as param) | Unlimited |

### 7.2 API Integration Architecture

All API calls are made from the **backend only** (no API keys in frontend). The `SourceScoutAgent` orchestrates the calls in this order:

```
1. LLM generates search keywords from topic + approach + outline
     |
2. OpenAlex API -- search for papers by keyword -> get titles, authors, DOIs, URLs
     |
3. Semantic Scholar API -- enrich with citation counts, influential citations, abstracts
     |
4. Crossref API -- verify DOI metadata (clean titles, authors, venues)
     |
5. Unpaywall API -- for each DOI, check for open-access PDF link
     |
6. Tavily API -- search for datasets, tools, knowledge bases, additional web resources
     |
7. LLM ranks and filters results by relevance -> produces final sources_pack
```

### 7.3 API Client Modules (New Files)

```
backend/
  tools/
    __init__.py
    openalex.py        -- search_papers(keywords, limit) -> list[dict]
    semantic_scholar.py -- enrich_papers(paper_ids) -> list[dict]
    crossref.py        -- verify_doi(doi) -> dict
    unpaywall.py       -- get_oa_link(doi) -> str | None
    tavily_search.py   -- search_web(query, limit) -> list[dict]
```

Each module:
- Uses `httpx.AsyncClient` for async HTTP calls
- Reads API keys from environment variables (`.env`)
- Returns structured dicts (not raw API responses)
- Handles rate limiting and errors gracefully
- Logs search stats via `emit_log`

### 7.4 Environment Variables (New)

Add to `backend/.env`:
```
TAVILY_API_KEY=tvly-xxxxx
SEMANTIC_SCHOLAR_API_KEY=xxxxx
UNPAYWALL_EMAIL=user@example.com
```

OpenAlex and Crossref are free without keys (but should include a `mailto` parameter for polite pool access).

---

## 8. LangGraph Pipeline Design

### 8.1 Pipeline State

```python
class Phase2State(TypedDict):
    # Identifiers
    run_id: str
    token: str
    model: str

    # Inputs from Phase 1
    accepted_topic: dict        # from accepted_topic artifact
    outline: dict               # from outline artifact
    idea: dict                  # from idea artifact (optional)

    # User inputs (Step 1)
    constraints: dict           # from phase2_constraints artifact

    # Agent outputs
    approach_recommendation: dict  # ApproachRecommenderAgent output
    selected_approach: dict        # User selection (Step 2)
    sources_pack: dict             # SourceScoutAgent output
    evidence_plan: dict            # EvidencePlannerAgent output
    research_plan_pack: dict       # MethodologyWriterAgent output

    # Config
    feedback: str | None        # User feedback for regeneration
```

### 8.2 Agents (4 New Agents)

#### Agent 1: ApproachRecommenderAgent
- **File**: `backend/agents/phase2_approach.py`
- **Input**: accepted_topic + outline + constraints
- **Output**: `phase2_approach_recommendation` artifact
- **LLM Temperature**: 0.5 (balanced -- analytical but creative for titles)
- **Prompt strategy**: System prompt defines the 6 approaches with descriptions. Human prompt includes topic, outline, and constraints. LLM produces refined problem statement, research questions, suggested titles, and ranked approaches.
- **Logs**: `start` -> `thinking` -> `recommendation` -> `complete`

#### Agent 2: SourceScoutAgent
- **File**: `backend/agents/phase2_sources.py`
- **Input**: accepted_topic + outline + selected_approach + constraints
- **Output**: `phase2_sources_pack` artifact
- **LLM Temperature**: 0.3 (precise keyword generation + ranking)
- **Execution flow**:
  1. LLM generates search keywords (5-10 targeted keywords)
  2. Call OpenAlex API -> get papers
  3. Call Semantic Scholar API -> enrich with citations
  4. Call Crossref API -> verify DOI metadata
  5. Call Unpaywall API -> get open-access links
  6. Call Tavily API -> search for datasets, tools, knowledge bases
  7. LLM ranks and filters all results by relevance
  8. Produce final `sources_pack` with verified links
- **Logs**: `start` -> `thinking` (keyword generation) -> `searching` (per API) -> `ranking` -> `output` -> `complete`

#### Agent 3: EvidencePlannerAgent
- **File**: `backend/agents/phase2_evidence.py`
- **Input**: selected_approach + constraints + sources_pack
- **Output**: `phase2_evidence_plan` artifact
- **LLM Temperature**: 0.4 (structured, methodological)
- **Prompt strategy**: Based on selected approach, generate evidence collection strategy, inclusion/exclusion criteria, analysis overview, and expected outputs.
- **Logs**: `start` -> `thinking` -> `output` -> `complete`

#### Agent 4: MethodologyWriterAgent
- **File**: `backend/agents/phase2_methodology.py`
- **Input**: All previous artifacts (topic, approach, sources, evidence plan, constraints)
- **Output**: `phase2_research_plan_pack` artifact
- **LLM Temperature**: 0.6 (creative for templates, structured for methodology)
- **Prompt strategy**: Generate comprehensive step-by-step methodology, approach-specific templates (only relevant ones), risks/constraints/ethics, and next actions.
- **Logs**: `start` -> `thinking` -> `section` (per methodology step) -> `templates` -> `risks` -> `output` -> `complete`

### 8.3 LangGraph Execution (Step-Triggered, Not Monolithic)

Phase 2 does **not** run as a single end-to-end graph. Each wizard step triggers a separate graph/pipeline, with human checkpoints between steps:

```
Step 2 trigger -> ApproachRecommenderAgent graph -> store artifact -> await user selection

Step 3 trigger -> SourceScoutAgent -> EvidencePlannerAgent graph -> store artifacts -> await user review

Step 4 trigger -> MethodologyWriterAgent graph -> store artifact -> await user acceptance
```

**Step 3 uses a 2-node sequential graph:**
```python
graph = StateGraph(Phase2SourcesState)
graph.add_node("source_scout", source_scout_node)
graph.add_node("evidence_planner", evidence_planner_node)
graph.set_entry_point("source_scout")
graph.add_edge("source_scout", "evidence_planner")
graph.add_edge("evidence_planner", END)
```

Steps 2 and 4 use single-node graphs (one agent each).

---

## 9. Backend Endpoints (New)

### Phase 2 Endpoints

| Method | Path | Description | Triggers |
|--------|------|-------------|----------|
| `POST` | `/runs/{id}/phase2/continue` | Transition run from Phase 1 to Phase 2 | No agent -- updates run.phase and run.step |
| `POST` | `/runs/{id}/artifacts` | Submit constraints (Step 1) | No agent -- form data only (existing endpoint) |
| `POST` | `/runs/{id}/phase2/approach` | Trigger ApproachRecommenderAgent | Background task |
| `POST` | `/runs/{id}/phase2/select_approach` | Accept selected approach | No agent -- creates artifact |
| `POST` | `/runs/{id}/phase2/sources` | Trigger SourceScout + EvidencePlanner | Background task |
| `POST` | `/runs/{id}/phase2/plan` | Trigger MethodologyWriter | Background task |

All endpoints follow the existing pattern:
- Extract token -> verify run -> check not already running -> load input artifacts -> `asyncio.create_task()` -> return immediately

### Run Status Lifecycle (Phase 2)

```
Phase 1 completed (step="outline", status="completed")
  | User clicks "Continue to Phase 2"
Step 1: step="phase2_constraints", status="awaiting_feedback"
  | User submits constraints form
Step 2: step="phase2_approach", status="running" -> "awaiting_feedback"
  | User selects approach
Step 3: step="phase2_sources", status="running" -> "awaiting_feedback"
  | User reviews sources
Step 4: step="phase2_plan", status="running" -> "completed"
```

---

## 10. Frontend Design

### Phase 2 Run Detail Page

Phase 2 reuses the existing `RunDetail.tsx` pattern but extends it with 4 new step cards. When the run's phase is "phase2", the Phase 2 steps are displayed below the completed Phase 1 steps.

### New UI Components Needed

1. **Constraints Form** (Step 1)
   - Dropdowns: time_budget, data_availability, user_level
   - Checkboxes: lab_access, participants_access
   - Text input: software_tools, notes
   - Submit button

2. **Approach Recommendation Card** (Step 2)
   - Display refined problem statement and research questions
   - Show 3 suggested titles (radio select or editable)
   - Show recommended approach with "why it fits" bullets
   - Show 2 alternatives with tradeoffs
   - Select button per approach
   - Accept button to confirm selection

3. **Sources Pack Card** (Step 3)
   - Papers list: title, authors, year, venue, score, DOI link, PDF link
   - Datasets list: name, domain, license, URL
   - Tools list: name, type, URL, why useful
   - Knowledge bases: name, URL, why useful
   - Pin/unpin toggle per resource
   - Evidence plan summary (collapsible)

4. **Research Plan Pack Card** (Step 4)
   - Final title, problem statement, research questions
   - Methodology steps (numbered, expandable)
   - Templates section (tabs or accordion by type)
   - Risks table with impact/mitigation
   - Next actions checklist
   - Accept / Regenerate with feedback

### Agent Logs Panel

The existing `AgentLogsPanel.tsx` already supports new agents -- just add entries to `AGENT_CONFIG`:

| Agent Name | Icon | Color | Label |
|------------|------|-------|-------|
| `ApproachRecommender` | Compass | teal | Approach Recommender |
| `SourceScout` | Search | orange | Source Scout |
| `EvidencePlanner` | ClipboardList | cyan | Evidence Planner |
| `MethodologyWriter` | BookOpen | rose | Methodology Writer |

---

## 11. Database Changes

### No new tables needed.

Phase 2 uses the existing `artifacts` and `agent_logs` tables. The `step_name` column differentiates Phase 2 artifacts from Phase 1 artifacts.

### Same Run Transition

When Phase 1 completes (`step="outline", status="completed"`), the user clicks "Continue to Phase 2" which updates `run.phase = "phase2"` and `run.step = "phase2_constraints"`. All Phase 1 artifacts remain accessible on the same run.

### Step Values for Phase 2
```
"phase2_constraints" -> "phase2_approach" -> "phase2_sources" -> "phase2_plan"
```

---

## 12. File Changes Summary

### New Files (9)
| File | Description |
|------|-------------|
| `backend/tools/__init__.py` | Tools package init |
| `backend/tools/openalex.py` | OpenAlex paper search client |
| `backend/tools/semantic_scholar.py` | Semantic Scholar enrichment client |
| `backend/tools/crossref.py` | Crossref DOI verification client |
| `backend/tools/unpaywall.py` | Unpaywall open-access link finder |
| `backend/tools/tavily_search.py` | Tavily web search client |
| `backend/agents/phase2_approach.py` | ApproachRecommenderAgent (LangGraph) |
| `backend/agents/phase2_sources.py` | SourceScoutAgent + EvidencePlannerAgent (LangGraph) |
| `backend/agents/phase2_methodology.py` | MethodologyWriterAgent (LangGraph) |

### Modified Files (5)
| File | Changes |
|------|---------|
| `backend/main.py` | Add 5 Phase 2 endpoints |
| `backend/.env.example` | Add TAVILY_API_KEY, SEMANTIC_SCHOLAR_API_KEY, UNPAYWALL_EMAIL |
| `frontend/src/pages/RunDetail.tsx` | Add Phase 2 step cards + "Continue to Phase 2" button |
| `frontend/src/types/api.ts` | Add Phase 2 artifact type interfaces |
| `frontend/src/components/AgentLogsPanel.tsx` | Add 4 new agent configs to AGENT_CONFIG |

---

## 13. Implementation Order (Sprint Plan)

### Sprint 2A: Foundation (Backend Tools + Constraints)
1. Create `backend/tools/` package with all 5 API clients
2. Add environment variables to `.env` and `.env.example`
3. Add "Continue to Phase 2" transition endpoint
4. Add Phase 2 constraints submission (via existing artifacts endpoint)
5. Frontend: "Continue to Phase 2" button + Constraints form (Step 1)
6. Test: Submit constraints, verify artifact persisted

### Sprint 2B: Approach Recommendation (Step 2)
1. Create `backend/agents/phase2_approach.py` (ApproachRecommenderAgent)
2. Add `POST /runs/{id}/phase2/approach` endpoint
3. Add `POST /runs/{id}/phase2/select_approach` endpoint
4. Frontend: Approach recommendation display + selection UI
5. Test: Full Step 2 flow with real Groq calls

### Sprint 2C: Sources & Evidence (Step 3)
1. Create `backend/agents/phase2_sources.py` (SourceScout + EvidencePlanner)
2. Add `POST /runs/{id}/phase2/sources` endpoint
3. Frontend: Sources pack display with pin/unpin + evidence plan
4. Test: Full Step 3 flow with real API calls (all 5 APIs)

### Sprint 2D: Research Plan Pack (Step 4)
1. Create `backend/agents/phase2_methodology.py` (MethodologyWriter)
2. Add `POST /runs/{id}/phase2/plan` endpoint
3. Frontend: Research Plan Pack display with templates + risks
4. Test: Full end-to-end Phase 1 -> Phase 2 flow

### Sprint 2E: Polish & Integration
1. Agent logs panel: add 4 new agent configs
2. Stepper UI: extend to show both Phase 1 and Phase 2 steps
3. Phase 2 completion banner
4. Feedback/regeneration for all Phase 2 steps
5. End-to-end testing

---

## 14. Safety & Quality Notes

- For sensitive or high-risk topics (medical, chemistry, hazardous experiments), Phase 2 provides planning-level guidance only, emphasizing safe practices, ethics, and supervision requirements.
- All API keys stored in `.env`, never exposed to frontend.
- Rate limiting: Use polite pool headers for OpenAlex/Crossref, respect Semantic Scholar rate limits.
- Link verification: SourceScoutAgent verifies URLs are accessible before including them.

---

## 15. Acceptance Criteria (Definition of Done)

- [ ] Phase 2 run exists and progresses through 4 gated steps
- [ ] "I cannot collect data" is supported -- shifts to secondary approaches
- [ ] Every recommended resource includes a URL when available
- [ ] Artifacts are versioned and viewable; pinned choices preserved
- [ ] Live logs stream and persist correctly with new agent identities
- [ ] Approach-specific templates generated (only relevant ones per approach)
- [ ] Full Phase 1 -> Phase 2 transition works seamlessly
- [ ] All 5 external APIs integrated and returning real results
- [ ] Regeneration with feedback works for all Phase 2 steps

---

## Appendix A: API Reference Links

| API | Documentation |
|-----|--------------|
| OpenAlex | https://docs.openalex.org/ |
| Semantic Scholar | https://www.semanticscholar.org/product/api |
| Crossref | https://www.crossref.org/documentation/retrieve-metadata/rest-api/ |
| Unpaywall | https://unpaywall.org/products/api |
| Tavily | https://docs.tavily.com/ |

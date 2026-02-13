# Phase 2 — Task 5: SourceScoutAgent + EvidencePlannerAgent

## Goal
Create the 2-node LangGraph pipeline that searches for real resources (papers, datasets, tools, knowledge bases) using all 5 external APIs, then generates an evidence collection plan. This is the most complex agent — it integrates the tool clients from Task 1.

## Prerequisites
- Task 1 completed (all 5 API clients working)
- Task 4 completed (approach selected, `phase2_selected_approach` artifact exists)
- API keys configured in `backend/.env`

## Safety Rules
- Create ONE new file: `backend/agents/phase2_sources.py`
- Modify `backend/main.py` — add ONE new endpoint (append only)
- Modify `frontend/src/pages/RunDetail.tsx` — add Step 3 UI card
- DO NOT modify tool clients, Phase 1 code, or other agents

---

## Backend: New Agent

### File: `backend/agents/phase2_sources.py`

This file contains TWO agents in a single 2-node sequential graph.

#### State
```python
class SourcesState(TypedDict):
    run_id: str
    token: str
    model: str
    accepted_topic: dict
    outline: dict
    constraints: dict
    selected_approach: dict
    feedback: str | None
    sources_pack: dict          # SourceScout output
    evidence_plan: dict         # EvidencePlanner output
```

#### Node 1: `source_scout_node`

**Execution flow:**

1. **Keyword generation** (LLM call, temp=0.3):
   - Input: topic title, description, keywords, research angle, approach, outline sections
   - Output: 5-10 search keywords/phrases
   - Log: `"SourceScout"` / `"thinking"` / `"Generated N search keywords: ..."`

2. **Paper search** (API calls, parallel where possible):
   - Call `openalex.search_papers(keywords)` → get up to 10 papers
   - Call `semantic_scholar.search_papers(query)` → get up to 10 papers
   - **Merge and deduplicate** using the following algorithm:
     ```
     a. Build a dict keyed by DOI (normalized to lowercase, stripped of URL prefix)
     b. For papers without DOIs, use normalized title (lowercase, stripped of punctuation) as key
     c. When both APIs return the same paper:
        - Prefer Semantic Scholar data for: citation_count, influential_citation_count, abstract
        - Prefer OpenAlex data for: open_access_url (if present)
        - Merge all available fields (union, not replace)
     d. Final deduped list sorted by citation_count desc
     ```
   - Log: `"SourceScout"` / `"searching"` / `"Found N papers from OpenAlex, M from Semantic Scholar, K unique after dedup"`

3. **DOI verification** (for papers with DOIs):
   - For each unique DOI, call `crossref.verify_doi(doi)` — verify metadata
   - Update paper metadata where Crossref data is more complete
   - Log: `"SourceScout"` / `"searching"` / `"Verified N DOIs via Crossref"`

4. **Open access links** (for papers with DOIs):
   - For each DOI, call `unpaywall.get_open_access_url(doi)`
   - Add `pdf_url` to papers where available
   - Log: `"SourceScout"` / `"searching"` / `"Found N open-access PDFs via Unpaywall"`

5. **Web search for datasets, tools, knowledge bases**:
   - Call `tavily_search.search_web()` with 3 targeted queries:
     - `"{topic} datasets research"` → classify results as datasets
     - `"{topic} software tools libraries"` → classify results as tools
     - `"{topic} knowledge base resources guide"` → classify results as knowledge_bases
   - Log: `"SourceScout"` / `"searching"` / `"Found N web resources via Tavily"`

6. **Ranking and filtering** (LLM call, temp=0.3):
   - Input: All collected resources + topic + approach
   - Task: Rank by relevance, add `why_relevant` / `why_useful` annotations, filter out low-quality
   - Output: Final `sources_pack` matching the artifact contract
   - Log: `"SourceScout"` / `"ranking"` / `"Ranked and filtered to N papers, M datasets, K tools, L knowledge bases"`

7. Log: `"SourceScout"` / `"complete"` / `"Source discovery complete. N total resources with links."`

**Important**: All API calls should use `asyncio.gather()` where independent (e.g., OpenAlex + Semantic Scholar in parallel, then Crossref + Unpaywall after, then Tavily). Handle individual API failures gracefully — if one API fails, continue with others.

**Return**: `{"sources_pack": { ... }}` state update

#### Node 2: `evidence_planner_node`

**LLM call** (temp=0.4):
- Input: selected_approach, constraints, sources_pack summary (number of papers/datasets/tools found)
- System prompt: Based on the approach type, generate an evidence collection plan
- Output: `phase2_evidence_plan` artifact content
- Log: `"EvidencePlanner"` / `"start"` → `"thinking"` → `"output"` → `"complete"`

**Approach-specific logic in prompt**:
- Survey → describe survey design, sampling, distribution strategy
- Experiment → describe variables, control group, measurement protocol
- Interview → describe participant selection, question design, coding approach
- Dataset Analysis → describe dataset selection, preprocessing, analysis methods
- Literature Review → describe search strategy, screening, synthesis method
- Comparative Evaluation → describe criteria definition, scoring, comparison framework

**Return**: `{"evidence_plan": { ... }}` state update

#### Graph
```python
graph = StateGraph(SourcesState)
graph.add_node("source_scout", source_scout_node)
graph.add_node("evidence_planner", evidence_planner_node)
graph.set_entry_point("source_scout")
graph.add_edge("source_scout", "evidence_planner")
graph.add_edge("evidence_planner", END)
sources_graph = graph.compile()
```

#### Entry point
```python
async def run_sources_and_evidence(
    run_id, token, accepted_topic, outline, constraints, selected_approach, feedback=None
) -> None:
```
1. `update_run(status="running", step="phase2_sources")`
2. Build state, invoke graph
3. `create_artifact("phase2_sources_pack", result["sources_pack"])`
4. `create_artifact("phase2_evidence_plan", result["evidence_plan"])`
5. `update_run(status="awaiting_feedback", step="phase2_sources")`

---

## Backend: New Endpoint

### File: `backend/main.py`

#### `POST /runs/{run_id}/phase2/sources`

**Logic:**
1. Extract token, verify run
2. Check `run.phase == "phase2"`, status != "running"
3. Load 4 artifacts: `accepted_topic`, `outline`, `phase2_constraints`, `phase2_selected_approach`
4. All must exist — otherwise 400
5. Parse optional body: `{ "feedback": "..." }`
6. `asyncio.create_task(run_sources_and_evidence(...))`
7. Return `{"status": "running", "step": "phase2_sources"}`

---

## Frontend: Step 3 UI

### File: `frontend/src/pages/RunDetail.tsx`

Add Step 3 card below Step 2.

**New state:**
```typescript
const [runningSources, setRunningSources] = useState(false)
const [sourcesFeedback, setSourcesFeedback] = useState('')
```

**New derived state:**
```typescript
const hasSourcesPack = artifacts.some((a) => a.step_name === 'phase2_sources_pack')
const hasEvidencePlan = artifacts.some((a) => a.step_name === 'phase2_evidence_plan')
```

**UI Card: "Step 3: Evidence & Sources"**

Guard: show only if `hasSelectedApproach`, otherwise amber warning.

**Trigger section:**
- Feedback textarea (optional)
- "Search for Resources" / "Regenerate" button
- On click: POST + optimistic update + scroll to logs

**Sources display** (when `hasSourcesPack`):

Papers section:
- Each paper: title (linked to URL), authors, year, venue, DOI badge, PDF link button
- Relevance note, credibility badge (peer-reviewed / preprint / etc.)

Datasets section:
- Each dataset: name (linked to URL), domain, license, relevance note

Tools section:
- Each tool: name (linked to URL), type badge, why useful

Knowledge Bases section:
- Each KB: name (linked to URL), why useful

**Evidence Plan display** (when `hasEvidencePlan`, collapsible):
- Evidence type badge (primary/secondary)
- Collection strategy (numbered steps)
- Inclusion/exclusion criteria lists
- Analysis overview text
- Expected outputs list

---

## TypeScript Interfaces

### File: `frontend/src/types/api.ts`

```typescript
export interface SourcesPack {
  metadata: {
    created_at: string
    search_keywords: string[]
    source_providers: string[]
  }
  papers: Array<{
    title: string
    authors: string[]
    year: number
    venue: string
    doi?: string
    url?: string
    pdf_url?: string
    why_relevant: string
    credibility_notes: string
  }>
  datasets: Array<{
    name: string
    domain: string
    license?: string
    url?: string
    why_relevant: string
    notes?: string
  }>
  tools: Array<{
    name: string
    type: string
    url?: string
    why_useful: string
    notes?: string
  }>
  knowledge_bases: Array<{
    name: string
    url?: string
    why_useful: string
  }>
}

export interface EvidencePlan {
  metadata: { created_at: string }
  evidence_type: 'primary' | 'secondary'
  collection_strategy: string[]
  inclusion_exclusion: {
    include: string[]
    exclude: string[]
  }
  analysis_overview: string
  expected_outputs: string[]
}
```

---

## Verification Checklist
- [ ] `backend/agents/phase2_sources.py` created with 2-node graph
- [ ] SourceScout calls all 5 APIs and handles failures gracefully
- [ ] EvidencePlanner generates approach-specific evidence plan
- [ ] Both artifacts (`phase2_sources_pack`, `phase2_evidence_plan`) persisted
- [ ] SSE logs show both agents with handoff indicator
- [ ] Papers have real URLs and DOIs (from OpenAlex/Semantic Scholar)
- [ ] Open-access PDF links populated where available (from Unpaywall)
- [ ] Datasets, tools, knowledge bases found via Tavily with real URLs
- [ ] Frontend displays all resource categories with clickable links
- [ ] Evidence plan renders correctly for different approach types
- [ ] Regeneration with feedback creates new artifact versions
- [ ] All previous tasks still work

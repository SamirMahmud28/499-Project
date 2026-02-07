# Phase 1 — Generate Outline (Task 7C)

## Endpoint

**POST** `/runs/{run_id}/phase1/outline`

### Auth
`Authorization: Bearer <supabase_access_token>`

### Request Body (optional)
```json
{ "feedback": "Add a section on ethical implications..." }
```

### Flow
1. Loads `accepted_topic` artifact (required; 400 if missing).
2. Loads `idea` artifact (optional, for additional context).
3. Runs LangGraph `OutlineWriter` graph as background task.
4. OutlineWriter calls Groq to generate a structured outline.
5. Saves `outline` artifact with auto-incremented version.
6. Updates run: `step="outline"`, `status="completed"` (Phase 1 done).

### LangGraph Workflow
```
outline_writer_node -> END
```

Single node, compiled once at module level in `agents/phase1_outline.py`.

### Outline Artifact Content
```json
{
  "title": "Final Working Title",
  "abstract": "6-10 sentence abstract...",
  "sections": [
    { "name": "Introduction", "bullets": ["...", "..."] },
    { "name": "Background & Related Work", "bullets": ["...", "..."] },
    { "name": "Methodology", "bullets": ["...", "..."] },
    { "name": "Data Collection & Analysis", "bullets": ["...", "..."] },
    { "name": "Expected Results & Discussion", "bullets": ["...", "..."] },
    { "name": "Limitations & Future Work", "bullets": ["...", "..."] },
    { "name": "Conclusion", "bullets": ["...", "..."] }
  ],
  "keywords": ["keyword1", "keyword2", "..."],
  "metadata": {
    "model": "llama-3.3-70b-versatile",
    "feedback": null,
    "source_topic": "Accepted Topic Title"
  }
}
```

### Agent Logs Emitted
| Agent | Event | Description |
|-------|-------|-------------|
| OutlineWriter | start | Starting outline generation |
| OutlineWriter | thinking | Calling Groq LLM |
| OutlineWriter | section | Per-section progress (name + bullet count) |
| OutlineWriter | output | Outline ready with section count |
| OutlineWriter | complete | Done |

### Response
```json
{ "status": "running", "run_id": "...", "step": "outline" }
```

### Error Codes
| Code | Reason |
|------|--------|
| 400 | No accepted_topic artifact found |
| 401 | Missing or invalid token |
| 404 | Run not found |
| 409 | Pipeline already running |

## Frontend
- Step 3 card shows accepted topic at the top (green banner)
- Optional feedback textarea for regeneration
- "Generate Outline" / "Regenerate Outline" button
- Outline rendered as: Title, Abstract, numbered Sections with bullet lists, Keywords
- Version indicator shown
- Regeneration creates outline v2, v3, etc.

## Regeneration
Calling the endpoint again (with optional feedback) creates a new version of the outline artifact. The run status cycles: `completed -> running -> completed`.

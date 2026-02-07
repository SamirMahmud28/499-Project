# Phase 1 — Accept Topic (Task 7B)

## Endpoint

**POST** `/runs/{run_id}/phase1/accept_topic`

### Auth
`Authorization: Bearer <supabase_access_token>`

### Request Body
```json
{ "candidate_index": 0 }
```

### Flow
1. Loads latest `topic_critic` artifact for the run.
2. Validates `candidate_index` is within range of candidates array.
3. Creates `accepted_topic` artifact with content:
   ```json
   {
     "selected_index": 0,
     "selected": { "title": "...", "description": "...", "keywords": [...], "research_angle": "..." },
     "source_topic_critic_version": 1,
     "accepted_at": "2025-01-01T00:00:00Z"
   }
   ```
4. Updates run: `step="outline"`, `status="awaiting_feedback"`.
5. Emits logs: `[Orchestrator] start/output/complete`.

### Response
```json
{
  "status": "accepted",
  "run": { ... },
  "accepted_topic": { ... }
}
```

### Error Codes
| Code | Reason |
|------|--------|
| 400 | Missing candidate_index, no topic_critic artifact, index out of range |
| 401 | Missing or invalid token |
| 404 | Run not found |

## Frontend
- Step 2 card displays candidate list from topic_critic artifact
- Radio buttons for selection (recommended candidate highlighted)
- Shows rank, score, description, keywords per candidate
- "Accept Selected Topic" button calls the endpoint
- On success: run step advances to `outline`, artifacts refresh

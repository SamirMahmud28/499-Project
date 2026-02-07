# Data Model & Row Level Security (Phase 1)

> **Note:** This documentation supplements [CLAUDE.md](../CLAUDE.md). In case of conflicts, CLAUDE.md takes precedence.

## Schema Source

**SQL file:** [`supabase/schema_phase1.sql`](../supabase/schema_phase1.sql)

---

## Table Relationships

```
auth.users (managed by Supabase)
  │
  └─ projects (user_id → auth.uid())
       │
       └─ runs (project_id → projects.id)
            │
            ├─ artifacts (run_id → runs.id)
            │
            └─ agent_logs (run_id → runs.id)
```

All child tables cascade-delete when their parent is removed.

---

## Tables

### projects
Stores user research projects.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid PK | `gen_random_uuid()` | |
| user_id | uuid NOT NULL | `auth.uid()` | Owner |
| name | text NOT NULL | | Project name |
| description | text | | Optional |
| created_at | timestamptz | `now()` | |
| updated_at | timestamptz | `now()` | Auto-updated by trigger |

### runs
One wizard execution within a project.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid PK | `gen_random_uuid()` | |
| project_id | uuid NOT NULL | | FK → projects(id) CASCADE |
| phase | text NOT NULL | `'phase1'` | |
| step | text | | `idea` / `topic_critic` / `outline` |
| status | text NOT NULL | `'running'` | `running` / `awaiting_feedback` / `completed` / `failed` |
| model_config | jsonb | `'{}'` | LLM settings |
| created_at | timestamptz | `now()` | |
| updated_at | timestamptz | `now()` | Auto-updated by trigger |

### artifacts
Versioned outputs from each wizard step.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid PK | `gen_random_uuid()` | |
| run_id | uuid NOT NULL | | FK → runs(id) CASCADE |
| step_name | text NOT NULL | | Which step produced this |
| version | int NOT NULL | `1` | Increments on regenerate |
| content | jsonb NOT NULL | | The actual output |
| created_at | timestamptz | `now()` | |

### agent_logs
Streaming log events from agents.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid PK | `gen_random_uuid()` | |
| run_id | uuid NOT NULL | | FK → runs(id) CASCADE |
| agent_name | text NOT NULL | | Which agent emitted this |
| event_type | text NOT NULL | | e.g. `start`, `llm_call`, `error`, `done` |
| payload | jsonb | `'{}'` | Event-specific data |
| created_at | timestamptz | `now()` | |

---

## Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_projects_user_id` | projects(user_id) | Fast lookup of user's projects |
| `idx_runs_project_id` | runs(project_id) | Fast lookup of project's runs |
| `idx_artifacts_run_step_ver` | artifacts(run_id, step_name, version) | Fast latest-version lookup |
| `idx_agent_logs_run_created` | agent_logs(run_id, created_at) | Fast chronological log retrieval |

---

## Row Level Security (RLS)

### Why RLS?

RLS enforces data isolation **at the database level**. Even if application code has a bug, a user can never see another user's data because PostgreSQL itself blocks it.

### How It Works

1. User authenticates → Supabase issues JWT containing `user_id`
2. Every query includes the JWT automatically
3. `auth.uid()` extracts the `user_id` from the JWT
4. RLS policies filter rows before returning results

### Policy Strategy

**projects** — direct ownership check:
```sql
user_id = auth.uid()
```

**runs / artifacts / agent_logs** — join back to projects:
```sql
exists (
  select 1 from projects
  where projects.id = runs.project_id
    and projects.user_id = auth.uid()
)
```

This means there's no need for a denormalized `user_id` on child tables. Ownership is determined by tracing back to the project.

### Policy Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| projects | own only | own only | own only | own only |
| runs | via project owner | via project owner | via project owner | via project owner |
| artifacts | via project owner | via project owner | via project owner | via project owner |
| agent_logs | via project owner | via project owner | via project owner | via project owner |

### Private-Only Guarantee

Phase 1 has **no sharing**. Every policy checks that the requesting user owns the root project. There are no `OR` clauses for shared access — data is strictly private per user. This directly satisfies the CLAUDE.md requirement: "Private-only projects (no sharing)."

---

## Triggers

| Trigger | Table | Action |
|---------|-------|--------|
| `set_projects_updated_at` | projects | Sets `updated_at = now()` on UPDATE |
| `set_runs_updated_at` | runs | Sets `updated_at = now()` on UPDATE |

Both use the shared `public.set_updated_at()` function.

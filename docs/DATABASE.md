# Database Documentation

> **Note:** This documentation supplements [CLAUDE.md](../CLAUDE.md), which serves as the master implementation rules. In case of conflicts, CLAUDE.md takes precedence.

## Purpose
This document describes the database schema, Supabase configuration, Row Level Security (RLS) policies, and data models for ResearchGPT.

---

## Database Provider

**Supabase PostgreSQL**

- Managed PostgreSQL database
- Built-in authentication integration
- Row Level Security (RLS) for multi-user isolation
- Real-time subscriptions (if needed in future)
- RESTful API (auto-generated)

---

## Supabase Setup

### Project Configuration

1. **Create Supabase Project:**
   - Visit [supabase.com](https://supabase.com)
   - Create new project
   - Note down project URL and API keys

2. **Environment Variables:**

   **Backend (.env):**
   ```env
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_ANON_KEY=eyJhbG...  (public key, safe for frontend too)
   SUPABASE_SERVICE_ROLE_KEY=eyJhbG...  (private, backend only!)
   ```

   **Frontend (.env):**
   ```env
   VITE_SUPABASE_URL=https://xxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbG...  (same as backend anon key)
   ```

3. **Enable Email Auth:**
   - Go to Authentication → Providers
   - Enable Email provider
   - Configure email templates

---

## Schema Overview

**Phase 1 SQL file:** [`supabase/schema_phase1.sql`](../supabase/schema_phase1.sql)
**Detailed docs:** [`docs/08-data-model-rls.md`](08-data-model-rls.md) | [`docs/09-supabase-setup.md`](09-supabase-setup.md)

### Tables

```
auth.users (managed by Supabase)
   │
   └─ public.projects (user_id)
        │
        └─ public.runs (project_id)
             │
             ├─ public.artifacts (run_id)
             │
             └─ public.agent_logs (run_id)
```

---

## Table Definitions

### 1. auth.users

**Managed by Supabase Auth.** Do not modify directly.

**Key Fields:**
- `id` (uuid, primary key)
- `email` (text, unique)
- `email_confirmed_at` (timestamp)
- `created_at` (timestamp)

---

### 2. profiles

User profile information (extends auth.users).

**SQL:**
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Trigger: Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Trigger: Update updated_at on changes
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

### 3. projects

User research projects.

**SQL:**
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view own projects
CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert own projects
CREATE POLICY "Users can insert own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update own projects
CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete own projects
CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger: Update updated_at
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Fields:**
- `id` - UUID primary key
- `user_id` - Owner of the project
- `title` - Project name
- `description` - Optional description
- `created_at` - When created
- `updated_at` - Last modified

---

### 4. runs

Wizard execution runs within a project.

**SQL:**
```sql
CREATE TYPE run_status AS ENUM (
  'idea_submitted',
  'generating_topic',
  'topic_ready',
  'generating_outline',
  'outline_ready',
  'completed',
  'failed'
);

CREATE TABLE runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idea TEXT NOT NULL,
  topic TEXT,
  critic_feedback TEXT,
  outline JSONB,
  status run_status DEFAULT 'idea_submitted',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_runs_project_id ON runs(project_id);
CREATE INDEX idx_runs_user_id ON runs(user_id);
CREATE INDEX idx_runs_status ON runs(status);
CREATE INDEX idx_runs_created_at ON runs(created_at DESC);

-- Enable RLS
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view own runs
CREATE POLICY "Users can view own runs"
  ON runs FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert own runs
CREATE POLICY "Users can insert own runs"
  ON runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update own runs
CREATE POLICY "Users can update own runs"
  ON runs FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete own runs
CREATE POLICY "Users can delete own runs"
  ON runs FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger: Update updated_at
CREATE TRIGGER update_runs_updated_at
  BEFORE UPDATE ON runs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Fields:**
- `id` - UUID primary key
- `project_id` - Associated project
- `user_id` - Owner (denormalized for RLS)
- `idea` - User's research idea
- `topic` - Generated topic (nullable until ready)
- `critic_feedback` - Critic's feedback (nullable)
- `outline` - JSON outline structure (nullable)
- `status` - Current run status
- `created_at`, `updated_at` - Timestamps

**Outline JSON Structure:**
```json
{
  "introduction": "...",
  "sections": [
    {
      "title": "Section Title",
      "subsections": ["Subsection 1", "Subsection 2"]
    }
  ],
  "conclusion": "..."
}
```

---

### 5. agent_logs

Streaming logs from agent execution.

**SQL:**
```sql
CREATE TYPE log_level AS ENUM ('info', 'warning', 'error', 'success');

CREATE TABLE agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  level log_level DEFAULT 'info',
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_agent_logs_run_id ON agent_logs(run_id);
CREATE INDEX idx_agent_logs_user_id ON agent_logs(user_id);
CREATE INDEX idx_agent_logs_created_at ON agent_logs(created_at);

-- Enable RLS
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view logs for their runs
CREATE POLICY "Users can view own logs"
  ON agent_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Backend can insert logs (uses service role key)
CREATE POLICY "Service role can insert logs"
  ON agent_logs FOR INSERT
  WITH CHECK (true);  -- Backend uses service role key, bypasses RLS
```

**Fields:**
- `id` - UUID primary key
- `run_id` - Associated run
- `user_id` - Owner (denormalized for RLS)
- `agent_name` - Name of agent that created log
- `level` - Log level (info, warning, error, success)
- `message` - Log message
- `metadata` - Optional JSON metadata
- `created_at` - When log was created

---

## Helper Functions

### update_updated_at_column()

Auto-updates `updated_at` timestamp.

**SQL:**
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## Row Level Security (RLS)

### What is RLS?

Row Level Security allows you to define policies that restrict which rows users can access at the database level.

**Benefits:**
- Enforced in database (not just application code)
- Multi-user isolation guaranteed
- Works with Supabase auto-generated APIs
- Reduces backend security logic

### How RLS Works in ResearchGPT

1. **User authenticates** → receives JWT token
2. **Token includes `user_id`** (extracted by Supabase)
3. **Queries automatically filtered** by RLS policies
4. **Users can only see/modify their own data**

**Example:**
```sql
-- This policy ensures users only see their own projects
CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  USING (auth.uid() = user_id);
```

When user queries `SELECT * FROM projects`, PostgreSQL automatically adds:
```sql
WHERE user_id = auth.uid()
```

### RLS Policy Summary

| Table | Operation | Policy |
|-------|-----------|--------|
| profiles | SELECT | Own profile only |
| profiles | UPDATE | Own profile only |
| projects | ALL | Own projects only |
| runs | ALL | Own runs only |
| agent_logs | SELECT | Own logs only |
| agent_logs | INSERT | Service role (backend) |

---

## Auth Integration

### Email Verification Flow

1. User signs up via `/auth/signup`
2. Supabase creates user in `auth.users` (email_confirmed_at = NULL)
3. Supabase sends verification email
4. User clicks link → redirects to frontend
5. Frontend calls `/auth/verify-email` with token
6. Backend verifies with Supabase → email_confirmed_at set
7. User can now log in

### User Metadata

Store additional user info in `profiles` table, not in `auth.users.raw_user_meta_data`.

**Why:**
- Easier to query
- Supports RLS
- More flexible schema

---

## Migrations

### Creating Migrations

**Manual SQL Files:**
```
database/migrations/
├── 001_create_profiles.sql
├── 002_create_projects.sql
├── 003_create_runs.sql
└── 004_create_agent_logs.sql
```

**Using Supabase CLI:**
```bash
supabase migration new create_profiles
# Edit generated file
supabase db push
```

### Running Migrations

**Development:**
Run SQL files in Supabase Dashboard → SQL Editor

**Production:**
Use Supabase CLI or dashboard to apply migrations

**Important:**
- Always test migrations on staging first
- Migrations should be idempotent (can run multiple times safely)
- Use transactions for multi-step migrations

---

## Data Access Patterns

### Backend (Python)

**Using Supabase Client:**
```python
from supabase import create_client

# Initialize
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Query with RLS (pass user JWT)
projects = supabase.table("projects") \
    .select("*") \
    .eq("user_id", user_id) \
    .execute()

# Insert
new_project = supabase.table("projects").insert({
    "user_id": user_id,
    "title": "My Project"
}).execute()

# Update
supabase.table("runs") \
    .update({"status": "topic_ready", "topic": "..."}) \
    .eq("id", run_id) \
    .execute()

# Delete
supabase.table("projects").delete().eq("id", project_id).execute()
```

### Frontend (TypeScript)

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// Query (RLS automatically applied with user's JWT)
const { data: projects, error } = await supabase
  .from('projects')
  .select('*')
  .order('created_at', { ascending: false })

// Insert
const { data, error } = await supabase
  .from('projects')
  .insert({ title: 'New Project' })
```

---

## Backup Strategy

### Supabase Auto-Backups

- Daily backups (Pro plan)
- Point-in-time recovery
- Manual backup downloads

### Manual Backups

```bash
# Using pg_dump
pg_dump -h db.xxx.supabase.co -U postgres -d postgres > backup.sql

# Restore
psql -h db.xxx.supabase.co -U postgres -d postgres < backup.sql
```

---

## Performance Optimization

### Indexes

Already included in schema:
- `user_id` on all user-owned tables
- `created_at` for sorting
- Foreign keys automatically indexed

### Future Optimization

**Partitioning:**
If `agent_logs` grows very large, consider partitioning by date:
```sql
CREATE TABLE agent_logs_2024_01 PARTITION OF agent_logs
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

**Materialized Views:**
For complex queries (e.g., project stats):
```sql
CREATE MATERIALIZED VIEW project_stats AS
SELECT project_id, COUNT(*) as run_count, ...
FROM runs
GROUP BY project_id;
```

---

## References

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL RLS Guide](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [PostgreSQL JSONB](https://www.postgresql.org/docs/current/datatype-json.html)

# Supabase Setup Guide (Phase 1)

> **Note:** This documentation supplements [CLAUDE.md](../CLAUDE.md). In case of conflicts, CLAUDE.md takes precedence.

## Prerequisites

- A Supabase project already created (you should have `SUPABASE_URL` and keys configured in `.env` files)
- Access to the Supabase Dashboard for your project

---

## Step 1: Apply the Schema

1. Open your Supabase Dashboard
2. Go to **SQL Editor** (left sidebar)
3. Click **New query**
4. Open [`supabase/schema_phase1.sql`](../supabase/schema_phase1.sql) from this repo
5. Copy the **entire file contents** and paste into the SQL Editor
6. Click **Run** (or press Ctrl+Enter)
7. You should see `Success. No rows returned` — this is expected

---

## Step 2: Verify Tables Exist

Go to **Table Editor** in the sidebar. You should see four new tables:

- `projects`
- `runs`
- `artifacts`
- `agent_logs`

Click each table to confirm columns match the schema.

---

## Step 3: Verify RLS Is Enabled

1. Go to **Authentication → Policies** in the sidebar
2. You should see all four tables listed with RLS **enabled** (green shield icon)
3. Each table should have 4 policies (select, insert, update, delete)

**Or verify via SQL:**

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('projects', 'runs', 'artifacts', 'agent_logs');
```

Expected: all four rows show `rowsecurity = true`.

---

## Step 4: Verify Policies Exist

Run this in SQL Editor:

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, cmd;
```

Expected output (16 policies total):

| tablename | policyname | cmd |
|-----------|------------|-----|
| agent_logs | agent_logs_select | SELECT |
| agent_logs | agent_logs_insert | INSERT |
| agent_logs | agent_logs_update | UPDATE |
| agent_logs | agent_logs_delete | DELETE |
| artifacts | artifacts_select | SELECT |
| artifacts | artifacts_insert | INSERT |
| artifacts | artifacts_update | UPDATE |
| artifacts | artifacts_delete | DELETE |
| projects | projects_select | SELECT |
| projects | projects_insert | INSERT |
| projects | projects_update | UPDATE |
| projects | projects_delete | DELETE |
| runs | runs_select | SELECT |
| runs | runs_insert | INSERT |
| runs | runs_update | UPDATE |
| runs | runs_delete | DELETE |

---

## Step 5: Quick Smoke Test

Run this in SQL Editor to confirm RLS blocks anonymous access:

```sql
-- This should return 0 rows (not an error) because
-- there is no authenticated user in the SQL Editor context
select * from public.projects;
```

If it returns 0 rows, RLS is working. The SQL Editor runs as the `postgres` role by default, but when accessed via the API with a user JWT, only that user's rows will be visible.

---

## Troubleshooting

**"permission denied for table projects"**
- RLS is enabled but no policies match. This is correct behavior for unauthenticated access.

**Tables not showing in Table Editor**
- Make sure you ran the SQL in the correct project. Check the project URL in the browser matches your `.env` files.

**"function auth.uid() does not exist"**
- You're running the SQL outside of Supabase (e.g., a local Postgres). The `auth.uid()` function is Supabase-specific.

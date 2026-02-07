-- ============================================================
-- ResearchGPT Phase 1 Schema + RLS
-- Run this in Supabase SQL Editor (one shot, top to bottom)
-- ============================================================

-- ---------- helper: updated_at trigger function ----------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ==================== TABLES ====================

-- 1. projects
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid(),
  name        text not null,
  description text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 2. runs
create table public.runs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  phase         text not null default 'phase1',
  step          text,                       -- idea / topic_critic / outline
  status        text not null default 'running',  -- running / awaiting_feedback / completed / failed
  model_config  jsonb default '{}'::jsonb,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 3. artifacts
create table public.artifacts (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.runs(id) on delete cascade,
  step_name   text not null,
  version     int not null default 1,
  content     jsonb not null,
  created_at  timestamptz default now()
);

-- 4. agent_logs
create table public.agent_logs (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.runs(id) on delete cascade,
  agent_name  text not null,
  event_type  text not null,
  payload     jsonb default '{}'::jsonb,
  created_at  timestamptz default now()
);

-- ==================== INDEXES ====================

create index idx_projects_user_id           on public.projects(user_id);
create index idx_runs_project_id            on public.runs(project_id);
create index idx_artifacts_run_step_ver     on public.artifacts(run_id, step_name, version);
create index idx_agent_logs_run_created     on public.agent_logs(run_id, created_at);

-- ==================== TRIGGERS ====================

create trigger set_projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger set_runs_updated_at
  before update on public.runs
  for each row execute function public.set_updated_at();

-- ==================== ROW LEVEL SECURITY ====================

-- Enable RLS on all tables
alter table public.projects   enable row level security;
alter table public.runs       enable row level security;
alter table public.artifacts  enable row level security;
alter table public.agent_logs enable row level security;

-- ---------- projects ----------
-- Direct ownership: user_id = auth.uid()

create policy "projects_select" on public.projects
  for select using (user_id = auth.uid());

create policy "projects_insert" on public.projects
  for insert with check (user_id = auth.uid());

create policy "projects_update" on public.projects
  for update using (user_id = auth.uid());

create policy "projects_delete" on public.projects
  for delete using (user_id = auth.uid());

-- ---------- runs ----------
-- Access only if the parent project belongs to the user

create policy "runs_select" on public.runs
  for select using (
    exists (select 1 from public.projects where projects.id = runs.project_id and projects.user_id = auth.uid())
  );

create policy "runs_insert" on public.runs
  for insert with check (
    exists (select 1 from public.projects where projects.id = runs.project_id and projects.user_id = auth.uid())
  );

create policy "runs_update" on public.runs
  for update using (
    exists (select 1 from public.projects where projects.id = runs.project_id and projects.user_id = auth.uid())
  );

create policy "runs_delete" on public.runs
  for delete using (
    exists (select 1 from public.projects where projects.id = runs.project_id and projects.user_id = auth.uid())
  );

-- ---------- artifacts ----------
-- Access only if the parent run's project belongs to the user

create policy "artifacts_select" on public.artifacts
  for select using (
    exists (
      select 1 from public.runs
      join public.projects on projects.id = runs.project_id
      where runs.id = artifacts.run_id and projects.user_id = auth.uid()
    )
  );

create policy "artifacts_insert" on public.artifacts
  for insert with check (
    exists (
      select 1 from public.runs
      join public.projects on projects.id = runs.project_id
      where runs.id = artifacts.run_id and projects.user_id = auth.uid()
    )
  );

create policy "artifacts_update" on public.artifacts
  for update using (
    exists (
      select 1 from public.runs
      join public.projects on projects.id = runs.project_id
      where runs.id = artifacts.run_id and projects.user_id = auth.uid()
    )
  );

create policy "artifacts_delete" on public.artifacts
  for delete using (
    exists (
      select 1 from public.runs
      join public.projects on projects.id = runs.project_id
      where runs.id = artifacts.run_id and projects.user_id = auth.uid()
    )
  );

-- ---------- agent_logs ----------
-- Access only if the parent run's project belongs to the user

create policy "agent_logs_select" on public.agent_logs
  for select using (
    exists (
      select 1 from public.runs
      join public.projects on projects.id = runs.project_id
      where runs.id = agent_logs.run_id and projects.user_id = auth.uid()
    )
  );

create policy "agent_logs_insert" on public.agent_logs
  for insert with check (
    exists (
      select 1 from public.runs
      join public.projects on projects.id = runs.project_id
      where runs.id = agent_logs.run_id and projects.user_id = auth.uid()
    )
  );

create policy "agent_logs_update" on public.agent_logs
  for update using (
    exists (
      select 1 from public.runs
      join public.projects on projects.id = runs.project_id
      where runs.id = agent_logs.run_id and projects.user_id = auth.uid()
    )
  );

create policy "agent_logs_delete" on public.agent_logs
  for delete using (
    exists (
      select 1 from public.runs
      join public.projects on projects.id = runs.project_id
      where runs.id = agent_logs.run_id and projects.user_id = auth.uid()
    )
  );

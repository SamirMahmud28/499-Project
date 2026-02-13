-- Migration: Add run_number column with per-project auto-increment
-- Run this in Supabase SQL Editor

-- 1. Add the column (nullable initially for backfill)
ALTER TABLE public.runs ADD COLUMN run_number INTEGER;

-- 2. Backfill existing rows by creation order per project
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at ASC) AS rn
  FROM public.runs
)
UPDATE public.runs SET run_number = numbered.rn
FROM numbered WHERE runs.id = numbered.id;

-- 3. Make NOT NULL now that all rows have a value
ALTER TABLE public.runs ALTER COLUMN run_number SET NOT NULL;

-- 4. Unique constraint per (project_id, run_number)
ALTER TABLE public.runs ADD CONSTRAINT uq_runs_project_run_number UNIQUE (project_id, run_number);

-- 5. Trigger function to auto-assign run_number on INSERT
CREATE OR REPLACE FUNCTION public.set_run_number()
RETURNS trigger AS $$
BEGIN
  SELECT COALESCE(MAX(run_number), 0) + 1
    INTO NEW.run_number
    FROM public.runs
   WHERE project_id = NEW.project_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Attach trigger
CREATE TRIGGER trg_set_run_number
  BEFORE INSERT ON public.runs
  FOR EACH ROW EXECUTE FUNCTION public.set_run_number();

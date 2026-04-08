-- CSM-only planning: multiple named drafts per project + threaded comments per draft.
-- Idempotent pieces for re-run: DROP POLICY / DROP TRIGGER where needed.

CREATE OR REPLACE FUNCTION public.is_csm_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'csm'
  );
$$;

CREATE TABLE IF NOT EXISTS public.project_csm_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_csm_drafts_project_id_idx ON public.project_csm_drafts(project_id);
CREATE INDEX IF NOT EXISTS project_csm_drafts_sort_idx ON public.project_csm_drafts(project_id, sort_order);

CREATE TABLE IF NOT EXISTS public.project_csm_draft_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.project_csm_drafts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);

CREATE INDEX IF NOT EXISTS project_csm_draft_comments_draft_id_idx ON public.project_csm_draft_comments(draft_id);

CREATE OR REPLACE FUNCTION public.touch_project_csm_draft_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_csm_drafts_updated_at ON public.project_csm_drafts;
CREATE TRIGGER project_csm_drafts_updated_at
  BEFORE UPDATE ON public.project_csm_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_project_csm_draft_updated_at();

ALTER TABLE public.project_csm_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_csm_draft_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_csm_drafts_csm_all" ON public.project_csm_drafts;
CREATE POLICY "project_csm_drafts_csm_all"
  ON public.project_csm_drafts
  FOR ALL
  TO authenticated
  USING (public.is_csm_user())
  WITH CHECK (public.is_csm_user());

DROP POLICY IF EXISTS "project_csm_draft_comments_csm_all" ON public.project_csm_draft_comments;
CREATE POLICY "project_csm_draft_comments_csm_all"
  ON public.project_csm_draft_comments
  FOR ALL
  TO authenticated
  USING (public.is_csm_user())
  WITH CHECK (public.is_csm_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_csm_drafts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_csm_draft_comments TO authenticated;

-- Hint PostgREST to pick up new tables (no-op if not listening).
NOTIFY pgrst, 'reload schema';

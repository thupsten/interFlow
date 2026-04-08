-- Customer Success Manager (csm): elevated staff role (admin-level app access).
-- Extend profiles CHECK, helpers, task policies, project creation, finance helpers, and delete-estimate RPC.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (
  role = ANY (
    ARRAY[
      'admin'::text,
      'csm'::text,
      'manager'::text,
      'user'::text,
      'it_manager'::text,
      'finance'::text
    ]
  )
);

CREATE OR REPLACE FUNCTION public.is_finance_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'csm', 'finance')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'csm', 'manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_create_project()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'csm', 'manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_update_task(p_task_id uuid, p_project_id uuid, p_created_by uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = p_task_id AND ta.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'csm'))
    OR EXISTS (SELECT 1 FROM public.project_managers pm WHERE pm.project_id = p_project_id AND pm.user_id = auth.uid())
    OR (p_created_by IS NOT NULL AND p_created_by = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.project_contributors pc
      WHERE pc.project_id = p_project_id AND pc.user_id = auth.uid()
    );
$$;

DROP POLICY IF EXISTS "tasks_insert_by_project_members" ON public.tasks;
CREATE POLICY "tasks_insert_by_project_members"
  ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND deleted_at IS NULL
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'csm'))
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'manager')
      OR EXISTS (
        SELECT 1 FROM public.project_managers pm
        WHERE pm.project_id = tasks.project_id AND pm.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.project_contributors pc
        WHERE pc.project_id = tasks.project_id AND pc.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "task_assignees_insert_authorized" ON public.task_assignees;
DROP POLICY IF EXISTS "task_assignees_delete_authorized" ON public.task_assignees;

CREATE POLICY "task_assignees_insert_authorized"
  ON public.task_assignees
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'csm'))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'manager')
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.project_managers pm ON pm.project_id = t.project_id AND pm.user_id = auth.uid()
      WHERE t.id = task_assignees.task_id
    )
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_assignees.task_id AND t.created_by = auth.uid()
    )
    OR (
      task_assignees.user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.tasks t
        JOIN public.project_contributors pc ON pc.project_id = t.project_id AND pc.user_id = auth.uid()
        WHERE t.id = task_assignees.task_id
      )
    )
  );

CREATE POLICY "task_assignees_delete_authorized"
  ON public.task_assignees
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'csm'))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'manager')
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.project_managers pm ON pm.project_id = t.project_id AND pm.user_id = auth.uid()
      WHERE t.id = task_assignees.task_id
    )
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_assignees.task_id AND t.created_by = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.delete_project_finance_estimate(estimate_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
  uid uuid := auth.uid();
  authorized boolean;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SET LOCAL row_security = off;

  SELECT EXISTS (
    SELECT 1
    FROM public.project_finance_estimates e
    WHERE e.id = estimate_id
      AND e.status IS DISTINCT FROM 'approved'
      AND (
        e.submitted_by = uid
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = uid AND p.role IN ('admin', 'csm', 'finance')
        )
      )
  )
  INTO authorized;

  IF NOT authorized THEN
    RETURN false;
  END IF;

  DELETE FROM public.finance_estimate_lines WHERE estimate_id = estimate_id;
  DELETE FROM public.project_finance_estimate_revisions WHERE estimate_id = estimate_id;
  DELETE FROM public.project_finance_estimates WHERE id = estimate_id;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_project_finance_estimate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_project_finance_estimate(uuid) TO authenticated;

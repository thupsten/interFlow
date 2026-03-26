-- Contributors on a project can: create tasks (as themselves), update any task on that project
-- (board / status), and manage assignees on tasks they created (or self-assign to join a task).
-- Aligns with app behavior: tasks on approved projects are visible to all contributors (can_select_task).

CREATE OR REPLACE FUNCTION public.can_update_task(p_task_id uuid, p_project_id uuid, p_created_by uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = p_task_id AND ta.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM public.project_managers pm WHERE pm.project_id = p_project_id AND pm.user_id = auth.uid())
    OR (p_created_by IS NOT NULL AND p_created_by = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.project_contributors pc
      WHERE pc.project_id = p_project_id AND pc.user_id = auth.uid()
    );
$$;

DROP POLICY IF EXISTS "Admins and managers can create tasks" ON public.tasks;

CREATE POLICY "tasks_insert_by_project_members"
  ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND deleted_at IS NULL
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
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

DROP POLICY IF EXISTS "Admins and managers can assign tasks" ON public.task_assignees;
DROP POLICY IF EXISTS "Admins and managers can unassign tasks" ON public.task_assignees;

CREATE POLICY "task_assignees_insert_authorized"
  ON public.task_assignees
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
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
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
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

-- Allow project creators to add tags when creating a new project
-- Fixes: "new row violates row-level security policy for table 'project_tags'"
-- When a manager creates a project, they're not yet in project_managers.

DROP POLICY IF EXISTS "Admins and managers can manage project tags" ON public.project_tags;

CREATE POLICY "Admins managers and creators can manage project tags"
ON public.project_tags
FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  OR EXISTS (
    SELECT 1 FROM public.project_managers pm 
    WHERE pm.project_id = project_tags.project_id AND pm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.projects pr 
    WHERE pr.id = project_tags.project_id AND pr.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  OR EXISTS (
    SELECT 1 FROM public.project_managers pm 
    WHERE pm.project_id = project_tags.project_id AND pm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.projects pr 
    WHERE pr.id = project_tags.project_id AND pr.created_by = auth.uid()
  )
);

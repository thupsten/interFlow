-- Allow project creators to add managers and contributors when creating a project
-- Managers creating a new project aren't in project_managers yet.

-- project_managers
DROP POLICY IF EXISTS "Admins can manage project managers" ON public.project_managers;

CREATE POLICY "Admins managers and creators can manage project managers"
ON public.project_managers
FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'manager')
  OR EXISTS (SELECT 1 FROM public.projects pr WHERE pr.id = project_managers.project_id AND pr.created_by = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'manager')
  OR EXISTS (SELECT 1 FROM public.projects pr WHERE pr.id = project_managers.project_id AND pr.created_by = auth.uid())
);

-- project_contributors
DROP POLICY IF EXISTS "Admins and managers can add contributors" ON public.project_contributors;

CREATE POLICY "Admins managers and creators can add contributors"
ON public.project_contributors
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  OR EXISTS (
    SELECT 1 FROM public.project_managers pm 
    WHERE pm.project_id = project_contributors.project_id AND pm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.projects pr 
    WHERE pr.id = project_contributors.project_id AND pr.created_by = auth.uid()
  )
);

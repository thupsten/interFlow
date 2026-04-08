-- CSM coordinates with clients but does not create new project records; only admin and manager may INSERT projects.
CREATE OR REPLACE FUNCTION public.can_create_project()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager')
  );
$$;

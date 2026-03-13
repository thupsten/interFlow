-- Allow managers (and admins) to create (INSERT) projects
-- Run in Supabase Dashboard: SQL Editor > New query > paste and Run
--
-- Fixes: "new row violates row-level security policy for table 'projects'"
-- Uses SECURITY DEFINER function to bypass RLS when checking user role.

-- Step 1: Create helper function (bypasses RLS when reading profiles)
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

-- Step 2: Drop existing INSERT policies on projects
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT policyname FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'projects' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.projects', pol.policyname);
  END LOOP;
END $$;

-- Step 3: Create INSERT policy using the function
CREATE POLICY "Allow admins and managers to create projects"
ON public.projects
FOR INSERT
TO authenticated
WITH CHECK (can_create_project());

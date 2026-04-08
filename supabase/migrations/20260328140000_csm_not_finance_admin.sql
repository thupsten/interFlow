-- CSM coordinates projects but is not a finance/admin approver for estimates.
CREATE OR REPLACE FUNCTION public.is_finance_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'finance')
  );
$$;

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
          WHERE p.id = uid AND p.role IN ('admin', 'finance')
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

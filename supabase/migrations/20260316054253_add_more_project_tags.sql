-- Add more project tags for broader categorization
INSERT INTO public.tags (id, name, color, is_system, created_at)
VALUES
  (gen_random_uuid(), '3D', '#a855f7', true, now()),
  (gen_random_uuid(), 'Analytics', '#0ea5e9', true, now()),
  (gen_random_uuid(), 'Branding', '#f97316', true, now()),
  (gen_random_uuid(), 'Content', '#84cc16', true, now()),
  (gen_random_uuid(), 'Design', '#ec4899', true, now()),
  (gen_random_uuid(), 'Documentation', '#64748b', true, now()),
  (gen_random_uuid(), 'Engineering', '#3b82f6', true, now()),
  (gen_random_uuid(), 'Graphic Design', '#e11d48', true, now()),
  (gen_random_uuid(), 'Legal', '#1e293b', true, now()),
  (gen_random_uuid(), 'Product', '#0d9488', true, now()),
  (gen_random_uuid(), 'QA', '#6366f1', true, now()),
  (gen_random_uuid(), 'Research', '#7c3aed', true, now()),
  (gen_random_uuid(), 'Sales', '#059669', true, now()),
  (gen_random_uuid(), 'SEO', '#d97706', true, now()),
  (gen_random_uuid(), 'Social Media', '#db2777', true, now()),
  (gen_random_uuid(), 'Support', '#0284c7', true, now()),
  (gen_random_uuid(), 'UI/UX', '#be185d', true, now()),
  (gen_random_uuid(), 'Video', '#4f46e5', true, now())
ON CONFLICT (name) DO NOTHING;

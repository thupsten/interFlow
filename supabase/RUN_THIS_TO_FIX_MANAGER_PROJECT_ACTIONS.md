# Fix: Managers Can Create, Disable, and Delete Projects

When managers get permission errors when trying to **add**, disable, or delete a project, run the SQL below in Supabase.

## Steps

1. Open **Supabase Dashboard** → your project
2. Go to **SQL Editor** → **New query**
3. Run **both** migrations in order:
   - `migrations/20250311000002_allow_managers_update_projects.sql` (disable/delete)
   - `migrations/20250311000006_allow_managers_insert_projects.sql` (create/add)
4. Click **Run** for each

- **20250311000002**: Allows managers to archive, unarchive, and delete projects they manage
- **20250311000006**: Allows managers (and admins) to create new projects

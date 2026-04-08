-- GoTrue scans auth.users.email_change into a non-nullable Go string; NULL causes
-- "Database error querying schema" on password login for SQL-seeded users.
UPDATE auth.users SET email_change = '' WHERE email_change IS NULL;

-- Re-applies grants on any tables that already exist.
-- Safe to run multiple times (idempotent).
-- Needed when the volume was created with a prior init script that
-- only set DEFAULT PRIVILEGES (which don't apply retroactively).

\connect grid_db

GRANT USAGE ON SCHEMA public TO grid_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO grid_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO grid_user;

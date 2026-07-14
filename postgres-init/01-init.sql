-- Creates the application role and database.
-- Runs automatically on first container start via /docker-entrypoint-initdb.d
-- (only executes when the data volume is empty / brand new).

CREATE ROLE grid_user WITH LOGIN PASSWORD 'grid_pass';
CREATE DATABASE grid_db OWNER grid_user;
\connect grid_db

-- Grant schema usage and table privileges
GRANT ALL ON SCHEMA public TO grid_user;
ALTER SCHEMA public OWNER TO grid_user;

-- Default privileges for objects created by the superuser (postgres)
-- so that any tables Prisma migrations create are automatically accessible
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO grid_user;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO grid_user;

-- Default privileges for objects created by grid_user itself
ALTER DEFAULT PRIVILEGES FOR ROLE grid_user IN SCHEMA public GRANT ALL ON TABLES TO grid_user;
ALTER DEFAULT PRIVILEGES FOR ROLE grid_user IN SCHEMA public GRANT ALL ON SEQUENCES TO grid_user;

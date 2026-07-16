# supabase/migrations — schema source of truth

Every DDL change (tables, columns, indexes, constraints, RLS policies, functions, triggers) lives here as a numbered SQL file. **Nothing** is edited via the Supabase SQL editor going forward. If it isn't in a migration, it doesn't exist.

## One-time setup (per contributor)

```bash
# 1. Install the Supabase CLI. On Windows use scoop or the standalone binary.
scoop install supabase
# or: winget install Supabase.CLI
# or: download from https://github.com/supabase/cli/releases

supabase --version   # confirm

# 2. Link this repo to the live project. Project ref is in api/.env (the subdomain
# of SUPABASE_URL). You'll be prompted for the DB password once — it's stored
# in a local file that .gitignore ignores.
supabase link --project-ref <project-ref>
```

## First migration — bootstrap from live DB

Run once, right after linking. This produces the initial migration containing every table, index, RLS policy, function, and trigger currently in production.

```bash
supabase db pull --schema public
```

That creates `supabase/migrations/<timestamp>_remote_schema.sql`. Commit it. **This becomes the baseline** — from now on, every schema change is a NEW migration file layered on top.

Also dump every function body so nothing is Supabase-only state:

```bash
supabase db dump --schema public --data-only=false -f supabase/migrations/<timestamp>_remote_schema.sql
```

The `patches/p0-02-lock-rls.sql` and `patches/p0-03-*` changes will appear in this pull. Once `db pull` succeeds and the initial migration is committed, delete the `patches/` folder — the migrations directory supersedes it.

## Everyday workflow — making a schema change

```bash
# 1. Create a new migration file
supabase migration new add_entries_created_at_index

# 2. Write the SQL in the generated file at supabase/migrations/<ts>_add_entries_created_at_index.sql
#    Follow the file template below.

# 3. Test locally
supabase db reset        # rebuilds a fresh local DB from all migrations + seed.sql

# 4. Apply to remote
supabase db push
```

**Never** run raw `ALTER TABLE` in the Supabase web SQL editor. Doing so silently desyncs live from `migrations/` and the next `db push` will conflict.

## File template

```sql
-- <short description>
-- Reason: <link to plan section / issue / PR>

BEGIN;

-- Forward migration
CREATE INDEX ...;

COMMIT;

-- ROLLBACK (copy into a follow-up migration if this needs undoing):
-- DROP INDEX ...;
```

Every migration must be **idempotent** — safe to re-apply. Use `IF NOT EXISTS` / `IF EXISTS` clauses where Postgres supports them.

## Seed data

`supabase/seed.sql` runs after every `supabase db reset`. Keep it minimal — only what a dev needs to boot the app: one moderator, one active bingo month, one badge family. Do not seed production data.

## What NOT to put here

- **Data migrations that touch user-authored rows.** Those go in `api/scripts/` and are run manually against production with logging.
- **One-off admin fixes** (renaming a user, etc). Those go in the SQL editor with the change logged in a code-review comment or Notion doc.

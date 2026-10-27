# Migration grant guard release design

## Goal

Before merging PR #368, make its migration guard reject SQL that leaves a newly created `public` table unusable by the app's `service_role` Data API client. Keep the guard limited to new migration files; verify older files against the remote database as a release step.

## Checker

Process SQL statements in order. For each newly created `public` table, track the effective `SELECT`, `INSERT`, `UPDATE`, and `DELETE` grants to `service_role`. Apply table-specific and schema-wide `GRANT`/`REVOKE` at the point where each statement occurs. A schema-wide grant before a table is created cannot cover that future table. Report missing privileges by table.

For a new table whose column uses `smallserial`, `serial`, `bigserial`, or an explicit `nextval(...)` default, require `USAGE` or `UPDATE` on its new sequence for `service_role`. A schema-wide sequence grant counts only when it occurs after that sequence exists. Identity columns do not need a separate sequence grant for insertion. Preserve the current rule that `anon` and `authenticated` privileges are intentional per-table choices.

The checker is a focused static guard for repository migration syntax. The remote SQL audit remains authoritative for SQL Editor changes, inherited privileges, existing objects, and migrations applied after their filename date.

## Documentation and release

Update the migration README with the actual required privileges, sequence example, and a query to verify effective remote privileges. Replace its obsolete anon-key OpenAPI check with SQL Editor queries. Add a reminder to compare all historical migration markers with the remote schema before October 30, because there is no migration tracking table.

Use tests that first fail on the original checker for partial grants, later revokes, grant ordering, and serial sequences. Run the migration suite and full CI, update the PR branch, then merge only after checks pass. Confirm GitHub merge state and Vercel production deployment. No SQL migration is introduced by this PR; remote migration status must be checked separately.

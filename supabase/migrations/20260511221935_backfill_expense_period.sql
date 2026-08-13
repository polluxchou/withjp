-- ============================================================
-- Migration 013: Backfill expense period
--
-- Older expense records (and any imported from the legacy devices
-- table) were created before period auto-derivation existed. They
-- have either NULL, '', or a legacy month-format (e.g. '2025-05')
-- in expenses.period.
--
-- The product convention is now:
--   - period is meaningful only for salary / rent / cloud_services
--   - format is 'YYYY-QN' derived from expense_date
--
-- This migration backfills period for those categories where the
-- value is missing or not in quarterly form, leaving manually-set
-- valid quarters untouched. Other categories keep period = NULL.
--
-- Idempotent — safe to re-run.
-- ============================================================

update expenses
   set period =
     extract(year from expense_date)::text
     || '-Q'
     || (((extract(month from expense_date)::int - 1) / 3) + 1)::text
 where expense_category in ('salary', 'rent', 'cloud_services')
   and expense_date is not null
   and (period is null or period !~ '^\d{4}-Q[1-4]$');

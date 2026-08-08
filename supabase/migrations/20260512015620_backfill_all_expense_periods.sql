-- ============================================================
-- Migration 015: Backfill all expense periods
--
-- Period is now a detail field for every expense category. Fill any
-- missing or legacy non-quarter period from expense_date, preserving
-- existing valid YYYY-QN values.
--
-- Idempotent — safe to re-run.
-- ============================================================

update expenses
   set period =
     extract(year from expense_date)::text
     || '-Q'
     || (((extract(month from expense_date)::int - 1) / 3) + 1)::text
 where expense_date is not null
   and (period is null or period !~ '^\d{4}-Q[1-4]$');

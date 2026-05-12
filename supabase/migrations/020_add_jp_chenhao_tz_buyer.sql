-- ============================================================
-- Migration 020: Add 'JP-陈昊投资' to the company-account buyer list
--
-- The expenses CHECK constraint hard-codes the allowed buyer names
-- for payment_method = 'company_account'. Adding a new accepted
-- value requires dropping and recreating the constraint.
--
-- 'JP-陈昊投资' settles domestically and is exempt from the 4%
-- cross-border transfer fee (handled in the application layer via
-- DOMESTIC_SETTLEMENT_BUYERS — no DB change needed for the fee
-- logic since the fee is computed at read time).
-- ============================================================

alter table expenses
  drop constraint if exists expenses_company_account_buyer;

alter table expenses
  add constraint expenses_company_account_buyer check (
    payment_method is distinct from 'company_account'
    or buyer_name in ('with-new', 'JP-代理陈昊', 'JP-代理小兽', 'JP-陈昊投资')
  );

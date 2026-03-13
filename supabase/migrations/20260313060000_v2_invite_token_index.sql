BEGIN;

-- =========================================
-- V2: INVITE TOKEN LOOKUP INDEX
-- =========================================
--
-- NOTE: a UNIQUE index on (invite_token) WHERE invite_token IS NOT NULL
-- was already created in 20260312230000_v2_tenant_invite_tokens.sql:
--
--   v2_tenant_memberships_invite_token_idx
--
-- A UNIQUE index serves as a full B-tree index for all equality lookups.
-- PostgreSQL uses it for both accept_invite_by_token and
-- get_invite_info_by_token. Creating an additional non-unique index on
-- the same column and WHERE clause would be redundant and waste space.
--
-- This migration documents the intent and adds the canonical alias name
-- so tooling and future developers have a stable, descriptive reference.
-- No new index object is created when the unique index already exists.
-- =========================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_indexes
    WHERE  schemaname = 'public'
      AND  tablename  = 'v2_tenant_memberships'
      AND  indexname  = 'v2_invite_token_idx'
  ) THEN
    -- Only create if the canonical unique index is somehow missing.
    -- Under normal migration order this branch will never execute.
    CREATE INDEX v2_invite_token_idx
      ON public.v2_tenant_memberships (invite_token)
      WHERE invite_token IS NOT NULL;
  END IF;
END;
$$;

COMMIT;

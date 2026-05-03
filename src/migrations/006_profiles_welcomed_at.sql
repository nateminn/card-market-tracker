-- Migration 006 — track whether the welcome email has been sent.
--
-- The signup flow has two paths:
--   1. Email confirmation OFF → user gets a session immediately on signUp().
--      The signup form calls /api/auth/welcome which fires the email.
--   2. Email confirmation ON → user clicks the link, lands on /auth/callback
--      which exchanges the code for a session, then fires the email.
--
-- Both paths funnel through sendWelcomeIfNeeded() in lib/welcome.ts. We
-- dedupe via this column so a user never gets two welcomes.
--
-- Idempotent.

alter table profiles
  add column if not exists welcomed_at timestamptz;

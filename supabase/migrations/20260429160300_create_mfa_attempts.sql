-- Migration: create public.mfa_attempts (rate-limit ledger for MFA verifies)
-- Context: feature/mfa-totp — backs rate-limit logic in the
-- mfa-recovery-verify edge function (5 attempts / 15min per user_id, per IP).
-- Applied rules:
--   R7 — RLS enabled, fully denied to authenticated/anon
--   R8 — admin SELECT via has_role
--   R6 — auth.users link is correct here (rate-limit is auth-layer concern)

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mfa_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address inet,
  attempt_type text NOT NULL CHECK (attempt_type IN ('totp', 'recovery')),
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Window queries: WHERE user_id = $1 AND created_at > now() - interval '15 min'.
-- DESC index supports both window-count and recent-attempts listing.
CREATE INDEX IF NOT EXISTS idx_mfa_attempts_user_window
  ON public.mfa_attempts(user_id, created_at DESC);

-- IP-based rate-limit (mitigates distributed attacks against single user).
CREATE INDEX IF NOT EXISTS idx_mfa_attempts_ip_window
  ON public.mfa_attempts(ip_address, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS — fully denied to authenticated/anon. Edge functions use service_role
-- (which bypasses RLS) to insert/select. Admin can read for forensics.
-- ---------------------------------------------------------------------------
ALTER TABLE public.mfa_attempts ENABLE ROW LEVEL SECURITY;

-- SELECT is admin-only. authenticated non-admins evaluate USING(false) and
-- get zero rows. anon has no policy at all = denied. service_role bypasses
-- RLS for edge-function inserts and rate-limit window queries.
DROP POLICY IF EXISTS "mfa_attempts_no_direct_access" ON public.mfa_attempts;
DROP POLICY IF EXISTS "mfa_attempts_admin_select" ON public.mfa_attempts;
CREATE POLICY "mfa_attempts_admin_select" ON public.mfa_attempts
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No INSERT/UPDATE/DELETE policies for authenticated/anon. service_role
-- inserts via edge functions; cleanup job (future, out of scope for MVP)
-- will run as service_role too:
--   DELETE FROM public.mfa_attempts WHERE created_at < now() - interval '7 days';

COMMENT ON TABLE public.mfa_attempts IS
  'Append-only ledger of MFA verification attempts. Used by the mfa-recovery-verify '
  'edge function to enforce rate-limiting (5 attempts / 15 min per user and per IP). '
  'No direct access from authenticated/anon roles.';

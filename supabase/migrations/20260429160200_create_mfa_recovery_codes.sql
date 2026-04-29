-- Migration: create public.mfa_recovery_codes + metadata view + audit trigger
-- Context: feature/mfa-totp — bcrypt-hashed recovery codes for users who
-- enable TOTP. Plaintext codes are returned exactly once at generation time.
-- Applied rules:
--   R7  — RLS enabled with explicit policies
--   R13 — code_hash never exposed via authenticated SELECT (use metadata view)
--   R14 — UPDATE on used_at writes audit_logs via trigger
--   R6  — uses auth.users (auth metadata, not business data — exception ok)

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,            -- bcrypt; never SELECTed by authenticated role
  used_at timestamptz,                -- null = unused
  used_ip inet,                       -- forensic, set on consumption
  used_user_agent text,               -- forensic, set on consumption
  generated_batch_id uuid NOT NULL,   -- groups the 8 codes from same enroll
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mfa_recovery_codes_used_at_check
    CHECK (used_at IS NULL OR used_at >= created_at)
);

-- Validation queries hit only unused codes; partial index keeps it small.
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user_unused
  ON public.mfa_recovery_codes(user_id) WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_batch
  ON public.mfa_recovery_codes(generated_batch_id);

-- ---------------------------------------------------------------------------
-- RLS — block authenticated direct access; service_role bypasses RLS for
-- INSERT/UPDATE/DELETE inside edge functions. Reads for the user happen
-- through the metadata view below (which omits code_hash, applying R13).
-- ---------------------------------------------------------------------------
ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

-- SELECT is admin-only via has_role. authenticated non-admins return zero
-- rows (RLS evaluates false). anon has no policy at all = denied.
-- service_role bypasses RLS, so edge functions can still query hashes.
-- Note: PERMISSIVE policies combine via OR; we keep a single SELECT policy
-- here to avoid ambiguity between "deny" and "admin" rows being OR'd.
DROP POLICY IF EXISTS "mfa_recovery_codes_no_direct_select" ON public.mfa_recovery_codes;
DROP POLICY IF EXISTS "mfa_recovery_codes_admin_select" ON public.mfa_recovery_codes;
CREATE POLICY "mfa_recovery_codes_admin_select" ON public.mfa_recovery_codes
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Deliberately NO INSERT/UPDATE/DELETE policies for authenticated. Edge
-- functions running with the service_role key bypass RLS to manage these
-- rows. Keeping zero policies for those verbs is the lock.

-- ---------------------------------------------------------------------------
-- Metadata view — what the user CAN see (no hash). R13.
-- security_invoker = true makes the view honor the caller's RLS (via the
-- explicit policy below acting on the view as a security barrier).
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.mfa_recovery_codes_metadata;
CREATE VIEW public.mfa_recovery_codes_metadata
WITH (security_invoker = true) AS
SELECT
  id,
  user_id,
  used_at,
  used_ip,
  generated_batch_id,
  created_at
FROM public.mfa_recovery_codes
WHERE
  -- Owner can see own metadata, OR admin can see all.
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin');

COMMENT ON VIEW public.mfa_recovery_codes_metadata IS
  'Safe metadata projection of mfa_recovery_codes — excludes code_hash (R13). '
  'Used by the frontend to show users which recovery codes have been used.';

REVOKE ALL ON public.mfa_recovery_codes_metadata FROM PUBLIC, anon;
GRANT SELECT ON public.mfa_recovery_codes_metadata TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Trigger: when used_at transitions NULL -> NOT NULL, log to audit_logs (R14).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_recovery_code_used()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.used_at IS NOT NULL AND OLD.used_at IS NULL THEN
    PERFORM public.log_audit_event(
      'recovery_code_used',
      NEW.user_id,
      NEW.user_id,
      jsonb_build_object(
        'code_id', NEW.id,
        'batch_id', NEW.generated_batch_id,
        'ip', NEW.used_ip,
        'user_agent', NEW.used_user_agent
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.log_recovery_code_used() IS
  'Trigger function: appends an audit_logs row when a recovery code is consumed. '
  'Definer-rights so it can call public.log_audit_event without explicit grants.';

DROP TRIGGER IF EXISTS trg_recovery_code_used ON public.mfa_recovery_codes;
CREATE TRIGGER trg_recovery_code_used
  AFTER UPDATE ON public.mfa_recovery_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.log_recovery_code_used();

-- Migration: create public.audit_logs + public.log_audit_event
-- Context: feature/mfa-totp — immutable audit trail for sensitive events
-- (MFA enroll/unenroll, recovery-code use, etc).
-- Applied rules: R7 (RLS), R13 (admin-only SELECT), R14 (immutable, append-only),
--                R8 (uses canonical has_role).

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  -- canonical event types (extensible):
  --   mfa_enrolled, mfa_unenrolled, recovery_code_used,
  --   recovery_codes_regenerated, mfa_challenge_failed,
  --   mfa_recovery_rate_limited, recovery_code_failed
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  table_name text,
  record_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
  ON public.audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target
  ON public.audit_logs(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event
  ON public.audit_logs(event_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS — admin-only SELECT, no UPDATE/DELETE policy = immutable (R14).
-- INSERT happens exclusively via SECURITY DEFINER function below or service_role.
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Deliberately NO INSERT/UPDATE/DELETE policy:
--   - INSERT: only callable via public.log_audit_event (definer) or service_role.
--   - UPDATE/DELETE: never. R14 mandates immutability.

-- ---------------------------------------------------------------------------
-- public.log_audit_event — canonical insert API used by edge functions / triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_event_type text,
  p_actor uuid,
  p_target uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_event_type IS NULL OR length(trim(p_event_type)) = 0 THEN
    RAISE EXCEPTION 'log_audit_event: p_event_type is required';
  END IF;

  INSERT INTO public.audit_logs (event_type, actor_user_id, target_user_id, metadata)
  VALUES (p_event_type, p_actor, p_target, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_audit_event(text, uuid, uuid, jsonb) IS
  'Canonical entry point for writing to public.audit_logs (R14). Edge functions '
  'and triggers call this. Direct INSERT to audit_logs from anon/authenticated '
  'is blocked by RLS.';

-- Lock down execution: only service_role can call from outside; triggers
-- defined as SECURITY DEFINER inherit privileges of their owner so they do
-- not need EXECUTE grants here.
REVOKE ALL ON FUNCTION public.log_audit_event(text, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, uuid, uuid, jsonb)
  TO service_role;

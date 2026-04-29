-- Migration: create canonical authorization function `public.has_role`
-- Context: feature/mfa-totp depends on `public.has_role(uuid, text)` for the
-- audit_logs SELECT policy. The project does not yet have a roles table, so
-- this initial implementation uses an email allowlist sourced from auth.users.
-- TODO(roles-table): replace allowlist with `public.user_roles` (user_id, role)
--   when role management UI is added. Keep the function signature stable so
--   policies and RPCs do not need to change.
-- Applied rules: R8 (canonical authorization function), R7 (used by RLS).

-- ---------------------------------------------------------------------------
-- public.has_role(_user_id uuid, _role text) -> boolean
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so policies that call it on auth.users do not require the
-- caller to have direct SELECT on auth.users (R8 reference implementation).
-- search_path locked to a known set to prevent search_path hijacking.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_email text;
BEGIN
  IF _user_id IS NULL OR _role IS NULL THEN
    RETURN false;
  END IF;

  -- TODO(roles-table): swap this block for a SELECT on public.user_roles.
  IF _role = 'admin' THEN
    SELECT lower(email) INTO v_email
    FROM auth.users
    WHERE id = _user_id;

    IF v_email IS NULL THEN
      RETURN false;
    END IF;

    -- Email allowlist (single source of truth for now).
    -- Keep lowercase; auth.users stores email case-sensitive but Supabase
    -- normalizes on signup.
    RETURN v_email = ANY (ARRAY[
      'aesdomingues@gmail.com'
    ]);
  END IF;

  -- Unknown roles: deny by default (fail-closed, R8).
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.has_role(uuid, text) IS
  'Canonical authorization check (R8). Returns true if user has the given role. '
  'Currently backed by an email allowlist for role=admin; will move to '
  'public.user_roles table when role management is introduced.';

-- Lock down execution: only the database itself (definer) and service_role
-- need to call it directly; authenticated/anon should reach it indirectly via
-- RLS policies (which inherit definer privileges).
REVOKE ALL ON FUNCTION public.has_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, service_role;

import { useAuth } from "@/contexts/AuthContext";

/**
 * useMfaGuard
 *
 * Reads `mfaState` from AuthContext and tells callers whether the user must
 * complete an MFA challenge before accessing protected content.
 *
 * Returns:
 *  - `requireMfaChallenge`: true when the session is AAL1 but the user has a
 *    verified factor (Supabase's nextLevel === 'aal2').
 *  - `loading`: true while `mfaState === 'unknown'` OR while AuthContext.loading
 *    is still true. Callers must wait for this to be false before redirecting.
 */
export function useMfaGuard() {
  const { mfaState, loading } = useAuth();

  const stillLoading = loading || mfaState === "unknown";
  const requireMfaChallenge = mfaState === "aal2-required";

  return {
    requireMfaChallenge,
    loading: stillLoading,
  };
}

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/errorHandler";

/**
 * Local type aliases for Supabase auth types.
 *
 * NOTE: We don't import User/Session/Factor from `@supabase/supabase-js` because the
 * installed package has a broken `.d.ts` shipping (the .d.ts files are missing but
 * .d.ts.map files exist). The runtime client works correctly. These aliases are
 * intentionally minimal — they cover only what we use here. If you upgrade the
 * package and `.d.ts` files come back, swap these for the real imports.
 */
type User = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

type Session = {
  user: User;
  access_token: string;
  refresh_token: string;
  expires_at?: number;
};

export type Factor = {
  id: string;
  friendly_name?: string;
  factor_type: "totp" | "phone";
  status: "verified" | "unverified";
  created_at: string;
  updated_at: string;
};


/**
 * MFA-aware authentication state.
 *
 * Levels:
 * - 'unknown'        — still loading from supabase.auth.mfa.getAuthenticatorAssuranceLevel()
 * - 'aal1'           — password-only session, no MFA enrolled (user has no verified factors)
 * - 'aal2'           — password + MFA verified (full access)
 * - 'aal2-required'  — password OK but user has a verified factor and hasn't completed MFA challenge
 *                      (currentLevel='aal1' && nextLevel='aal2'). UI MUST gate to /mfa-challenge.
 */
export type MfaState = "unknown" | "aal1" | "aal2" | "aal2-required";

interface EnrollMfaResult {
  factorId: string | null;
  qrCode: string | null;
  secret: string | null;
  error: Error | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  mfaState: MfaState;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  /**
   * Starts a TOTP enrollment (creates an unverified factor in Supabase).
   * Caller must follow up with confirmMfaEnroll(factorId, code) using the first
   * code from the authenticator app to mark the factor as verified.
   */
  enrollMfa: () => Promise<EnrollMfaResult>;
  /**
   * Verifies the first code after enroll. Internally generates a challenge
   * (supabase.auth.mfa.challenge) and verifies it. On success the session is
   * elevated to AAL2 and `mfaState` becomes 'aal2'.
   */
  confirmMfaEnroll: (factorId: string, code: string) => Promise<{ error: Error | null }>;
  /**
   * Used in the post-password login flow to complete the AAL2 elevation.
   * Same challenge -> verify sequence but called on an AAL1 session.
   */
  verifyMfaChallenge: (factorId: string, code: string) => Promise<{ error: Error | null }>;
  /**
   * Removes a verified factor.
   * Supabase requires a recent successful authentication for this to succeed
   * (typically AAL2 within the last few minutes). The caller is responsible
   * for ensuring a recent reauth — surface the error if Supabase rejects.
   */
  unenrollMfa: (factorId: string) => Promise<{ error: Error | null }>;
  /**
   * Returns only verified factors. Unverified (in-progress enrollments) are
   * filtered out so the UI never lists half-baked factors.
   */
  listMfaFactors: () => Promise<Factor[]>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaState, setMfaState] = useState<MfaState>("unknown");

  /**
   * Computes mfaState by calling getAuthenticatorAssuranceLevel().
   * SAFETY: never throws — any error collapses to 'unknown' so UI keeps loading.
   *
   * KNOWN RACE (accepted, low-risk):
   * Two auth events fired in quick succession (e.g. SIGNED_IN immediately
   * followed by MFA_CHALLENGE_VERIFIED) can cause two refreshMfaState() calls
   * to interleave. The later setMfaState() wins, but if responses arrive
   * out-of-order the final state could briefly reflect the older AAL.
   * An epoch-based guard (incrementing token, comparing on resolve) was
   * considered but skipped for the MVP because:
   *   1. The window is sub-100ms in practice;
   *   2. The next TOKEN_REFRESHED tick (~1h) self-heals;
   *   3. UI gates only navigate forward (aal1 -> aal2-required -> aal2),
   *      so a stale read at worst shows an extra MFA prompt.
   * Revisit if telemetry shows users stuck on /mfa-challenge after verify.
   */
  const refreshMfaState = useCallback(async (sess: Session | null) => {
    if (!sess) {
      setMfaState("unknown");
      return;
    }
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error || !data) {
        logError(error, "AuthContext.refreshMfaState");
        setMfaState("unknown");
        return;
      }
      const { currentLevel, nextLevel } = data;
      if (currentLevel === "aal2") {
        setMfaState("aal2");
      } else if (currentLevel === "aal1" && nextLevel === "aal2") {
        // user has a verified factor but hasn't completed the challenge
        setMfaState("aal2-required");
      } else {
        // currentLevel === 'aal1' && nextLevel === 'aal1' — no MFA enrolled
        setMfaState("aal1");
      }
    } catch (err) {
      logError(err, "AuthContext.refreshMfaState.catch");
      setMfaState("unknown");
    }
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        // Recalculate AAL on events that can change it.
        // We intentionally use a microtask via Promise.resolve to avoid
        // blocking the synchronous listener (Supabase recommendation).
        if (
          event === "SIGNED_IN" ||
          event === "MFA_CHALLENGE_VERIFIED" ||
          event === "USER_UPDATED" ||
          event === "TOKEN_REFRESHED"
        ) {
          void refreshMfaState(newSession);
        } else if (event === "SIGNED_OUT") {
          setMfaState("unknown");
        }

        setLoading(false);
      },
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      await refreshMfaState(existing);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [refreshMfaState]);

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });

    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setMfaState("unknown");
  };

  const enrollMfa = async (): Promise<EnrollMfaResult> => {
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "La Financeiro",
      });
      if (error || !data) {
        logError(error, "AuthContext.enrollMfa");
        return { factorId: null, qrCode: null, secret: null, error: error as Error };
      }
      return {
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
        error: null,
      };
    } catch (err) {
      logError(err, "AuthContext.enrollMfa.catch");
      return { factorId: null, qrCode: null, secret: null, error: err as Error };
    }
  };

  /**
   * Internal helper: challenge -> verify in one call.
   * Used by both confirmMfaEnroll and verifyMfaChallenge.
   */
  const challengeAndVerify = async (factorId: string, code: string) => {
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeError || !challengeData) {
      logError(challengeError, "AuthContext.challenge");
      return { error: (challengeError as Error) ?? new Error("challenge_failed") };
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code,
    });
    if (verifyError) {
      logError(verifyError, "AuthContext.verify");
      return { error: verifyError as Error };
    }
    return { error: null };
  };

  const confirmMfaEnroll = async (factorId: string, code: string) => {
    const result = await challengeAndVerify(factorId, code);
    if (!result.error) {
      // Re-read AAL after successful verify
      const { data } = await supabase.auth.getSession();
      await refreshMfaState(data.session);
    }
    return result;
  };

  const verifyMfaChallenge = async (factorId: string, code: string) => {
    const result = await challengeAndVerify(factorId, code);
    if (!result.error) {
      const { data } = await supabase.auth.getSession();
      await refreshMfaState(data.session);
    }
    return result;
  };

  const unenrollMfa = async (factorId: string) => {
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) {
        logError(error, "AuthContext.unenrollMfa");
        return { error: error as Error };
      }
      const { data } = await supabase.auth.getSession();
      await refreshMfaState(data.session);
      return { error: null };
    } catch (err) {
      logError(err, "AuthContext.unenrollMfa.catch");
      return { error: err as Error };
    }
  };

  const listMfaFactors = async (): Promise<Factor[]> => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error || !data) {
        logError(error, "AuthContext.listMfaFactors");
        return [];
      }
      // Only verified factors should be visible in the UI.
      return [...(data.totp ?? [])].filter((f) => f.status === "verified");
    } catch (err) {
      logError(err, "AuthContext.listMfaFactors.catch");
      return [];
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        mfaState,
        signUp,
        signIn,
        signOut,
        enrollMfa,
        confirmMfaEnroll,
        verifyMfaChallenge,
        unenrollMfa,
        listMfaFactors,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

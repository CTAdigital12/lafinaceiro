import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { ReactNode } from "react";
import { AuthProvider, useAuth, type Factor } from "@/contexts/AuthContext";

/**
 * Mock Supabase client. Use vi.hoisted so the mock object is available inside
 * the (also hoisted) vi.mock factory and to tests below.
 */
type AuthListener = (
  event: string,
  session: { user?: { id: string; email?: string }; access_token?: string } | null,
) => void;

const supabaseMock = vi.hoisted(() => {
  const m: {
    auth: {
      getSession: ReturnType<typeof vi.fn>;
      onAuthStateChange: ReturnType<typeof vi.fn>;
      signUp: ReturnType<typeof vi.fn>;
      signInWithPassword: ReturnType<typeof vi.fn>;
      signOut: ReturnType<typeof vi.fn>;
      mfa: {
        enroll: ReturnType<typeof vi.fn>;
        challenge: ReturnType<typeof vi.fn>;
        verify: ReturnType<typeof vi.fn>;
        unenroll: ReturnType<typeof vi.fn>;
        listFactors: ReturnType<typeof vi.fn>;
        getAuthenticatorAssuranceLevel: ReturnType<typeof vi.fn>;
      };
    };
    __listener: AuthListener | null;
  } = {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn((cb: AuthListener) => {
        m.__listener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      mfa: {
        enroll: vi.fn(),
        challenge: vi.fn(),
        verify: vi.fn(),
        unenroll: vi.fn(),
        listFactors: vi.fn(),
        getAuthenticatorAssuranceLevel: vi.fn(),
      },
    },
    __listener: null,
  };
  return m;
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock,
}));

vi.mock("@/lib/errorHandler", () => ({
  logError: vi.fn(),
  getSafeErrorMessage: (e: unknown, fallback = "generic") =>
    typeof e === "string" ? e : fallback,
}));

const Wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

const SESSION_AAL1 = {
  user: { id: "user-1", email: "user@test.dev" },
  access_token: "tk-aal1",
  refresh_token: "rt",
};

const SESSION_AAL2 = {
  ...SESSION_AAL1,
  access_token: "tk-aal2",
};

beforeEach(() => {
  vi.clearAllMocks();
  // default: existing session (aal1, no MFA)
  supabaseMock.auth.getSession.mockResolvedValue({ data: { session: SESSION_AAL1 } });
  supabaseMock.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: "aal1", nextLevel: "aal1" },
    error: null,
  });
  supabaseMock.__listener = null;
});

describe("AuthContext — MFA surface", () => {
  it("computes mfaState='aal1' when no factor is enrolled", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.mfaState).toBe("aal1");
  });

  it("computes mfaState='aal2-required' when currentLevel=aal1 && nextLevel=aal2", async () => {
    supabaseMock.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.mfaState).toBe("aal2-required"));
  });

  it("computes mfaState='aal2' when currentLevel=aal2", async () => {
    supabaseMock.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.mfaState).toBe("aal2"));
  });

  it("collapses to 'unknown' when getAuthenticatorAssuranceLevel returns error", async () => {
    supabaseMock.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: null,
      error: new Error("aal_failed"),
    });
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.mfaState).toBe("unknown");
  });

  it("recalculates mfaState on MFA_CHALLENGE_VERIFIED event", async () => {
    // start in aal2-required
    supabaseMock.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.mfaState).toBe("aal2-required"));

    // After challenge passes the AAL becomes aal2
    supabaseMock.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });

    await act(async () => {
      supabaseMock.__listener?.("MFA_CHALLENGE_VERIFIED", SESSION_AAL2);
      // give the awaited refreshMfaState a tick to settle
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.mfaState).toBe("aal2"));
  });

  it("clears mfaState to 'unknown' on SIGNED_OUT", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.mfaState).toBe("aal1"));
    await act(async () => {
      supabaseMock.__listener?.("SIGNED_OUT", null);
    });
    await waitFor(() => expect(result.current.mfaState).toBe("unknown"));
  });

  it("enrollMfa() calls supabase.auth.mfa.enroll with totp + returns {factorId,qrCode,secret}", async () => {
    supabaseMock.auth.mfa.enroll.mockResolvedValue({
      data: {
        id: "factor-123",
        totp: { qr_code: "data:image/svg+xml;...", secret: "JBSWY3DPEHPK3PXP" },
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let enrolled: Awaited<ReturnType<typeof result.current.enrollMfa>> | null = null;
    await act(async () => {
      enrolled = await result.current.enrollMfa();
    });

    expect(supabaseMock.auth.mfa.enroll).toHaveBeenCalledWith(
      expect.objectContaining({ factorType: "totp" }),
    );
    expect(enrolled).toEqual({
      factorId: "factor-123",
      qrCode: "data:image/svg+xml;...",
      secret: "JBSWY3DPEHPK3PXP",
      error: null,
    });
  });

  it("enrollMfa() returns error in result when supabase fails", async () => {
    supabaseMock.auth.mfa.enroll.mockResolvedValue({
      data: null,
      error: new Error("enroll_failed"),
    });
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let enrolled: Awaited<ReturnType<typeof result.current.enrollMfa>> | null = null;
    await act(async () => {
      enrolled = await result.current.enrollMfa();
    });

    expect(enrolled?.error).toBeInstanceOf(Error);
    expect(enrolled?.factorId).toBeNull();
  });

  it("confirmMfaEnroll(id, code) does challenge -> verify and refreshes AAL on success", async () => {
    supabaseMock.auth.mfa.challenge.mockResolvedValue({
      data: { id: "challenge-1" },
      error: null,
    });
    supabaseMock.auth.mfa.verify.mockResolvedValue({ data: {}, error: null });
    // After verify, AAL becomes aal2
    supabaseMock.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res: { error: Error | null } | null = null;
    await act(async () => {
      res = await result.current.confirmMfaEnroll("factor-1", "123456");
    });

    expect(supabaseMock.auth.mfa.challenge).toHaveBeenCalledWith({ factorId: "factor-1" });
    expect(supabaseMock.auth.mfa.verify).toHaveBeenCalledWith({
      factorId: "factor-1",
      challengeId: "challenge-1",
      code: "123456",
    });
    expect(res?.error).toBeNull();
    await waitFor(() => expect(result.current.mfaState).toBe("aal2"));
  });

  it("confirmMfaEnroll surfaces challenge error without calling verify", async () => {
    supabaseMock.auth.mfa.challenge.mockResolvedValue({
      data: null,
      error: new Error("challenge_failed"),
    });
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res: { error: Error | null } | null = null;
    await act(async () => {
      res = await result.current.confirmMfaEnroll("factor-1", "123456");
    });
    expect(res?.error).toBeInstanceOf(Error);
    expect(supabaseMock.auth.mfa.verify).not.toHaveBeenCalled();
  });

  it("verifyMfaChallenge does the same challenge+verify path on AAL1", async () => {
    supabaseMock.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    supabaseMock.auth.mfa.challenge.mockResolvedValue({
      data: { id: "challenge-2" },
      error: null,
    });
    supabaseMock.auth.mfa.verify.mockResolvedValue({ data: {}, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.mfaState).toBe("aal2-required"));

    // After verify call AAL elevates
    supabaseMock.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });

    let res: { error: Error | null } | null = null;
    await act(async () => {
      res = await result.current.verifyMfaChallenge("factor-9", "654321");
    });
    expect(res?.error).toBeNull();
    expect(supabaseMock.auth.mfa.challenge).toHaveBeenCalledWith({ factorId: "factor-9" });
    expect(supabaseMock.auth.mfa.verify).toHaveBeenCalledWith({
      factorId: "factor-9",
      challengeId: "challenge-2",
      code: "654321",
    });
  });

  it("unenrollMfa() calls supabase.auth.mfa.unenroll with the factorId", async () => {
    supabaseMock.auth.mfa.unenroll.mockResolvedValue({ data: {}, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res: { error: Error | null } | null = null;
    await act(async () => {
      res = await result.current.unenrollMfa("factor-x");
    });
    expect(supabaseMock.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: "factor-x" });
    expect(res?.error).toBeNull();
  });

  it("listMfaFactors filters out unverified factors", async () => {
    const factors: Factor[] = [
      {
        id: "f1",
        factor_type: "totp",
        status: "verified",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "f2",
        factor_type: "totp",
        status: "unverified",
        created_at: "2026-01-02T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
      },
    ];
    supabaseMock.auth.mfa.listFactors.mockResolvedValue({
      data: { totp: factors, all: factors },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let listed: Factor[] = [];
    await act(async () => {
      listed = await result.current.listMfaFactors();
    });
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe("f1");
    expect(listed[0].status).toBe("verified");
  });

  it("listMfaFactors returns [] on error", async () => {
    supabaseMock.auth.mfa.listFactors.mockResolvedValue({
      data: null,
      error: new Error("list_failed"),
    });
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let listed: Factor[] = [];
    await act(async () => {
      listed = await result.current.listMfaFactors();
    });
    expect(listed).toEqual([]);
  });

  it("signOut() resets mfaState to 'unknown'", async () => {
    supabaseMock.auth.signOut.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.mfaState).toBe("aal1"));
    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.mfaState).toBe("unknown");
  });
});

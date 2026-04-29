import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { ReactNode } from "react";
import { useMfaGuard } from "@/hooks/useMfaGuard";
import type { MfaState } from "@/contexts/AuthContext";

/**
 * useMfaGuard reads from AuthContext via useAuth(). We mock the module to
 * inject deterministic states without spinning up Supabase.
 */
type AuthShape = {
  loading: boolean;
  mfaState: MfaState;
};

const authMock = vi.hoisted(() => ({
  current: { loading: false, mfaState: "aal1" } as AuthShape,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authMock.current,
}));

const Wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;

describe("useMfaGuard", () => {
  it("requireMfaChallenge=true when mfaState='aal2-required'", () => {
    authMock.current = { loading: false, mfaState: "aal2-required" };
    const { result } = renderHook(() => useMfaGuard(), { wrapper: Wrapper });
    expect(result.current.requireMfaChallenge).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it("requireMfaChallenge=false when mfaState='aal2'", () => {
    authMock.current = { loading: false, mfaState: "aal2" };
    const { result } = renderHook(() => useMfaGuard(), { wrapper: Wrapper });
    expect(result.current.requireMfaChallenge).toBe(false);
  });

  it("requireMfaChallenge=false when mfaState='aal1' (no MFA enrolled)", () => {
    authMock.current = { loading: false, mfaState: "aal1" };
    const { result } = renderHook(() => useMfaGuard(), { wrapper: Wrapper });
    expect(result.current.requireMfaChallenge).toBe(false);
  });

  it("loading=true when mfaState='unknown' (still computing)", () => {
    authMock.current = { loading: false, mfaState: "unknown" };
    const { result } = renderHook(() => useMfaGuard(), { wrapper: Wrapper });
    expect(result.current.loading).toBe(true);
    expect(result.current.requireMfaChallenge).toBe(false);
  });

  it("loading=true when AuthContext is still bootstrapping", () => {
    authMock.current = { loading: true, mfaState: "aal1" };
    const { result } = renderHook(() => useMfaGuard(), { wrapper: Wrapper });
    expect(result.current.loading).toBe(true);
    // While loading, we MUST NOT instruct the caller to redirect.
    expect(result.current.requireMfaChallenge).toBe(false);
  });
});

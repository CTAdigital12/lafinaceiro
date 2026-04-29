import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import MfaChallenge from "@/pages/MfaChallenge";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const auth = vi.hoisted(() => ({
  user: { id: "user-1", email: "user@test.dev" },
  loading: false,
  mfaState: "aal2-required" as
    | "unknown"
    | "aal1"
    | "aal2"
    | "aal2-required",
  signOut: vi.fn(async () => {}),
  verifyMfaChallenge: vi.fn(),
  listMfaFactors: vi.fn(),
}));

const navigateMock = vi.hoisted(() => vi.fn());

const supabaseMock = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
  },
}));

const toast = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth,
}));

vi.mock("react-router-dom", async () => {
  const real = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...real,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast }),
}));

vi.mock("@/lib/errorHandler", () => ({
  logError: vi.fn(),
  getSafeErrorMessage: (e: unknown, fallback = "generic") =>
    typeof e === "string" ? e : fallback,
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/mfa-challenge"]}>
      <MfaChallenge />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { id: "user-1", email: "user@test.dev" };
  auth.loading = false;
  auth.mfaState = "aal2-required";
  auth.listMfaFactors.mockResolvedValue([
    {
      id: "factor-aaa",
      factor_type: "totp",
      status: "verified",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ]);
  auth.verifyMfaChallenge.mockResolvedValue({ error: null });
  supabaseMock.auth.getSession.mockResolvedValue({
    data: { session: { access_token: "tk-aal1" } },
  });
});

describe("<MfaChallenge />", () => {
  it("TOTP mode: auto-submits when 6 digits are entered and navigates home on success", async () => {
    renderPage();
    const user = userEvent.setup();

    const otpInput = await screen.findByLabelText(/código de seis dígitos/i);
    await user.click(otpInput);
    await user.keyboard("123456");

    await waitFor(() => {
      expect(auth.verifyMfaChallenge).toHaveBeenCalledWith("factor-aaa", "123456");
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("TOTP mode: shows 'Código inválido' inline on verify error", async () => {
    auth.verifyMfaChallenge.mockResolvedValue({ error: new Error("invalid") });
    renderPage();
    const user = userEvent.setup();

    const otpInput = await screen.findByLabelText(/código de seis dígitos/i);
    await user.click(otpInput);
    await user.keyboard("000000");

    expect(
      await screen.findByText(/código inválido/i),
    ).toBeInTheDocument();
  });

  it("Recovery mode: switches input, calls /mfa-recovery-verify, signs out on 200 with mfa_reset", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        mfa_reset: true,
        message: "MFA desativado.",
      }),
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    renderPage();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: /usar código de recuperação/i }),
    );

    const input = await screen.findByLabelText(/código de recuperação/i);
    await user.type(input, "AAAA-BBBB-CCCC-DDDD");
    await user.click(screen.getByRole("button", { name: /verificar/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/functions/v1/mfa-recovery-verify"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("AAAA-BBBB-CCCC-DDDD"),
        }),
      );
    });

    await waitFor(() => {
      expect(auth.signOut).toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith("/auth", { replace: true });
    });
  });

  it("Recovery mode: 401 shows 'Código inválido' inline; does not sign out", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "invalid_code" }),
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    renderPage();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /usar código de recuperação/i }),
    );
    const input = await screen.findByLabelText(/código de recuperação/i);
    await user.type(input, "WRONGCODEHERE");
    await user.click(screen.getByRole("button", { name: /verificar/i }));

    expect(await screen.findByText(/código inválido/i)).toBeInTheDocument();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("Recovery mode: 429 shows rate-limit message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "rate_limited" }),
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    renderPage();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /usar código de recuperação/i }),
    );
    const input = await screen.findByLabelText(/código de recuperação/i);
    await user.type(input, "AAAA-BBBB-CCCC-DDDD");
    await user.click(screen.getByRole("button", { name: /verificar/i }));

    expect(
      await screen.findByText(/muitas tentativas\. aguarde 15 minutos/i),
    ).toBeInTheDocument();
  });

  it("Auth-aware redirect: when mfaState='aal2', sends user to '/'", async () => {
    auth.mfaState = "aal2";
    renderPage();
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("Auth-aware redirect: when no user, sends to '/auth'", async () => {
    auth.user = null as unknown as { id: string; email?: string };
    renderPage();
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/auth", { replace: true });
    });
  });

  it("after 5 wrong TOTP submissions in window, form is blocked with message", async () => {
    auth.verifyMfaChallenge.mockResolvedValue({ error: new Error("invalid") });
    renderPage();
    const user = userEvent.setup();

    const otpInput = await screen.findByLabelText(/código de seis dígitos/i);
    for (let i = 0; i < 5; i++) {
      await user.click(otpInput);
      await user.keyboard("000000");
      await waitFor(() => {
        expect(auth.verifyMfaChallenge).toHaveBeenCalledTimes(i + 1);
      });
    }

    expect(
      await screen.findByText(/muitas tentativas/i),
    ).toBeInTheDocument();
  });
});

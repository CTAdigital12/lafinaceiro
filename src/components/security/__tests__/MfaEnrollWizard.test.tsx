import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MfaEnrollWizard } from "@/components/security/MfaEnrollWizard";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const auth = vi.hoisted(() => ({
  enrollMfa: vi.fn(),
  confirmMfaEnroll: vi.fn(),
}));

const supabaseMock = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    refreshSession: vi.fn(),
    mfa: {
      unenroll: vi.fn(),
    },
  },
}));

const toast = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth,
}));

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

// jsdom doesn't expose matchMedia, which useIsMobile reads. Mock the hook
// to always render the desktop branch (Dialog) — keeps tests deterministic.
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

// jsdom does not implement Element.scrollIntoView, used by Radix Dialog focus.
// Polyfill no-op to keep tests quiet.
beforeEach(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  // Default clipboard mock — provides resolved writeText.
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
    writable: true,
  });
  vi.clearAllMocks();
});

const FAKE_QR =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'/>";
const FAKE_SECRET = "JBSWY3DPEHPK3PXP";
const FAKE_CODES = [
  "AAAA-BBBB-CCCC-DDDD",
  "EEEE-FFFF-GGGG-HHHH",
  "IIII-JJJJ-KKKK-LLLL",
  "MMMM-NNNN-OOOO-PPPP",
  "QQQQ-RRRR-SSSS-TTTT",
  "UUUU-VVVV-WWWW-XXXX",
  "YYYY-ZZZZ-1111-2222",
  "3333-4444-5555-6666",
];

function setupHappyPath() {
  auth.enrollMfa.mockResolvedValue({
    factorId: "factor-xyz",
    qrCode: FAKE_QR,
    secret: FAKE_SECRET,
    error: null,
  });
  auth.confirmMfaEnroll.mockResolvedValue({ error: null });
  supabaseMock.auth.getSession.mockResolvedValue({
    data: { session: { access_token: "tk-aal2" } },
  });
  supabaseMock.auth.refreshSession.mockResolvedValue({ data: {}, error: null });
  supabaseMock.auth.mfa.unenroll.mockResolvedValue({ data: {}, error: null });

  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ codes: FAKE_CODES, batch_id: "b1", count: 8 }),
  });
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    fetchMock as unknown as typeof fetch;
  return { fetchMock };
}

describe("<MfaEnrollWizard />", () => {
  it("step 1: starts enroll on open and renders QR + secret", async () => {
    setupHappyPath();
    render(
      <MfaEnrollWizard open onOpenChange={() => {}} onCompleted={() => {}} />,
    );

    await waitFor(() => {
      expect(auth.enrollMfa).toHaveBeenCalledTimes(1);
    });

    // QR alt text rendered
    const img = await screen.findByAltText(/QR code para configurar 2FA/i);
    expect(img).toHaveAttribute("src", FAKE_QR);

    // Secret rendered as <code>
    expect(screen.getByText(FAKE_SECRET)).toBeInTheDocument();

    // "Próximo" enabled (factorId present)
    const nextBtn = screen.getByRole("button", { name: /próximo/i });
    expect(nextBtn).toBeEnabled();
  });

  it("step 1 -> 2 -> 3: completes enroll, calls confirmMfaEnroll and generates codes", async () => {
    const { fetchMock } = setupHappyPath();
    const onCompleted = vi.fn();
    render(
      <MfaEnrollWizard open onOpenChange={() => {}} onCompleted={onCompleted} />,
    );

    // Wait for step 1 ready
    await screen.findByAltText(/QR code para configurar 2FA/i);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /próximo/i }));

    // Step 2 — type 6-digit code (use keyboard typing on the OTP input)
    // The InputOTP component exposes 6 hidden slots; we can grab the input by aria-label.
    const otpInput = await screen.findByLabelText(/código de seis dígitos/i);
    await user.click(otpInput);
    await user.keyboard("123456");

    const confirmBtn = screen.getByRole("button", { name: /confirmar/i });
    await waitFor(() => expect(confirmBtn).toBeEnabled());
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(auth.confirmMfaEnroll).toHaveBeenCalledWith("factor-xyz", "123456");
    });

    // Step 3 — codes appear; fetch was called
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/functions/v1/mfa-recovery-generate"),
        expect.objectContaining({ method: "POST" }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText(FAKE_CODES[0])).toBeInTheDocument();
    });
    expect(screen.getAllByText(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)).toHaveLength(8);
  });

  it("step 3: 'Concluir' is disabled until checkbox 'Salvei' is checked", async () => {
    setupHappyPath();
    render(<MfaEnrollWizard open onOpenChange={() => {}} />);
    const user = userEvent.setup();

    await screen.findByAltText(/QR code para configurar 2FA/i);
    await user.click(screen.getByRole("button", { name: /próximo/i }));

    const otpInput = await screen.findByLabelText(/código de seis dígitos/i);
    await user.click(otpInput);
    await user.keyboard("123456");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    const finishBtn = await screen.findByRole("button", { name: /concluir/i });
    expect(finishBtn).toBeDisabled();

    // Check the "salvei" checkbox
    const checkbox = screen.getByRole("checkbox", {
      name: /salvei os códigos em local seguro/i,
    });
    await user.click(checkbox);

    await waitFor(() => expect(finishBtn).toBeEnabled());
  });

  it("step 3: 'Concluir' triggers refreshSession + onCompleted", async () => {
    setupHappyPath();
    const onOpenChange = vi.fn();
    const onCompleted = vi.fn();
    render(
      <MfaEnrollWizard
        open
        onOpenChange={onOpenChange}
        onCompleted={onCompleted}
      />,
    );
    const user = userEvent.setup();

    await screen.findByAltText(/QR code para configurar 2FA/i);
    await user.click(screen.getByRole("button", { name: /próximo/i }));

    const otpInput = await screen.findByLabelText(/código de seis dígitos/i);
    await user.click(otpInput);
    await user.keyboard("123456");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    await screen.findByRole("button", { name: /concluir/i });
    await user.click(
      screen.getByRole("checkbox", {
        name: /salvei os códigos em local seguro/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: /concluir/i }));

    await waitFor(() => {
      expect(supabaseMock.auth.refreshSession).toHaveBeenCalled();
      expect(onCompleted).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("step 2: invalid code surfaces inline error and keeps the user on step 2", async () => {
    setupHappyPath();
    auth.confirmMfaEnroll.mockResolvedValueOnce({
      error: new Error("invalid_code"),
    });
    render(<MfaEnrollWizard open onOpenChange={() => {}} />);
    const user = userEvent.setup();

    await screen.findByAltText(/QR code para configurar 2FA/i);
    await user.click(screen.getByRole("button", { name: /próximo/i }));

    const otpInput = await screen.findByLabelText(/código de seis dígitos/i);
    await user.click(otpInput);
    await user.keyboard("000000");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(
      await screen.findByText(/código inválido. verifique o app/i),
    ).toBeInTheDocument();

    // Still on step 2 (no "Concluir" button shown)
    expect(screen.queryByRole("button", { name: /concluir/i })).not.toBeInTheDocument();
  });

  it("SECURITY (R20): never logs recovery code plaintext to console", async () => {
    setupHappyPath();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(<MfaEnrollWizard open onOpenChange={() => {}} />);
    const user = userEvent.setup();

    await screen.findByAltText(/QR code para configurar 2FA/i);
    await user.click(screen.getByRole("button", { name: /próximo/i }));
    const otpInput = await screen.findByLabelText(/código de seis dígitos/i);
    await user.click(otpInput);
    await user.keyboard("123456");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    // Wait for codes to render (fetch resolves -> setRecoveryCodes)
    await screen.findByText(FAKE_CODES[0]);

    // Inspect every call's stringified args for any of the codes.
    const allCalls = [
      ...consoleLog.mock.calls,
      ...consoleError.mock.calls,
      ...consoleWarn.mock.calls,
    ];
    const flat = allCalls.map((args) => args.map((a) => String(a)).join(" ")).join("\n");
    for (const code of FAKE_CODES) {
      expect(flat).not.toContain(code);
    }
    // And the secret too.
    expect(flat).not.toContain(FAKE_SECRET);

    consoleLog.mockRestore();
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });

  it("step 1: enrollMfa error surfaces and offers a 'Fechar' escape", async () => {
    auth.enrollMfa.mockResolvedValue({
      factorId: null,
      qrCode: null,
      secret: null,
      error: new Error("enroll_failed"),
    });
    render(<MfaEnrollWizard open onOpenChange={() => {}} />);

    expect(await screen.findByRole("button", { name: /fechar/i })).toBeInTheDocument();
    // No QR rendered
    expect(screen.queryByAltText(/QR code/i)).not.toBeInTheDocument();
  });

  it("on close: state is reset (no codes leaked across re-opens)", async () => {
    setupHappyPath();
    const { rerender } = render(
      <MfaEnrollWizard open onOpenChange={() => {}} />,
    );
    await screen.findByAltText(/QR code para configurar 2FA/i);

    // Reset enroll mock so we can assert it's called again on re-open.
    auth.enrollMfa.mockClear();

    // Close
    rerender(<MfaEnrollWizard open={false} onOpenChange={() => {}} />);
    await act(async () => {
      // allow useEffect cleanup to run
      await Promise.resolve();
    });

    // Re-open
    rerender(<MfaEnrollWizard open onOpenChange={() => {}} />);
    await waitFor(() => expect(auth.enrollMfa).toHaveBeenCalledTimes(1));
  });

  // Médio #1 fix — cleanup of orphaned factor when user closes mid-flow.
  // If the wizard is closed between step 1 (factor created, unverified) and
  // step 3 (verified), the orphan factor must be unenrolled to keep
  // auth.mfa_factors clean.
  it("on close before verify: unenrolls the orphan factor", async () => {
    setupHappyPath();
    const { rerender } = render(
      <MfaEnrollWizard open onOpenChange={() => {}} />,
    );
    // Wait for step 1 to populate factorId.
    await screen.findByAltText(/QR code para configurar 2FA/i);

    // Close the wizard (still on step 1, factor unverified)
    rerender(<MfaEnrollWizard open={false} onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(supabaseMock.auth.mfa.unenroll).toHaveBeenCalledWith({
        factorId: "factor-xyz",
      });
    });
  });

  // After full verification (step 3) we MUST NOT unenroll on close — the
  // factor is the user's now-active 2FA. handleFinish path.
  it("on close after verify: does NOT unenroll the verified factor", async () => {
    setupHappyPath();
    const onCompleted = vi.fn();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <MfaEnrollWizard
        open
        onOpenChange={onOpenChange}
        onCompleted={onCompleted}
      />,
    );
    const user = userEvent.setup();

    await screen.findByAltText(/QR code para configurar 2FA/i);
    await user.click(screen.getByRole("button", { name: /próximo/i }));

    const otpInput = await screen.findByLabelText(/código de seis dígitos/i);
    await user.click(otpInput);
    await user.keyboard("123456");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    // Wait until we're on step 3 (codes shown).
    await screen.findByText(FAKE_CODES[0]);
    // Confirm "Concluir" to complete the flow.
    await user.click(
      screen.getByRole("checkbox", {
        name: /salvei os códigos em local seguro/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: /concluir/i }));

    // Now the parent closes the dialog (handleFinish set open=false).
    rerender(
      <MfaEnrollWizard
        open={false}
        onOpenChange={onOpenChange}
        onCompleted={onCompleted}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(supabaseMock.auth.mfa.unenroll).not.toHaveBeenCalled();
  });
});

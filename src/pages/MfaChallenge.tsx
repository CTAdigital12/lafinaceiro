import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Wallet, Loader2, ShieldCheck, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { logError, getSafeErrorMessage } from "@/lib/errorHandler";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const RECOVERY_VERIFY_URL = `${FUNCTIONS_URL}/mfa-recovery-verify`;
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

/**
 * Normalizes a recovery code input:
 *  - trims whitespace
 *  - uppercases
 *  - removes spaces
 *  - inserts hyphen every 4 chars if user typed without hyphens
 *
 * Output is intended to match the format the Edge Function generated
 * (XXXX-XXXX-XXXX-XXXX). Backend should still accept either format —
 * this is just a UX nicety. NEVER log the result.
 */
function normalizeRecoveryCode(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, "");
  if (cleaned.includes("-")) return cleaned;
  // group into 4s
  return cleaned.match(/.{1,4}/g)?.join("-") ?? cleaned;
}

export default function MfaChallenge() {
  const { user, mfaState, signOut, verifyMfaChallenge, listMfaFactors, loading: authLoading } =
    useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<number[]>([]);
  const [factorId, setFactorId] = useState<string | null>(null);

  // Cleanup expired attempts in the local rate limiter window.
  const activeAttempts = useMemo(() => {
    const now = Date.now();
    return attempts.filter((t) => now - t < ATTEMPT_WINDOW_MS);
  }, [attempts]);

  const blocked = activeAttempts.length >= MAX_ATTEMPTS;

  // Auth-aware redirects
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    if (mfaState === "aal2") {
      navigate("/", { replace: true });
      return;
    }
    if (mfaState === "aal1") {
      // user has no MFA enrolled — should never be here
      navigate("/", { replace: true });
    }
  }, [authLoading, user, mfaState, navigate]);

  // Resolve the first verified factor for TOTP verification
  useEffect(() => {
    let cancelled = false;
    if (!user || mfaState !== "aal2-required") return;
    (async () => {
      const factors = await listMfaFactors();
      if (cancelled) return;
      if (factors.length > 0) {
        setFactorId(factors[0].id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, mfaState, listMfaFactors]);

  const recordAttempt = useCallback(() => {
    setAttempts((prev) => [...prev, Date.now()]);
  }, []);

  const handleTotpSubmit = useCallback(
    async (value: string) => {
      if (blocked || submitting || !factorId) return;
      setSubmitting(true);
      setErrorMsg(null);
      try {
        const { error } = await verifyMfaChallenge(factorId, value);
        if (error) {
          recordAttempt();
          setErrorMsg("Código inválido. Tente novamente.");
          setCode("");
          return;
        }
        navigate("/", { replace: true });
      } catch (err) {
        logError(err, "MfaChallenge.handleTotpSubmit");
        recordAttempt();
        setErrorMsg("Não foi possível validar o código. Tente novamente.");
        setCode("");
      } finally {
        setSubmitting(false);
      }
    },
    [blocked, submitting, factorId, verifyMfaChallenge, recordAttempt, navigate],
  );

  // Auto-submit when 6 digits filled
  useEffect(() => {
    if (mode === "totp" && code.length === 6 && !submitting && !blocked && factorId) {
      void handleTotpSubmit(code);
    }
  }, [code, mode, submitting, blocked, factorId, handleTotpSubmit]);

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked || submitting) return;
    const normalized = normalizeRecoveryCode(recoveryCode);
    if (normalized.length < 12) {
      setErrorMsg("Código de recuperação inválido.");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setErrorMsg("Sessão expirada. Faça login novamente.");
        await signOut();
        navigate("/auth", { replace: true });
        return;
      }
      const res = await fetch(RECOVERY_VERIFY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ code: normalized }),
      });

      if (res.status === 200) {
        const json = await res.json().catch(() => ({}));
        // SECURITY (R20): never log the recovery code or full response
        const message =
          typeof json?.message === "string"
            ? json.message
            : "Código aceito. Você foi deslogado por segurança. Faça login novamente para reconfigurar o 2FA.";
        toast({
          title: "Código de recuperação aceito",
          description: message,
        });
        await signOut();
        navigate("/auth", { replace: true });
        return;
      }

      if (res.status === 401) {
        recordAttempt();
        setErrorMsg("Código inválido.");
        setRecoveryCode("");
        return;
      }
      if (res.status === 429) {
        setErrorMsg("Muitas tentativas. Aguarde 15 minutos.");
        setRecoveryCode("");
        return;
      }
      // Any other status
      setErrorMsg(getSafeErrorMessage(new Error(`status_${res.status}`)));
      setRecoveryCode("");
    } catch (err) {
      logError(err, "MfaChallenge.handleRecoverySubmit");
      setErrorMsg(getSafeErrorMessage(err, "network_error"));
      setRecoveryCode("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  if (authLoading || mfaState === "unknown") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl gradient-balance mb-4">
            <Wallet className="h-8 w-8 text-balance-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">
            Verificação de dois fatores
          </h1>
          <p className="text-muted-foreground mt-2">
            {mode === "totp"
              ? "Digite o código de 6 dígitos do seu app autenticador"
              : "Digite um dos códigos de recuperação que você salvou"}
          </p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-8 shadow-card">
          {mode === "totp" ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-balance" />
                <span>Sessão protegida — abra seu autenticador</span>
              </div>

              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={setCode}
                  disabled={submitting || blocked || !factorId}
                  inputMode="numeric"
                  autoFocus
                  aria-label="Código de seis dígitos"
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {errorMsg && (
                <p className="text-sm text-expense text-center" role="alert">
                  {errorMsg}
                </p>
              )}

              {blocked && (
                <p className="text-sm text-expense text-center" role="alert">
                  Muitas tentativas. Aguarde ou use um código de recuperação.
                </p>
              )}

              {submitting && (
                <div className="flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode("recovery");
                    setErrorMsg(null);
                    setCode("");
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"
                >
                  <KeyRound className="h-4 w-4" />
                  Usar código de recuperação
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleRecoverySubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="recoveryCode">Código de recuperação</Label>
                <Input
                  id="recoveryCode"
                  type="text"
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  disabled={submitting || blocked}
                  inputMode="text"
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="font-mono tracking-wider"
                />
              </div>

              {errorMsg && (
                <p className="text-sm text-expense" role="alert">
                  {errorMsg}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={submitting || blocked || recoveryCode.length === 0}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  "Verificar"
                )}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode("totp");
                    setErrorMsg(null);
                    setRecoveryCode("");
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Voltar para código do app
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 pt-6 border-t border-border text-center">
            <button
              type="button"
              onClick={handleSignOut}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Voltar e sair
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

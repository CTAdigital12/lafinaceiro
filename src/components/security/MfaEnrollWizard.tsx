import { useEffect, useState } from "react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  Loader2,
  Copy,
  CheckCheck,
  ShieldAlert,
  Smartphone,
  ArrowLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { logError, getSafeErrorMessage } from "@/lib/errorHandler";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const RECOVERY_GENERATE_URL = `${FUNCTIONS_URL}/mfa-recovery-generate`;

interface MfaEnrollWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when enrollment + recovery codes flow completes successfully. */
  onCompleted?: () => void;
}

type Step = 1 | 2 | 3;

export function MfaEnrollWizard({ open, onOpenChange, onCompleted }: MfaEnrollWizardProps) {
  const { enrollMfa, confirmMfaEnroll } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(1);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const [verifyCode, setVerifyCode] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Reset state on close.
  // SECURITY/UX: if the user closes the wizard between step 1 (enroll started,
  // factor created in 'unverified' state) and step 3 (verified), the unverified
  // factor would remain orphaned in auth.mfa_factors. Reopening would create
  // another, accumulating dead rows. We unenroll the orphan before resetting.
  // Errors are logged but never block the close — UX must remain snappy.
  useEffect(() => {
    if (!open) {
      const orphanId = factorId;
      const wasUnverified = step < 3;
      const cleanupOrphan = async () => {
        if (orphanId && wasUnverified) {
          try {
            const { error } = await supabase.auth.mfa.unenroll({ factorId: orphanId });
            if (error) {
              logError(error, "MfaEnrollWizard.cleanupOrphanFactor");
            }
          } catch (err) {
            logError(err, "MfaEnrollWizard.cleanupOrphanFactor.catch");
          }
        }
      };
      void cleanupOrphan();

      setStep(1);
      setFactorId(null);
      setQrCode(null);
      setSecret(null);
      setVerifyCode("");
      setVerifyError(null);
      setRecoveryCodes([]);
      setRecoveryError(null);
      setConfirmedSaved(false);
      setCopiedAll(false);
      setCopiedIndex(null);
      setCopiedSecret(false);
      setEnrollError(null);
    }
    // We intentionally only depend on `open`. Reading the latest factorId/step
    // at close time is the goal — we don't want this effect to re-run on
    // every step change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Step 1 — start enrollment on open
  useEffect(() => {
    if (!open || step !== 1 || factorId) return;
    let cancelled = false;
    (async () => {
      setEnrollLoading(true);
      setEnrollError(null);
      const { factorId: id, qrCode: qr, secret: sec, error } = await enrollMfa();
      if (cancelled) return;
      if (error || !id) {
        logError(error, "MfaEnrollWizard.enroll");
        setEnrollError(getSafeErrorMessage(error));
        setEnrollLoading(false);
        return;
      }
      setFactorId(id);
      setQrCode(qr);
      setSecret(sec);
      setEnrollLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, step, factorId, enrollMfa]);

  const handleVerify = async () => {
    if (!factorId || verifyCode.length !== 6) return;
    setVerifyLoading(true);
    setVerifyError(null);
    try {
      const { error } = await confirmMfaEnroll(factorId, verifyCode);
      if (error) {
        setVerifyError("Código inválido. Verifique o app e tente novamente.");
        setVerifyCode("");
        return;
      }
      setStep(3);
    } catch (err) {
      logError(err, "MfaEnrollWizard.handleVerify");
      setVerifyError(getSafeErrorMessage(err));
      setVerifyCode("");
    } finally {
      setVerifyLoading(false);
    }
  };

  // Step 3 — generate recovery codes once we land on step 3
  useEffect(() => {
    if (step !== 3 || recoveryCodes.length > 0) return;
    let cancelled = false;
    (async () => {
      setRecoveryLoading(true);
      setRecoveryError(null);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) {
          setRecoveryError("Sessão expirada. Recarregue e tente novamente.");
          setRecoveryLoading(false);
          return;
        }
        const res = await fetch(RECOVERY_GENERATE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (!res.ok) {
          const status = res.status;
          if (status === 401 || status === 403) {
            setRecoveryError(
              "Você precisa concluir a verificação 2FA antes de gerar os códigos.",
            );
          } else {
            setRecoveryError(getSafeErrorMessage(new Error(`status_${status}`)));
          }
          setRecoveryLoading(false);
          return;
        }
        const json = await res.json().catch(() => ({}));
        const codes: string[] = Array.isArray(json?.codes) ? json.codes : [];
        if (cancelled) return;
        if (codes.length === 0) {
          setRecoveryError("Não foi possível gerar os códigos. Tente novamente.");
        } else {
          // SECURITY (R20): we only keep codes in component state, never log.
          setRecoveryCodes(codes);
        }
      } catch (err) {
        logError(err, "MfaEnrollWizard.generateRecoveryCodes");
        setRecoveryError(getSafeErrorMessage(err, "network_error"));
      } finally {
        if (!cancelled) setRecoveryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, recoveryCodes.length]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      logError(err, "MfaEnrollWizard.copyToClipboard");
      return false;
    }
  };

  const handleCopySecret = async () => {
    if (!secret) return;
    const ok = await copyToClipboard(secret);
    if (ok) {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const handleCopyOne = async (code: string, idx: number) => {
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
  };

  const handleCopyAll = async () => {
    if (recoveryCodes.length === 0) return;
    const ok = await copyToClipboard(recoveryCodes.join("\n"));
    if (ok) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }
  };

  const handleFinish = async () => {
    onOpenChange(false);
    toast({
      title: "2FA ativado com sucesso",
      description: "A partir de agora você precisará do código do app a cada login.",
    });
    // Force AAL re-check across the app.
    await supabase.auth.refreshSession();
    onCompleted?.();
  };

  const renderStep1 = () => {
    if (enrollLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Gerando QR code...</p>
        </div>
      );
    }
    if (enrollError) {
      return (
        <div className="space-y-4 py-4">
          <p className="text-sm text-expense" role="alert">
            {enrollError}
          </p>
          <Button onClick={() => onOpenChange(false)} variant="outline" className="w-full">
            Fechar
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            1. Abra um app autenticador no seu celular e escaneie o QR code abaixo.
          </p>
        </div>

        {qrCode && (
          <div className="flex justify-center bg-white p-4 rounded-lg border border-border">
            {/* Supabase returns an SVG data URL */}
            <img src={qrCode} alt="QR code para configurar 2FA" className="w-48 h-48" />
          </div>
        )}

        {secret && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Não consegue escanear? Digite a chave manualmente:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-muted rounded text-xs font-mono break-all">
                {secret}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopySecret}
                aria-label="Copiar chave"
              >
                {copiedSecret ? (
                  <CheckCheck className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}

        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <Smartphone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Apps recomendados: Google Authenticator, 1Password, Authy.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={() => setStep(2)} disabled={!factorId} className="flex-1">
            Próximo
          </Button>
        </div>
      </div>
    );
  };

  const renderStep2 = () => (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        2. Digite o código de 6 dígitos que aparece no app autenticador.
      </p>

      <div className="flex justify-center">
        <InputOTP
          maxLength={6}
          value={verifyCode}
          onChange={setVerifyCode}
          disabled={verifyLoading}
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

      {verifyError && (
        <p className="text-sm text-expense text-center" role="alert">
          {verifyError}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => setStep(1)}
          className="flex-1"
          disabled={verifyLoading}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Button
          onClick={handleVerify}
          disabled={verifyCode.length !== 6 || verifyLoading}
          className="flex-1"
        >
          {verifyLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Validando...
            </>
          ) : (
            "Confirmar"
          )}
        </Button>
      </div>
    </div>
  );

  const renderStep3 = () => {
    if (recoveryLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Gerando códigos de recuperação...</p>
        </div>
      );
    }
    if (recoveryError) {
      return (
        <div className="space-y-4 py-4">
          <p className="text-sm text-expense" role="alert">
            {recoveryError}
          </p>
          <Button onClick={() => onOpenChange(false)} variant="outline" className="w-full">
            Fechar
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-expense/40 bg-expense/10 p-3 flex items-start gap-2">
          <ShieldAlert className="h-5 w-5 text-expense mt-0.5 shrink-0" />
          <div className="text-sm text-expense space-y-1">
            <p className="font-semibold">Salve estes códigos AGORA.</p>
            <p>
              Eles aparecem apenas uma vez. Use um deles caso perca acesso ao seu app
              autenticador.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleCopyAll}>
            {copiedAll ? (
              <>
                <CheckCheck className="mr-2 h-4 w-4" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Copiar tudo
              </>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {recoveryCodes.map((c, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1 bg-muted px-2 py-1.5 rounded font-mono text-xs"
            >
              <span className="flex-1 break-all select-all">{c}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => handleCopyOne(c, idx)}
                aria-label={`Copiar código ${idx + 1}`}
              >
                {copiedIndex === idx ? (
                  <CheckCheck className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          ))}
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <Checkbox
            checked={confirmedSaved}
            onCheckedChange={(v) => setConfirmedSaved(v === true)}
            className="mt-0.5"
          />
          <span className="text-sm text-foreground">
            Confirmo que salvei os códigos em local seguro.
          </span>
        </label>

        <Button onClick={handleFinish} disabled={!confirmedSaved} className="w-full">
          Concluir
        </Button>
      </div>
    );
  };

  const stepLabel = step === 1 ? "Passo 1 de 3" : step === 2 ? "Passo 2 de 3" : "Passo 3 de 3";

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ativar autenticação de dois fatores"
      description={stepLabel}
    >
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
    </ResponsiveDialog>
  );
}

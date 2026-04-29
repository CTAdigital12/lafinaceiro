import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import {
  Shield,
  KeyRound,
  ShieldCheck,
  Lock,
  Loader2,
  RefreshCw,
  Trash2,
  ArrowLeft,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth, type Factor } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { logError, getSafeErrorMessage } from "@/lib/errorHandler";
import { MfaEnrollWizard } from "@/components/security/MfaEnrollWizard";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const RECOVERY_GENERATE_URL = `${FUNCTIONS_URL}/mfa-recovery-generate`;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Digite sua senha atual"),
    newPassword: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function SecuritySettings() {
  const navigate = useNavigate();
  const { user, listMfaFactors, unenrollMfa, mfaState } = useAuth();
  const { toast } = useToast();

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdErrors, setPwdErrors] = useState<Record<string, string>>({});
  const [pwdLoading, setPwdLoading] = useState(false);

  // MFA state
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorsLoading, setFactorsLoading] = useState(true);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [unenrollDialogOpen, setUnenrollDialogOpen] = useState(false);
  const [unenrollFactorId, setUnenrollFactorId] = useState<string | null>(null);
  const [unenrollLoading, setUnenrollLoading] = useState(false);

  // Regenerate recovery codes state
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [regenCodes, setRegenCodes] = useState<string[]>([]);
  const [regenSaved, setRegenSaved] = useState(false);

  const refreshFactors = async () => {
    setFactorsLoading(true);
    const list = await listMfaFactors();
    setFactors(list);
    setFactorsLoading(false);
  };

  useEffect(() => {
    void refreshFactors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Password change -----
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdErrors({});
    try {
      passwordSchema.parse({ currentPassword, newPassword, confirmPassword });
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errs: Record<string, string> = {};
        err.errors.forEach((e) => {
          if (e.path[0]) errs[e.path[0] as string] = e.message;
        });
        setPwdErrors(errs);
      }
      return;
    }

    if (!user?.email) {
      toast({
        title: "Erro",
        description: "Sessão inválida. Faça login novamente.",
        variant: "destructive",
      });
      return;
    }

    setPwdLoading(true);
    try {
      // KNOWN UX TRADE-OFF (MVP):
      // We reauth by calling signInWithPassword to validate the current password.
      // Side effect: Supabase emits a fresh SIGNED_IN event, which downgrades
      // the session AAL from aal2 -> aal1 (with nextLevel=aal2). The router
      // will then redirect the user to /mfa-challenge after the password
      // change succeeds. UX feels abrupt but is safe (user re-elevates with
      // their TOTP). Inline notice below warns AAL2 users before they submit.
      // TODO(post-MVP): replace with a dedicated edge function
      // `auth-verify-password` that validates the password without emitting
      // SIGNED_IN, so we can keep AAL2 across the password change.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (reauthError) {
        setPwdErrors({ currentPassword: "Senha atual incorreta" });
        setPwdLoading(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        logError(updateError, "SecuritySettings.updatePassword");
        toast({
          title: "Erro",
          description: getSafeErrorMessage(updateError),
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Senha alterada",
        description: "Sua senha foi atualizada com sucesso.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      logError(err, "SecuritySettings.handleChangePassword");
      toast({
        title: "Erro",
        description: getSafeErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setPwdLoading(false);
    }
  };

  // ----- MFA: unenroll -----
  const askUnenroll = (factorId: string) => {
    setUnenrollFactorId(factorId);
    setUnenrollDialogOpen(true);
  };

  const handleConfirmUnenroll = async () => {
    if (!unenrollFactorId) return;
    setUnenrollLoading(true);
    try {
      const { error } = await unenrollMfa(unenrollFactorId);
      if (error) {
        logError(error, "SecuritySettings.unenrollMfa");
        toast({
          title: "Não foi possível desativar",
          description:
            "Talvez você precise fazer login novamente recentemente. Faça logout e login e tente de novo.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "2FA desativado",
        description: "A autenticação de dois fatores foi removida da sua conta.",
      });
      await refreshFactors();
    } catch (err) {
      logError(err, "SecuritySettings.handleConfirmUnenroll");
      toast({
        title: "Erro",
        description: getSafeErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setUnenrollLoading(false);
      setUnenrollDialogOpen(false);
      setUnenrollFactorId(null);
    }
  };

  // ----- Regenerate recovery codes -----
  const handleOpenRegen = async () => {
    setRegenOpen(true);
    setRegenSaved(false);
    setRegenCodes([]);
    setRegenError(null);
    setRegenLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setRegenError("Sessão expirada. Faça login novamente.");
        setRegenLoading(false);
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
        if (res.status === 401 || res.status === 403) {
          setRegenError(
            "Esta ação requer autenticação 2FA recente. Faça logout, entre novamente e tente de novo.",
          );
        } else {
          setRegenError(getSafeErrorMessage(new Error(`status_${res.status}`)));
        }
        setRegenLoading(false);
        return;
      }
      const json = await res.json().catch(() => ({}));
      const codes: string[] = Array.isArray(json?.codes) ? json.codes : [];
      // SECURITY (R20): never log codes
      setRegenCodes(codes);
    } catch (err) {
      logError(err, "SecuritySettings.handleOpenRegen");
      setRegenError(getSafeErrorMessage(err, "network_error"));
    } finally {
      setRegenLoading(false);
    }
  };

  const copyAllCodes = async () => {
    if (regenCodes.length === 0) return;
    try {
      await navigator.clipboard.writeText(regenCodes.join("\n"));
      toast({
        title: "Códigos copiados",
        description: "Cole-os em um gerenciador de senhas seguro.",
      });
    } catch (err) {
      logError(err, "SecuritySettings.copyAllCodes");
    }
  };

  const hasFactor = factors.length > 0;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/settings")}
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Segurança</h1>
          <p className="text-muted-foreground text-sm">
            Gerencie senha, 2FA e sessões
          </p>
        </div>
      </div>

      {/* Card 1 — Change password */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-balance/10 flex items-center justify-center">
            <Lock className="h-5 w-5 text-balance" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Alterar senha</h2>
            <p className="text-sm text-muted-foreground">
              Use uma senha forte que você não usa em outros sites
            </p>
          </div>
        </div>

        {mfaState === "aal2" && (
          <div
            className="mb-4 max-w-md rounded-lg border border-balance/40 bg-balance/10 p-3"
            role="note"
          >
            <p className="text-sm text-foreground">
              <strong>Atenção:</strong> ao alterar a senha, você precisará verificar
              o 2FA novamente.
            </p>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Senha atual</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              disabled={pwdLoading}
            />
            {pwdErrors.currentPassword && (
              <p className="text-sm text-expense">{pwdErrors.currentPassword}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">Nova senha</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              disabled={pwdLoading}
            />
            {pwdErrors.newPassword && (
              <p className="text-sm text-expense">{pwdErrors.newPassword}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={pwdLoading}
            />
            {pwdErrors.confirmPassword && (
              <p className="text-sm text-expense">{pwdErrors.confirmPassword}</p>
            )}
          </div>

          <Button type="submit" disabled={pwdLoading}>
            {pwdLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Alterar senha"
            )}
          </Button>
        </form>
      </div>

      {/* Card 2 — 2FA */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-income/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-income" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground">
              Autenticação de dois fatores
            </h2>
            <p className="text-sm text-muted-foreground">
              {hasFactor
                ? "Sua conta está protegida com 2FA"
                : "Adicione uma camada extra de segurança à sua conta"}
            </p>
          </div>
        </div>

        {factorsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando dispositivos...
          </div>
        ) : !hasFactor ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Use um app autenticador como Google Authenticator, 1Password ou Authy. A
              cada login, você precisará digitar um código de 6 dígitos gerado no app.
            </p>
            <Button onClick={() => setEnrollOpen(true)} className="gap-2">
              <Shield className="h-4 w-4" />
              Ativar 2FA
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {factors.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30"
                >
                  <Smartphone />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {f.friendly_name || "App autenticador"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Adicionado em {formatDate(f.created_at)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => askUnenroll(f.id)}
                    aria-label="Desativar 2FA"
                  >
                    <Trash2 className="h-4 w-4 text-expense" />
                  </Button>
                </div>
              ))}
            </div>

            <Separator />

            <div className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={handleOpenRegen} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Gerar novos códigos de recuperação
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Estado atual da sessão:{" "}
              <strong className="text-foreground">
                {mfaState === "aal2" ? "AAL2 (verificada)" : "AAL1"}
              </strong>
            </p>
          </div>
        )}
      </div>

      {/* Card 3 — Active sessions (placeholder) */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-card opacity-70">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
            <Clock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Sessões ativas</h2>
            <p className="text-sm text-muted-foreground">Em breve</p>
          </div>
        </div>
      </div>

      {/* Enroll wizard */}
      <MfaEnrollWizard
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        onCompleted={refreshFactors}
      />

      {/* Unenroll confirm */}
      <AlertDialog open={unenrollDialogOpen} onOpenChange={setUnenrollDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar autenticação de dois fatores?</AlertDialogTitle>
            <AlertDialogDescription>
              Sua conta voltará a ser protegida apenas por senha. Talvez seja necessário
              fazer login novamente para confirmar a operação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unenrollLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmUnenroll}
              disabled={unenrollLoading}
              className="bg-expense text-expense-foreground hover:bg-expense/90"
            >
              {unenrollLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Desativando...
                </>
              ) : (
                "Desativar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regenerate recovery codes dialog */}
      <ResponsiveDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        title="Novos códigos de recuperação"
        description="Os códigos antigos foram invalidados. Salve estes novos agora."
      >
        {regenLoading ? (
          <div className="flex items-center justify-center py-8 gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Gerando códigos...</span>
          </div>
        ) : regenError ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-expense" role="alert">
              {regenError}
            </p>
            <Button onClick={() => setRegenOpen(false)} variant="outline" className="w-full">
              Fechar
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-expense/40 bg-expense/10 p-3">
              <p className="text-sm text-expense font-semibold">
                Salve estes códigos. Eles aparecem apenas uma vez.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {regenCodes.map((c, idx) => (
                <code
                  key={idx}
                  className="bg-muted px-2 py-1.5 rounded font-mono text-xs break-all select-all"
                >
                  {c}
                </code>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={copyAllCodes} className="flex-1">
                Copiar tudo
              </Button>
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={regenSaved}
                onCheckedChange={(v) => setRegenSaved(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm text-foreground">
                Confirmo que salvei os códigos em local seguro.
              </span>
            </label>

            <Button
              onClick={() => setRegenOpen(false)}
              disabled={!regenSaved}
              className="w-full"
            >
              Concluir
            </Button>
          </div>
        )}
      </ResponsiveDialog>
    </div>
  );
}

// Tiny inline icon shim — KeyRound was imported but we use Smartphone in factor list.
function Smartphone() {
  return (
    <span className="h-9 w-9 rounded-lg bg-balance/10 flex items-center justify-center shrink-0">
      <KeyRound className="h-4 w-4 text-balance" />
    </span>
  );
}

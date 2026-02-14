import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMembers } from "@/hooks/useMembers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { Mail, UserPlus, Loader2, Trash2, CheckCircle, Users, KeyRound } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const emailSchema = z.string().email("E-mail inválido");

export function MembersSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [revokeAccessId, setRevokeAccessId] = useState<string | null>(null);

  // Reset password state
  const [resetTarget, setResetTarget] = useState<{ email: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const { members, isLoading, addMember, revokeAccess } = useMembers();

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      emailSchema.parse(email);
    } catch {
      setError("E-mail inválido");
      return;
    }

    if (email === user?.email) {
      setError("Você não pode adicionar a si mesmo");
      return;
    }

    addMember.mutate(email, {
      onSuccess: () => setEmail(""),
    });
  };

  const handleResetPassword = async () => {
    setPasswordError("");

    if (newPassword.length < 6) {
      setPasswordError("Senha deve ter no mínimo 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("As senhas não coincidem");
      return;
    }

    setIsResetting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("admin-reset-password", {
        body: { email: resetTarget!.email, newPassword },
      });

      if (res.error) {
        throw new Error(res.error.message);
      }
      if (res.data?.error) {
        throw new Error(res.data.error);
      }

      toast({ title: "Senha redefinida com sucesso!" });
      closeResetDialog();
    } catch (err: any) {
      toast({
        title: "Erro ao redefinir senha",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  const closeResetDialog = () => {
    setResetTarget(null);
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
  };

  return (
    <div className="space-y-6">
      {/* Add Member Form */}
      <div>
        <h4 className="font-medium text-foreground mb-3">Adicionar membro</h4>
        <form onSubmit={handleAddMember} className="flex gap-3">
          <div className="flex-1 space-y-1">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="email@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
              />
            </div>
            {error && <p className="text-sm text-expense">{error}</p>}
          </div>
          <Button type="submit" disabled={addMember.isPending || !email}>
            {addMember.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <UserPlus className="h-4 w-4 mr-2" />
                Adicionar
              </>
            )}
          </Button>
        </form>
      </div>

      <Separator />

      {/* Active Members */}
      <div>
        <h4 className="font-medium text-foreground mb-3 flex items-center gap-2">
          <Users className="h-4 w-4" />
          Membros com acesso ({members.length})
        </h4>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-6 bg-muted/30 rounded-lg">
            <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum membro adicionado ainda</p>
            <p className="text-xs text-muted-foreground">Adicione pessoas para compartilhar seus dados financeiros</p>
          </div>
        ) : (
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between bg-muted/50 rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-income/10 flex items-center justify-center">
                    <CheckCircle className="h-4 w-4 text-income" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {member.profiles?.full_name || member.profiles?.email || "Usuário"}
                    </p>
                    <p className="text-xs text-muted-foreground">{member.profiles?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-income/10 text-income">
                    Ativo
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    onClick={() =>
                      setResetTarget({
                        email: member.profiles?.email || "",
                        name: member.profiles?.full_name || member.profiles?.email || "Usuário",
                      })
                    }
                    title="Redefinir senha"
                  >
                    <KeyRound className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-expense"
                    onClick={() => setRevokeAccessId(member.id)}
                    disabled={revokeAccess.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reset Password Dialog */}
      <ResponsiveDialog
        open={!!resetTarget}
        onOpenChange={(open) => !open && closeResetDialog()}
        title="Redefinir Senha"
        description={`Definir nova senha para ${resetTarget?.name}`}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nova Senha</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar Senha</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="Repita a senha"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {passwordError && <p className="text-sm text-expense">{passwordError}</p>}
          <Button
            onClick={handleResetPassword}
            disabled={isResetting || !newPassword || !confirmPassword}
            className="w-full"
          >
            {isResetting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <KeyRound className="h-4 w-4 mr-2" />
            )}
            Salvar Senha
          </Button>
        </div>
      </ResponsiveDialog>

      {/* Revoke Access Confirmation */}
      <AlertDialog open={!!revokeAccessId} onOpenChange={(open) => !open && setRevokeAccessId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar acesso?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja revogar o acesso deste membro? Ele perderá acesso aos seus dados financeiros imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (revokeAccessId) revokeAccess.mutate(revokeAccessId);
                setRevokeAccessId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revogar Acesso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

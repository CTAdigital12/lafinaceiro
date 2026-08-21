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
import { Mail, UserPlus, Loader2, Trash2, CheckCircle, Users, KeyRound } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const emailSchema = z.string().email("E-mail inválido");

export function MembersSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [memberPassword, setMemberPassword] = useState("");
  const [error, setError] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [revokeAccessId, setRevokeAccessId] = useState<string | null>(null);
  // E-mail já validado, aguardando confirmação. Enquanto não for null, o
  // diálogo está aberto e a edge function ainda NÃO foi chamada.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const { members, isLoading, revokeAccess, refetch } = useMembers();

  // Só valida e abre a confirmação. Conceder acesso é irreversível do ponto de
  // vista de quem recebe — a pessoa vê os dados até alguém revogar —, e um
  // e-mail digitado errado que pertença a uma conta real concede o acesso a
  // essa pessoa sem aviso para ninguém. Por isso o e-mail é mostrado de volta
  // antes de qualquer chamada.
  const handleAddMember = (e: React.FormEvent) => {
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

    setPendingEmail(email);
  };

  const confirmAddMember = async () => {
    setPendingEmail(null);
    setIsAdding(true);
    try {
      const res = await supabase.functions.invoke("add-member", {
        body: { email, password: memberPassword || undefined },
      });

      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);

      toast({
        title: res.data?.created
          ? "Conta criada e membro adicionado!"
          : "Membro adicionado!",
      });
      setEmail("");
      setMemberPassword("");
      refetch();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Add Member Form */}
      <div>
        <h4 className="font-medium text-foreground mb-3">Adicionar membro</h4>
        <form onSubmit={handleAddMember} className="space-y-3">
          <div className="space-y-1">
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
          </div>
          <div className="space-y-1">
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Senha (se for criar conta nova)"
                value={memberPassword}
                onChange={(e) => setMemberPassword(e.target.value)}
                className="pl-10"
              />
            </div>
            <p className="text-xs text-muted-foreground">Deixe em branco se o usuário já tem conta</p>
          </div>
          {error && <p className="text-sm text-expense">{error}</p>}
          <Button type="submit" disabled={isAdding || !email} className="w-full">
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <UserPlus className="h-4 w-4 mr-2" />
                Adicionar Membro
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
        <p className="text-xs text-muted-foreground mt-3">
          Esqueceu a senha de um membro? Ele mesmo recupera em “Esqueci minha senha”, na tela de
          login. Ninguém pode trocar a senha de outra pessoa por aqui.
        </p>
      </div>

      {/* Confirmação de concessão — mostra o e-mail de volta antes de chamar
          a edge function, para que um erro de digitação apareça aqui e não
          vire acesso concedido a um estranho. */}
      <AlertDialog open={!!pendingEmail} onOpenChange={(open) => !open && setPendingEmail(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferir o e-mail antes de conceder</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Quem tiver acesso a este e-mail vai poder ver todas as suas finanças — contas, lançamentos, cartões, categorias e orçamentos.</p>
                <p className="font-mono text-sm break-all bg-muted rounded-md px-3 py-2 text-foreground">
                  {pendingEmail}
                </p>
                <p>
                  Confira caractere por caractere. Se este e-mail pertencer a outra pessoa, ela passa a ver seus dados{" "}
                  <strong className="text-foreground">sem ser avisada</strong>, e o acesso só termina quando você revogar aqui.
                </p>
                {memberPassword ? (
                  <p>Como você preencheu uma senha, uma conta nova será criada caso este e-mail ainda não exista.</p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAddMember}>
              Conceder acesso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

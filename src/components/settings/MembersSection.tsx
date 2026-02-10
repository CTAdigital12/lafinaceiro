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
import { Mail, UserPlus, Loader2, Trash2, CheckCircle, Users } from "lucide-react";
import { z } from "zod";

const emailSchema = z.string().email("E-mail inválido");

export function MembersSection() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [revokeAccessId, setRevokeAccessId] = useState<string | null>(null);

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

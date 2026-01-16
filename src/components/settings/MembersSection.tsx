import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useInvitations } from "@/hooks/useInvitations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { 
  Mail, 
  UserPlus, 
  Loader2, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  Clock,
  Users
} from "lucide-react";
import { z } from "zod";

const emailSchema = z.string().email("E-mail inválido");

export function MembersSection() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [deleteInvitationId, setDeleteInvitationId] = useState<string | null>(null);
  const [revokeAccessId, setRevokeAccessId] = useState<string | null>(null);
  
  const { 
    sentInvitations, 
    receivedInvitations, 
    members, 
    isLoading,
    createInvitation,
    acceptInvitation,
    rejectInvitation,
    deleteInvitation,
    revokeAccess,
  } = useInvitations();

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      emailSchema.parse(email);
    } catch {
      setError("E-mail inválido");
      return;
    }

    if (email === user?.email) {
      setError("Você não pode convidar a si mesmo");
      return;
    }

    createInvitation.mutate(email, {
      onSuccess: () => setEmail(""),
    });
  };

  const pendingInvitations = sentInvitations.filter((i) => i.status === "pending");

  return (
    <div className="space-y-6">
      {/* Received Invitations */}
      {receivedInvitations.length > 0 && (
        <div className="bg-balance/10 rounded-xl border border-balance/20 p-4">
          <h4 className="font-medium text-foreground mb-3 flex items-center gap-2">
            <Mail className="h-4 w-4 text-balance" />
            Convites recebidos
          </h4>
          <div className="space-y-3">
            {receivedInvitations.map((invitation) => (
              <div 
                key={invitation.id} 
                className="flex items-center justify-between bg-background rounded-lg p-3 border border-border"
              >
                <div>
                  <p className="font-medium text-foreground">Acesso compartilhado</p>
                  <p className="text-sm text-muted-foreground">Você foi convidado para acessar dados financeiros</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => rejectInvitation.mutate(invitation.id)}
                    disabled={rejectInvitation.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Recusar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => acceptInvitation.mutate(invitation.id)}
                    disabled={acceptInvitation.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Aceitar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Form */}
      <div>
        <h4 className="font-medium text-foreground mb-3">Convidar novo membro</h4>
        <form onSubmit={handleInvite} className="flex gap-3">
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
          <Button type="submit" disabled={createInvitation.isPending || !email}>
            {createInvitation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <UserPlus className="h-4 w-4 mr-2" />
                Convidar
              </>
            )}
          </Button>
        </form>
      </div>

      <Separator />

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <div>
          <h4 className="font-medium text-foreground mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Convites pendentes
          </h4>
          <div className="space-y-2">
            {pendingInvitations.map((invitation) => (
              <div 
                key={invitation.id} 
                className="flex items-center justify-between bg-muted/50 rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{invitation.invited_email}</p>
                    <p className="text-xs text-muted-foreground">
                      Enviado em {new Date(invitation.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-chart-4/10 text-chart-4">
                    Pendente
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-expense"
                    onClick={() => setDeleteInvitationId(invitation.id)}
                    disabled={deleteInvitation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
            <p className="text-xs text-muted-foreground">Convide pessoas para compartilhar seus dados financeiros</p>
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
                    <p className="text-xs text-muted-foreground">
                      {member.profiles?.email}
                    </p>
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

      {/* Delete Invitation Confirmation */}
      <AlertDialog open={!!deleteInvitationId} onOpenChange={(open) => !open && setDeleteInvitationId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar convite?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar este convite? A pessoa não poderá mais aceitar o convite.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteInvitationId) deleteInvitation.mutate(deleteInvitationId);
                setDeleteInvitationId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancelar Convite
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

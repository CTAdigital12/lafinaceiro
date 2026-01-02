import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface Invitation {
  id: string;
  owner_id: string;
  invited_email: string;
  invited_user_id: string | null;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  accepted_at: string | null;
}

export interface SharedAccess {
  id: string;
  owner_id: string;
  shared_with_user_id: string;
  created_at: string;
  profiles?: { full_name: string | null; email: string | null } | null;
}

export function useInvitations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch invitations sent by the user
  const { data: sentInvitations = [], isLoading: isLoadingInvitations } = useQuery({
    queryKey: ["invitations", "sent", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("*")
        .eq("owner_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Invitation[];
    },
    enabled: !!user,
  });

  // Fetch invitations received by the user
  const { data: receivedInvitations = [], isLoading: isLoadingReceived } = useQuery({
    queryKey: ["invitations", "received", user?.email],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("*")
        .eq("invited_email", user?.email)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Invitation[];
    },
    enabled: !!user?.email,
  });

  // Fetch shared access (members with access)
  const { data: members = [], isLoading: isLoadingMembers } = useQuery({
    queryKey: ["shared_access", user?.id],
    queryFn: async () => {
      // First get shared access records
      const { data: accessData, error: accessError } = await supabase
        .from("shared_access")
        .select("*")
        .eq("owner_id", user?.id)
        .order("created_at", { ascending: false });

      if (accessError) throw accessError;

      // Then fetch profile data for each shared user
      const membersWithProfiles = await Promise.all(
        accessData.map(async (access) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", access.shared_with_user_id)
            .maybeSingle();

          return {
            ...access,
            profiles: profile,
          } as SharedAccess;
        })
      );

      return membersWithProfiles;
    },
    enabled: !!user,
  });

  // Create invitation
  const createInvitation = useMutation({
    mutationFn: async (email: string) => {
      // Check if already invited
      const { data: existing } = await supabase
        .from("invitations")
        .select("id")
        .eq("owner_id", user?.id)
        .eq("invited_email", email)
        .eq("status", "pending")
        .maybeSingle();

      if (existing) {
        throw new Error("Este e-mail já foi convidado");
      }

      // Check if already has access
      const { data: existingAccess } = await supabase
        .from("shared_access")
        .select("id, profiles:shared_with_user_id (email)")
        .eq("owner_id", user?.id);

      const hasAccess = existingAccess?.some(
        (a: any) => a.profiles?.email === email
      );

      if (hasAccess) {
        throw new Error("Este usuário já tem acesso");
      }

      const { data, error } = await supabase
        .from("invitations")
        .insert([{ owner_id: user?.id, invited_email: email }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      toast({ title: "Convite enviado!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao enviar convite", description: error.message, variant: "destructive" });
    },
  });

  // Accept invitation
  const acceptInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      // Get invitation details
      const { data: invitation, error: fetchError } = await supabase
        .from("invitations")
        .select("*")
        .eq("id", invitationId)
        .single();

      if (fetchError) throw fetchError;

      // Update invitation status
      const { error: updateError } = await supabase
        .from("invitations")
        .update({ 
          status: "accepted", 
          invited_user_id: user?.id,
          accepted_at: new Date().toISOString() 
        })
        .eq("id", invitationId);

      if (updateError) throw updateError;

      // Create shared access
      const { error: accessError } = await supabase
        .from("shared_access")
        .insert([{ 
          owner_id: invitation.owner_id, 
          shared_with_user_id: user?.id 
        }]);

      if (accessError) throw accessError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      queryClient.invalidateQueries({ queryKey: ["shared_access"] });
      toast({ title: "Convite aceito!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao aceitar convite", description: error.message, variant: "destructive" });
    },
  });

  // Reject invitation
  const rejectInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase
        .from("invitations")
        .update({ status: "rejected" })
        .eq("id", invitationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      toast({ title: "Convite recusado" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao recusar convite", description: error.message, variant: "destructive" });
    },
  });

  // Delete invitation
  const deleteInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase
        .from("invitations")
        .delete()
        .eq("id", invitationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      toast({ title: "Convite cancelado" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao cancelar convite", description: error.message, variant: "destructive" });
    },
  });

  // Revoke access
  const revokeAccess = useMutation({
    mutationFn: async (accessId: string) => {
      const { error } = await supabase
        .from("shared_access")
        .delete()
        .eq("id", accessId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shared_access"] });
      toast({ title: "Acesso revogado" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao revogar acesso", description: error.message, variant: "destructive" });
    },
  });

  return {
    sentInvitations,
    receivedInvitations,
    members,
    isLoading: isLoadingInvitations || isLoadingMembers || isLoadingReceived,
    createInvitation,
    acceptInvitation,
    rejectInvitation,
    deleteInvitation,
    revokeAccess,
  };
}

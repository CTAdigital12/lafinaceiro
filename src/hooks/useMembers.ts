import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface SharedAccess {
  id: string;
  owner_id: string;
  shared_with_user_id: string;
  created_at: string;
  profiles?: { full_name: string | null; email: string | null } | null;
}

export function useMembers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["shared_access", user?.id],
    queryFn: async () => {
      const { data: accessData, error: accessError } = await supabase
        .from("shared_access")
        .select("*")
        .eq("owner_id", user?.id)
        .order("created_at", { ascending: false });

      if (accessError) throw accessError;

      const membersWithProfiles = await Promise.all(
        accessData.map(async (access) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", access.shared_with_user_id)
            .maybeSingle();

          return { ...access, profiles: profile } as SharedAccess;
        })
      );

      return membersWithProfiles;
    },
    enabled: !!user,
  });

  const addMember = useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.rpc("add_shared_access_by_email", {
        target_email: email,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shared_access"] });
      toast({ title: "Membro adicionado!" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao adicionar membro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

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
      toast({
        title: "Erro ao revogar acesso",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return { members, isLoading, addMember, revokeAccess };
}

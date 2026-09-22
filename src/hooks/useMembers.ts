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
      // `enabled: !!user` abaixo já impede rodar sem usuário, mas o tipo não
      // enxerga isso — e um `.eq("owner_id", undefined)` viraria filtro
      // inválido no PostgREST em vez de erro aqui.
      if (!user?.id) {
        throw new Error("Usuário não autenticado");
      }
      const { data: accessData, error: accessError } = await supabase
        .from("shared_access")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      if (accessError) throw accessError;

      if (accessData.length === 0) return [];

      // Uma consulta para todos os perfis, não uma por membro. O laço antigo
      // fazia N idas ao servidor e engolia o erro de cada uma em silêncio —
      // e como a policy nunca deixava ler nada (M4), ninguém percebeu.
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in(
          "id",
          accessData.map((access) => access.shared_with_user_id)
        );

      // Aqui o erro SOBE. Se a policy voltar a barrar a leitura, a tela mostra
      // "Erro ao carregar" em vez de uma lista de "Usuário" sem e-mail, que foi
      // exatamente o que escondeu o defeito por tanto tempo.
      if (profilesError) throw profilesError;

      const porId = new Map(profiles?.map((p) => [p.id, p]) ?? []);

      return accessData.map(
        (access) =>
          ({
            ...access,
            profiles: porId.get(access.shared_with_user_id) ?? null,
          }) as SharedAccess
      );
    },
    enabled: !!user,
  });

  // `addMember` foi removido junto com a RPC `add_shared_access_by_email`
  // (migration 20260818140000): ela era SECURITY DEFINER com EXECUTE para
  // PUBLIC, ignorava RLS e permitia conceder acesso permanente aos próprios
  // dados com um token AAL1 — anulando o portão de aal2 do A1. Nenhum
  // componente chamava isto; quem adiciona membro é a edge function
  // `add-member`, via MembersSection.

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

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["shared_access"] });

  return { members, isLoading, revokeAccess, refetch };
}

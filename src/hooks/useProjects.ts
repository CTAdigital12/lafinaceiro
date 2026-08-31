import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  target_amount: number;
  status: "active" | "completed" | "cancelled";
  icon: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
  spent_amount: number;
}

export function useProjects() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects", user?.id],
    queryFn: async () => {
      const { data: rawProjects, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!rawProjects || rawProjects.length === 0) return [];

      // Fetch all transactions linked to any project
      const projectIds = rawProjects.map((p) => p.id);
      const { data: txData, error: txError } = await supabase
        .from("transactions")
        .select("project_id, type, amount, is_refund, is_card_payment, is_provisional")
        .in("project_id", projectIds);

      if (txError) throw txError;

      // Calculate spent per project
      const spentByProject: Record<string, number> = {};
      for (const tx of txData || []) {
        if (!tx.project_id) continue;
        // Skip card payments and provisional
        if (tx.is_card_payment) continue;
        if (tx.is_provisional) continue;

        if (tx.type === "expense" && !tx.is_refund) {
          spentByProject[tx.project_id] = (spentByProject[tx.project_id] || 0) + Number(tx.amount);
        } else if (tx.is_refund) {
          // Refunds subtract from spent
          spentByProject[tx.project_id] = (spentByProject[tx.project_id] || 0) - Number(tx.amount);
        }
      }

      return rawProjects.map((p) => ({
        ...p,
        spent_amount: Math.max(0, spentByProject[p.id] || 0),
      })) as Project[];
    },
    enabled: !!user,
  });

  const createProject = useMutation({
    mutationFn: async (project: Pick<Project, "name" | "description" | "target_amount" | "icon" | "color">) => {
      if (!user?.id) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("projects")
        .insert([{ ...project, user_id: user.id }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Projeto criado com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar projeto", description: error.message, variant: "destructive" });
    },
  });

  const updateProject = useMutation({
    // `TablesUpdate<>` vem do schema gerado, então só aceita COLUNAS reais.
    // `Partial<Project>` aceitava também as relações do join e os campos
    // calculados no cliente, que iriam parar no `.update()` e o PostgREST
    // rejeitaria como coluna desconhecida. Nenhum chamador fazia isso — era
    // folga de tipo —, mas agora o compilador impede que passe a fazer.
    mutationFn: async ({ id, ...project }: TablesUpdate<"projects"> & { id: string }) => {
      const { data, error } = await supabase
        .from("projects")
        .update(project)
        .eq("id", id)
        .select()
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Projeto atualizado!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar projeto", description: error.message, variant: "destructive" });
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Projeto excluído!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir projeto", description: error.message, variant: "destructive" });
    },
  });

  const linkTransactions = useMutation({
    mutationFn: async ({ projectId, transactionIds }: { projectId: string; transactionIds: string[] }) => {
      const { error } = await supabase
        .from("transactions")
        .update({ project_id: projectId })
        .in("id", transactionIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Despesas vinculadas ao projeto!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao vincular despesas", description: error.message, variant: "destructive" });
    },
  });

  const unlinkTransaction = useMutation({
    mutationFn: async (transactionId: string) => {
      const { error } = await supabase
        .from("transactions")
        .update({ project_id: null })
        .eq("id", transactionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  const activeProjects = projects.filter(p => p.status === "active");

  return {
    projects,
    activeProjects,
    isLoading,
    createProject,
    updateProject,
    deleteProject,
    linkTransactions,
    unlinkTransaction,
  };
}

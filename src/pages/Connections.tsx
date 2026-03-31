import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, RefreshCw, Link2, CreditCard, Wallet } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

declare global {
  interface Window {
    PluggyConnect?: any;
  }
}

export default function Connections() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);

  // Fetch pluggy_items
  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["pluggy_items", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pluggy_items")
        .select("*, accounts(name, type, icon), credit_cards(name, last_digits, brand)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Create connect token and open widget
  const connectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("pluggy-connect", {
        body: { action: "create_connect_token" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.accessToken;
    },
    onSuccess: (accessToken: string) => {
      openPluggyWidget(accessToken);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao conectar",
        description: error.message,
        variant: "destructive",
      });
      setIsConnecting(false);
    },
  });

  // Save item after widget success
  const saveItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { data, error } = await supabase.functions.invoke("pluggy-connect", {
        body: { action: "save_item", itemId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pluggy_items"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["credit-cards"] });
      toast({
        title: "Conta conectada!",
        description: `${data.items?.length || 0} conta(s) sincronizada(s) com sucesso.`,
      });
      setIsConnecting(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar conexão",
        description: error.message,
        variant: "destructive",
      });
      setIsConnecting(false);
    },
  });

  // Delete connection
  const deleteMutation = useMutation({
    mutationFn: async (pluggyItemId: string) => {
      const { data, error } = await supabase.functions.invoke("pluggy-connect", {
        body: { action: "delete_item", itemId: pluggyItemId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pluggy_items"] });
      toast({ title: "Conexão removida!" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao remover",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function openPluggyWidget(accessToken: string) {
    // Load Pluggy Connect SDK dynamically
    const existingScript = document.getElementById("pluggy-connect-script");
    if (existingScript) {
      launchWidget(accessToken);
      return;
    }

    const script = document.createElement("script");
    script.id = "pluggy-connect-script";
    script.src = "https://cdn.pluggy.ai/pluggy-connect/v2.pluggy-connect.js";
    script.onload = () => launchWidget(accessToken);
    script.onerror = () => {
      toast({
        title: "Erro ao carregar widget",
        description: "Não foi possível carregar o Pluggy Connect.",
        variant: "destructive",
      });
      setIsConnecting(false);
    };
    document.body.appendChild(script);
  }

  function launchWidget(accessToken: string) {
    if (!window.PluggyConnect) {
      toast({
        title: "Widget não disponível",
        description: "Recarregue a página e tente novamente.",
        variant: "destructive",
      });
      setIsConnecting(false);
      return;
    }

    const pluggyConnect = new window.PluggyConnect({
      connectToken: accessToken,
      onSuccess: (data: { item: { id: string } }) => {
        console.log("Pluggy success:", data);
        saveItemMutation.mutate(data.item.id);
      },
      onError: (error: any) => {
        console.error("Pluggy error:", error);
        toast({
          title: "Erro na conexão",
          description: "Não foi possível conectar a conta bancária.",
          variant: "destructive",
        });
        setIsConnecting(false);
      },
      onClose: () => {
        setIsConnecting(false);
      },
    });

    pluggyConnect.init();
  }

  function handleConnect() {
    setIsConnecting(true);
    connectMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conexões Bancárias</h1>
          <p className="text-muted-foreground">
            Conecte suas contas bancárias para sincronizar automaticamente.
          </p>
        </div>
        <Button onClick={handleConnect} disabled={isConnecting}>
          {isConnecting ? (
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Conectar Conta
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : connections.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Link2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma conta conectada</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
              Conecte suas contas bancárias e cartões de crédito para importar transações
              automaticamente via Open Finance.
            </p>
            <Button onClick={handleConnect} disabled={isConnecting}>
              <Plus className="h-4 w-4 mr-2" />
              Conectar Primeira Conta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {connections.map((conn: any) => {
            const linkedAccount = conn.accounts;
            const linkedCard = conn.credit_cards;
            const isCard = !!linkedCard;

            return (
              <Card key={conn.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {conn.connector_logo ? (
                        <img
                          src={conn.connector_logo}
                          alt={conn.connector_name}
                          className="h-10 w-10 rounded-lg object-contain bg-muted p-1"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                          {isCard ? (
                            <CreditCard className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <Wallet className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      )}
                      <div>
                        <CardTitle className="text-base">
                          {conn.connector_name || "Conexão Bancária"}
                        </CardTitle>
                        <CardDescription>
                          {isCard
                            ? `Cartão •••• ${linkedCard?.last_digits || ""}`
                            : linkedAccount?.name || "Conta"}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge
                      variant={conn.status === "UPDATED" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {conn.status === "UPDATED" ? "Ativo" : conn.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {conn.last_sync_at
                        ? `Última sincronização: ${formatDistanceToNow(
                            new Date(conn.last_sync_at),
                            { addSuffix: true, locale: ptBR }
                          )}`
                        : "Nunca sincronizado"}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(conn.pluggy_item_id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

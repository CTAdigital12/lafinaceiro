import { useState } from "react";
import { Layers, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logError, getSafeErrorMessage } from "@/lib/errorHandler";

interface GroupSummary {
  baseDescription: string;
  amount: number;
  totalInstallments: number;
  foundInstallments: number;
}

interface MigrationResult {
  success: boolean;
  dryRun: boolean;
  summary: {
    totalCandidates: number;
    groupsFound: number;
    transactionsUpdated: number;
  };
  groups: GroupSummary[];
}

export function InstallmentMigration() {
  const [isLoading, setIsLoading] = useState(false);
  const [previewData, setPreviewData] = useState<MigrationResult | null>(null);
  const [migrationComplete, setMigrationComplete] = useState(false);
  const { toast } = useToast();

  const handlePreview = async () => {
    setIsLoading(true);
    setPreviewData(null);
    setMigrationComplete(false);

    try {
      const { data, error } = await supabase.functions.invoke('migrate-installments', {
        body: { dryRun: true },
      });

      if (error) throw error;

      setPreviewData(data as MigrationResult);
    } catch (error) {
      logError(error, "InstallmentMigration.preview");
      toast({
        title: "Erro ao analisar parcelas",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMigrate = async () => {
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('migrate-installments', {
        body: { dryRun: false },
      });

      if (error) throw error;

      const result = data as MigrationResult;
      setMigrationComplete(true);
      setPreviewData(result);

      toast({
        title: "Migração concluída!",
        description: `${result.summary.transactionsUpdated} transações foram agrupadas em ${result.summary.groupsFound} grupos de parcelas.`,
      });
    } catch (error) {
      logError(error, "InstallmentMigration.migrate");
      toast({
        title: "Erro na migração",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Layers className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-foreground">Migrar Parcelas Existentes</p>
          <p className="text-sm text-muted-foreground">
            Agrupa automaticamente transações parceladas que foram importadas antes do sistema de agrupamento.
            Identifica parcelas pelo padrão "X/Y" na descrição, mesmo cartão e mesmo valor.
          </p>
        </div>
      </div>

      {!previewData && !isLoading && (
        <Button onClick={handlePreview} variant="outline" className="w-full">
          Analisar Parcelas Não Agrupadas
        </Button>
      )}

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Analisando transações...</span>
        </div>
      )}

      {previewData && !migrationComplete && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-foreground">{previewData.summary.groupsFound}</p>
                <p className="text-xs text-muted-foreground">Grupos identificados</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{previewData.summary.totalCandidates}</p>
                <p className="text-xs text-muted-foreground">Transações a agrupar</p>
              </div>
            </div>
          </div>

          {previewData.groups.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Grupos encontrados:</p>
              {previewData.groups.slice(0, 10).map((group, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm p-2 rounded bg-muted/30">
                  <span className="truncate flex-1 font-medium">{group.baseDescription}</span>
                  <span className="text-muted-foreground shrink-0 ml-2">
                    {group.foundInstallments}/{group.totalInstallments} parcelas • R$ {group.amount.toFixed(2)}
                  </span>
                </div>
              ))}
              {previewData.groups.length > 10 && (
                <p className="text-xs text-muted-foreground text-center">
                  E mais {previewData.groups.length - 10} grupos...
                </p>
              )}
            </div>
          )}

          {previewData.groups.length === 0 ? (
            <div className="flex items-center gap-2 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span>Nenhuma parcela não agrupada encontrada!</span>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button onClick={handleMigrate} className="flex-1" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Migrando...
                  </>
                ) : (
                  <>Agrupar {previewData.groups.length} Grupos</>
                )}
              </Button>
              <Button onClick={() => setPreviewData(null)} variant="outline">
                Cancelar
              </Button>
            </div>
          )}
        </div>
      )}

      {migrationComplete && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-600">
          <CheckCircle2 className="h-5 w-5" />
          <span>
            Migração concluída! {previewData?.summary.transactionsUpdated} transações agrupadas.
          </span>
        </div>
      )}
    </div>
  );
}

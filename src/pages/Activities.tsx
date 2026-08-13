import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Clock, 
  CreditCard, 
  Wallet, 
  Trash2, 
  AlertCircle,
  FileSpreadsheet,
  Loader2 
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useActivities, Activity } from "@/hooks/useActivities";
import { cn } from "@/lib/utils";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { useListSearchSort } from "@/hooks/useListSearchSort";
import { ListSearchInput } from "@/components/ui/list-search-input";
import { ListSortButtons } from "@/components/ui/list-sort-buttons";
import { formatDateBR } from "@/lib/dateUtils";

export default function Activities() {
  const formatCurrency = useFormatCurrency();
  const { activities, isLoading, undoActivity, isUndoing } = useActivities();
  const [activityToUndo, setActivityToUndo] = useState<Activity | null>(null);

  const { query, setQuery, sort, toggleSort, items: filteredActivities } = useListSearchSort(activities, {
    searchAccessors: [
      (a) => a.source_name,
      (a) => (a.source_type === "credit_card" ? "fatura cartão" : "extrato conta"),
    ],
    sortAccessors: {
      imported_at: (a) => new Date(a.imported_at),
      amount: (a) => Number(a.total_amount),
      count: (a) => Number(a.transaction_count),
      name: (a) => a.source_name ?? "",
    },
    initialSort: { field: "imported_at", direction: "desc" },
  });

  const handleUndo = () => {
    if (activityToUndo) {
      undoActivity(activityToUndo.imported_at);
      setActivityToUndo(null);
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  const formatDateRange = (firstDate: string, lastDate: string) => {
    const first = formatDateBR(firstDate);
    const last = formatDateBR(lastDate);
    return first === last ? first : `${first} - ${last}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold">Atividades</h1>
          <p className="text-muted-foreground">Histórico de importações</p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Atividades</h1>
        <p className="text-muted-foreground">
          Histórico de importações de faturas e extratos
        </p>
      </div>

      {activities.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-4" />
            <CardTitle className="text-lg mb-2">Nenhuma importação encontrada</CardTitle>
            <CardDescription>
              Quando você importar faturas ou extratos, eles aparecerão aqui.
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <ListSearchInput
              value={query}
              onChange={setQuery}
              placeholder="Buscar por conta ou cartão..."
              className="sm:max-w-xs"
            />
            <ListSortButtons
              options={[
                { key: "imported_at", label: "Data" },
                { key: "amount", label: "Valor" },
                { key: "count", label: "Nº transações" },
                { key: "name", label: "Origem" },
              ]}
              activeField={sort.field}
              direction={sort.direction}
              onSort={toggleSort}
              className="sm:ml-auto"
            />
          </div>
          {filteredActivities.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhuma importação corresponde à busca.</p>
          ) : (
            filteredActivities.map((activity) => (
            <Card 
              key={activity.imported_at} 
              className="overflow-hidden hover:border-primary/30 transition-colors"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  {/* Icon and Info */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div 
                      className={cn(
                        "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
                        activity.source_type === "credit_card"
                          ? "bg-primary/10"
                          : "bg-income/10"
                      )}
                    >
                      {activity.source_type === "credit_card" ? (
                        <CreditCard className="h-5 w-5 text-primary" />
                      ) : (
                        <Wallet className="h-5 w-5 text-income" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium truncate">
                          {activity.source_type === "credit_card" 
                            ? "Importação de Fatura" 
                            : "Importação de Extrato"}
                        </h3>
                        <Badge variant="outline" className="flex-shrink-0">
                          {activity.source_name}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{formatDateTime(activity.imported_at)}</span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm">
                        <span className="font-medium">
                          {activity.transaction_count} transações
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <span className="font-medium text-expense">
                          {formatCurrency(activity.total_amount)}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground">
                          {formatDateRange(activity.first_date, activity.last_date)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Undo Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                    onClick={() => setActivityToUndo(activity)}
                    disabled={isUndoing}
                  >
                    {isUndoing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
            ))
          )}
        </div>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={!!activityToUndo} onOpenChange={(open) => !open && setActivityToUndo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Desfazer importação?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá remover permanentemente{" "}
              <strong>{activityToUndo?.transaction_count} transações</strong> no valor total de{" "}
              <strong>{activityToUndo && formatCurrency(activityToUndo.total_amount)}</strong>.
              <br /><br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUndo}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sim, desfazer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

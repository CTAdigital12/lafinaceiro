import { useState } from "react";
import { Plus, RefreshCw, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { InvestmentSummaryCards } from "@/components/investments/InvestmentSummaryCards";
import { AllocationChart } from "@/components/investments/AllocationChart";
import { AssetTable } from "@/components/investments/AssetTable";
import { TransactionHistory } from "@/components/investments/TransactionHistory";
import { OperationModal } from "@/components/investments/OperationModal";
import { UpdatePricesModal } from "@/components/investments/UpdatePricesModal";
import { AssetModal } from "@/components/investments/AssetModal";
import { InstitutionsList } from "@/components/investments/InstitutionsList";
import { useInvestments, InvestmentTransaction } from "@/hooks/useInvestments";
import { useInstitutions } from "@/hooks/useInstitutions";
import type { NovaOperacao, InvestmentAsset, AssetType } from "@/hooks/useInvestments";
import type { AssetModalFormData } from "@/components/investments/AssetModal";

export default function Investments() {
  const [operationModalOpen, setOperationModalOpen] = useState(false);
  const [pricesModalOpen, setPricesModalOpen] = useState(false);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<InvestmentAsset | null>(null);
  const [editingOperation, setEditingOperation] = useState<InvestmentTransaction | null>(null);
  const [deletingOperation, setDeletingOperation] = useState<InvestmentTransaction | null>(null);

  const {
    assets,
    transactions,
    isLoading,
    totalPatrimony,
    totalApplied,
    totalResult,
    resultPercentage,
    assetsByType,
    allocationData,
    createAsset,
    updateAsset,
    deleteAsset,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    updatePrices,
  } = useInvestments();

  const {
    institutions,
    createInstitution,
    updateInstitution,
    deleteInstitution,
  } = useInstitutions();

  const handleEditAsset = (asset: InvestmentAsset) => {
    setEditingAsset(asset);
    setAssetModalOpen(true);
  };

  const handleAssetModalClose = (open: boolean) => {
    setAssetModalOpen(open);
    if (!open) setEditingAsset(null);
  };

  const handleOperationModalClose = (open: boolean) => {
    setOperationModalOpen(open);
    if (!open) setEditingOperation(null);
  };

  const handleEditOperation = (tx: InvestmentTransaction) => {
    setEditingOperation(tx);
    setOperationModalOpen(true);
  };

  const handleOperationSubmit = (data: NovaOperacao) => {
    if (editingOperation) {
      updateTransaction.mutate({ id: editingOperation.id, ...data });
    } else {
      createTransaction.mutate(data);
    }
  };

  const handleConfirmDelete = () => {
    if (!deletingOperation) return;
    deleteTransaction.mutate(deletingOperation.id);
    setDeletingOperation(null);
  };

  const handleAssetSubmit = (data: AssetModalFormData) => {
    const { 
      calculated_quantity, 
      calculated_average_price, 
      initial_quantity, 
      initial_value, 
      applied_value,
      pricing_method,
      current_balance,
      liquidity,
      ...assetData 
    } = data;
    
    // `asset_type` chega como `string`: o formulário aceita "" enquanto o
    // select está vazio, e a COLUNA no banco é `text` — a união de
    // `InvestmentAsset` é convenção que o app mantém, não algo que o banco
    // garante. A escolha vem de `ASSET_TYPE_LABELS`, então em runtime o valor
    // é sempre um `AssetType`.
    const tipo = assetData.asset_type as AssetType;

    if (editingAsset) {
      updateAsset.mutate({ 
        id: editingAsset.id, 
        ...assetData,
        asset_type: tipo,
        quantity: calculated_quantity ?? editingAsset.quantity,
        average_price: calculated_average_price ?? editingAsset.average_price,
        pricing_method: pricing_method ?? editingAsset.pricing_method,
        current_balance: current_balance ?? editingAsset.current_balance,
        liquidity: liquidity ?? editingAsset.liquidity,
      });
    } else {
      createAsset.mutate({
        ...assetData,
        asset_type: tipo,
        quantity: calculated_quantity || 0,
        average_price: calculated_average_price || 0,
        pricing_method: pricing_method || "unit_price",
        current_balance: current_balance || 0,
        liquidity: liquidity || null,
      });
    }
    setEditingAsset(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Investimentos</h1>
          <p className="text-muted-foreground">
            Acompanhe seu patrimônio acumulado
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="icon"
            className="md:hidden"
            onClick={() => setAssetModalOpen(true)}
          >
            <Package className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="hidden md:flex"
            onClick={() => setAssetModalOpen(true)}
          >
            <Package className="h-4 w-4 mr-2" />
            Novo Ativo
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="md:hidden"
            onClick={() => setPricesModalOpen(true)}
            disabled={assets.length === 0}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="hidden md:flex"
            onClick={() => setPricesModalOpen(true)}
            disabled={assets.length === 0}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar Cotações
          </Button>
          <Button size="icon" className="md:hidden" onClick={() => setOperationModalOpen(true)}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button className="hidden md:flex" onClick={() => setOperationModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Operação
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <InvestmentSummaryCards
        totalPatrimony={totalPatrimony}
        totalApplied={totalApplied}
        totalResult={totalResult}
        resultPercentage={resultPercentage}
      />

      {/* Charts and Table */}
      <div className="grid gap-6 lg:grid-cols-4">
        <div className="lg:col-span-1 space-y-6">
          <AllocationChart data={allocationData} />
          <InstitutionsList
            institutions={institutions}
            onCreateInstitution={(data) => createInstitution.mutate(data)}
            onUpdateInstitution={(data) => updateInstitution.mutate(data)}
            onDeleteInstitution={(id) => deleteInstitution.mutate(id)}
          />
        </div>
        <div className="lg:col-span-3">
          <AssetTable
            assetsByType={assetsByType}
            institutions={institutions}
            onEditAsset={handleEditAsset}
            onDeleteAsset={(id) => deleteAsset.mutate(id)}
          />
        </div>
      </div>

      {/* Transaction History */}
      <TransactionHistory
        transactions={transactions}
        onEdit={handleEditOperation}
        onDelete={setDeletingOperation}
      />

      {/* Modals */}
      <OperationModal
        open={operationModalOpen}
        onOpenChange={handleOperationModalClose}
        assets={assets}
        operation={editingOperation}
        onSubmit={handleOperationSubmit}
        onCreateAsset={async (data) => {
          // A linha volta do banco com `asset_type: string` (coluna `text`);
          // o app trata como `AssetType`. Mesma convenção da nota acima.
          const result = await createAsset.mutateAsync(data);
          return result as InvestmentAsset;
        }}
      />

      <AlertDialog
        open={!!deletingOperation}
        onOpenChange={(open) => !open && setDeletingOperation(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Operação</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta operação? O ativo será revertido ao
              estado anterior e, se houver, a transação vinculada na conta corrente
              também será removida. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UpdatePricesModal
        open={pricesModalOpen}
        onOpenChange={setPricesModalOpen}
        assets={assets}
        onSubmit={(updates) => updatePrices.mutate(updates)}
      />

      <AssetModal
        open={assetModalOpen}
        onOpenChange={handleAssetModalClose}
        asset={editingAsset}
        institutions={institutions}
        onSubmit={handleAssetSubmit}
      />
    </div>
  );
}

import { useState } from "react";
import { Plus, RefreshCw, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvestmentSummaryCards } from "@/components/investments/InvestmentSummaryCards";
import { AllocationChart } from "@/components/investments/AllocationChart";
import { AssetTable } from "@/components/investments/AssetTable";
import { TransactionHistory } from "@/components/investments/TransactionHistory";
import { OperationModal } from "@/components/investments/OperationModal";
import { UpdatePricesModal } from "@/components/investments/UpdatePricesModal";
import { AssetModal } from "@/components/investments/AssetModal";
import { InstitutionsList } from "@/components/investments/InstitutionsList";
import { useInvestments } from "@/hooks/useInvestments";
import { useInstitutions } from "@/hooks/useInstitutions";

export default function Investments() {
  const [operationModalOpen, setOperationModalOpen] = useState(false);
  const [pricesModalOpen, setPricesModalOpen] = useState(false);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<any>(null);

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
    updatePrices,
  } = useInvestments();

  const {
    institutions,
    createInstitution,
    updateInstitution,
    deleteInstitution,
  } = useInstitutions();

  const handleEditAsset = (asset: any) => {
    setEditingAsset(asset);
    setAssetModalOpen(true);
  };

  const handleAssetModalClose = (open: boolean) => {
    setAssetModalOpen(open);
    if (!open) setEditingAsset(null);
  };

  const handleAssetSubmit = (data: any) => {
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
    
    if (editingAsset) {
      updateAsset.mutate({ 
        id: editingAsset.id, 
        ...assetData,
        quantity: calculated_quantity ?? editingAsset.quantity,
        average_price: calculated_average_price ?? editingAsset.average_price,
        pricing_method: pricing_method ?? editingAsset.pricing_method,
        current_balance: current_balance ?? editingAsset.current_balance,
        liquidity: liquidity ?? editingAsset.liquidity,
      });
    } else {
      createAsset.mutate({
        ...assetData,
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
            onClick={() => setAssetModalOpen(true)}
          >
            <Package className="h-4 w-4 mr-2" />
            Novo Ativo
          </Button>
          <Button
            variant="outline"
            onClick={() => setPricesModalOpen(true)}
            disabled={assets.length === 0}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar Cotações
          </Button>
          <Button onClick={() => setOperationModalOpen(true)}>
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
      <TransactionHistory transactions={transactions} />

      {/* Modals */}
      <OperationModal
        open={operationModalOpen}
        onOpenChange={setOperationModalOpen}
        assets={assets}
        onSubmit={(data) => createTransaction.mutate(data)}
        onCreateAsset={async (data) => {
          const result = await createAsset.mutateAsync(data);
          return result;
        }}
      />

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

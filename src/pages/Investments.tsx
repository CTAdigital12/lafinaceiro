import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvestmentSummaryCards } from "@/components/investments/InvestmentSummaryCards";
import { AllocationChart } from "@/components/investments/AllocationChart";
import { AssetTable } from "@/components/investments/AssetTable";
import { TransactionHistory } from "@/components/investments/TransactionHistory";
import { OperationModal } from "@/components/investments/OperationModal";
import { UpdatePricesModal } from "@/components/investments/UpdatePricesModal";
import { useInvestments } from "@/hooks/useInvestments";

export default function Investments() {
  const [operationModalOpen, setOperationModalOpen] = useState(false);
  const [pricesModalOpen, setPricesModalOpen] = useState(false);

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
    deleteAsset,
    createTransaction,
    updatePrices,
  } = useInvestments();

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
        <div className="flex gap-2">
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
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <AllocationChart data={allocationData} />
        </div>
        <div className="lg:col-span-2">
          <AssetTable
            assetsByType={assetsByType}
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
    </div>
  );
}

import { useState } from "react";
import { Plus, Building2, Wallet, PiggyBank, TrendingUp, MoreVertical, Loader2, Upload } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAccounts, Account } from "@/hooks/useAccounts";
import { AccountModal } from "@/components/modals/AccountModal";
import { AccountImportModal, AccountImportedItem } from "@/components/modals/AccountImportModal";
import { AccountReviewModal } from "@/components/modals/AccountReviewModal";

const iconComponents = {
  bank: Building2,
  wallet: Wallet,
  savings: PiggyBank,
  investment: TrendingUp,
};

const typeLabels = {
  bank: "Conta Corrente",
  wallet: "Carteira",
  savings: "Poupança",
  investment: "Investimentos",
};

interface AccountCardProps {
  account: Account;
  onEdit: (account: Account) => void;
  onDelete: (id: string) => void;
  onImport: (account: Account) => void;
}

function AccountCard({ account, onEdit, onDelete, onImport }: AccountCardProps) {
  const Icon = iconComponents[account.type] || Building2;

  return (
    <div className="bg-card rounded-xl border border-border shadow-card hover:shadow-card-hover transition-all duration-300 overflow-hidden animate-scale-in">
      {/* Card Header with Gradient */}
      <div className={cn("bg-gradient-to-r p-4", account.color)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center">
              <span className="text-xl">{account.icon}</span>
            </div>
            <div>
              <h3 className="font-semibold text-white">{account.name}</h3>
              <p className="text-xs text-white/80">{typeLabels[account.type]}</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onImport(account)}>
                <Upload className="h-4 w-4 mr-2" />
                Importar Extrato
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(account)}>Editar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(account.id)} className="text-expense">
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 space-y-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Saldo Atual</p>
          <p className={cn("text-xl font-bold", Number(account.current_balance) >= 0 ? "text-foreground" : "text-expense")}>
            R$ {Number(account.current_balance).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2"
          onClick={() => onImport(account)}
        >
          <Upload className="h-4 w-4" />
          Importar Extrato
        </Button>
      </div>
    </div>
  );
}

export default function Accounts() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [importingAccount, setImportingAccount] = useState<Account | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [importedItems, setImportedItems] = useState<AccountImportedItem[]>([]);
  const [importBankBalance, setImportBankBalance] = useState<number | null>(null);
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);
  const { accounts, isLoading, totalBalance, deleteAccount } = useAccounts();

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setIsModalOpen(true);
  };

  const handleModalClose = (open: boolean) => {
    setIsModalOpen(open);
    if (!open) {
      setEditingAccount(null);
    }
  };

  const handleImport = (account: Account) => {
    setImportingAccount(account);
    setIsImportModalOpen(true);
  };

  const handleImportComplete = (items: AccountImportedItem[]) => {
    setImportedItems(items);
    setIsImportModalOpen(false);
    setIsReviewModalOpen(true);
  };

  const handleReviewClose = (open: boolean) => {
    setIsReviewModalOpen(open);
    if (!open) {
      setImportedItems([]);
      setImportingAccount(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-balance" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contas</h1>
          <p className="text-muted-foreground">Gerencie suas contas bancárias e carteiras</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          Nova Conta
        </Button>
      </div>

      {/* Total Balance Card */}
      <div className="bg-card rounded-xl border border-border p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Saldo Total</p>
            <p className="text-3xl font-bold text-foreground">
              R$ {totalBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="h-12 w-12 rounded-xl gradient-balance flex items-center justify-center">
            <Wallet className="h-6 w-6 text-balance-foreground" />
          </div>
        </div>
      </div>

      {/* Accounts Grid */}
      {accounts.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center shadow-card">
          <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma conta cadastrada</h3>
          <p className="text-muted-foreground mb-4">Adicione sua primeira conta para começar</p>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Conta
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <AccountCard 
              key={account.id} 
              account={account} 
              onEdit={handleEdit}
              onDelete={(id) => setDeleteAccountId(id)}
              onImport={handleImport}
            />
          ))}
        </div>
      )}

      <AccountModal 
        open={isModalOpen} 
        onOpenChange={handleModalClose} 
        account={editingAccount}
      />

      {importingAccount && (
        <>
          <AccountImportModal
            open={isImportModalOpen}
            onOpenChange={setIsImportModalOpen}
            accountId={importingAccount.id}
            accountName={importingAccount.name}
            onImportComplete={handleImportComplete}
          />

          <AccountReviewModal
            open={isReviewModalOpen}
            onOpenChange={handleReviewClose}
            items={importedItems}
            accountId={importingAccount.id}
            accountName={importingAccount.name}
          />
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteAccountId} onOpenChange={(open) => !open && setDeleteAccountId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta conta? Todas as transações associadas permanecerão, mas ficarão sem conta vinculada. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteAccountId) deleteAccount.mutate(deleteAccountId);
                setDeleteAccountId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

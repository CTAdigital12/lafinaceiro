/**
 * Tipos centralizados do domínio financeiro
 * 
 * Este arquivo centraliza interfaces que são usadas em múltiplos lugares,
 * evitando duplicação e garantindo consistência.
 */

import { Database } from "@/integrations/supabase/types";

// ============= Alias para tipos do Supabase =============

export type DbTransaction = Database["public"]["Tables"]["transactions"]["Row"];
export type DbCreditCard = Database["public"]["Tables"]["credit_cards"]["Row"];
export type DbCategory = Database["public"]["Tables"]["categories"]["Row"];
export type DbAccount = Database["public"]["Tables"]["accounts"]["Row"];
export type DbBudget = Database["public"]["Tables"]["budgets"]["Row"];
export type DbInvestmentAsset = Database["public"]["Tables"]["investment_assets"]["Row"];
export type DbInvestmentTransaction = Database["public"]["Tables"]["investment_transactions"]["Row"];

// ============= Status de Reembolso =============

export type ReimbursementStatus = "pending" | "requested" | "reimbursed";

export const REIMBURSEMENT_STATUS_CONFIG: Record<ReimbursementStatus, { 
  label: string; 
  className: string;
}> = {
  pending: { label: "Pendente", className: "bg-chart-4/10 text-chart-4 border-chart-4/20" },
  requested: { label: "Solicitado", className: "bg-primary/10 text-primary border-primary/20" },
  reimbursed: { label: "Reembolsado", className: "bg-income/10 text-income border-income/20" },
};

// ============= Tipos para Recharts (elimina uso de any) =============

export interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ 
    value: number; 
    name: string; 
    dataKey?: string;
    color?: string;
    payload: Record<string, unknown>;
  }>;
  label?: string;
}

// ============= Tipos de Categoria com Relações =============

export interface CategoryWithParent extends DbCategory {
  parentCategory?: Pick<DbCategory, "id" | "name" | "icon" | "color"> | null;
  fullName?: string;
}

// ============= Tipos de Transação com Relações =============

export interface TransactionWithRelations extends DbTransaction {
  categories?: Pick<DbCategory, "id" | "name" | "icon" | "color"> | null;
  accounts?: Pick<DbAccount, "name"> | null;
  credit_cards?: Pick<DbCreditCard, "id" | "name" | "last_digits" | "color"> | null;
}

// ============= Tipos de Ciclos de Fatura =============

export type InvoiceCycleStatus = "open" | "closed" | "paid";

export interface InvoiceCycle {
  id: string;
  user_id: string;
  credit_card_id: string;
  month: number;
  year: number;
  status: InvoiceCycleStatus;
  closed_amount: number | null;
  due_date: string | null;
  closing_date: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

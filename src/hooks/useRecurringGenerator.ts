import { useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTransactions } from "./useTransactions";

export function useRecurringGenerator(month: number, year: number) {
  const { user } = useAuth();
  const { createTransaction } = useTransactions(month, year);
  const generatingRef = useRef(false);

  // Fetch active rules
  const { data: rules = [] } = useQuery({
    queryKey: ["recurring_rules_active", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_rules")
        .select("*")
        .eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const generateProvisionalTransactions = useCallback(async () => {
    if (!user?.id || rules.length === 0 || generatingRef.current) return;

    generatingRef.current = true;

    try {
      // Check which rules already have transactions for this month
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0).toISOString().split("T")[0];

      const { data: existingTransactions, error } = await supabase
        .from("transactions")
        .select("recurring_rule_id")
        .not("recurring_rule_id", "is", null)
        .gte("date", startDate)
        .lte("date", endDate);

      if (error) {
        console.error("Error checking existing provisional transactions:", error);
        return;
      }

      const existingRuleIds = new Set(
        (existingTransactions || []).map((t) => t.recurring_rule_id)
      );

      // Generate missing provisional transactions
      const missingRules = rules.filter((r) => !existingRuleIds.has(r.id));

      for (const rule of missingRules) {
        // Adjust day_of_month to last day of month if needed
        const lastDayOfMonth = new Date(year, month, 0).getDate();
        const day = Math.min(rule.day_of_month, lastDayOfMonth);
        const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

        await createTransaction.mutateAsync({
          description: rule.description,
          amount: rule.estimated_amount,
          type: rule.type as "income" | "expense",
          date,
          due_date: rule.credit_card_id ? date : null,
          category_id: rule.category_id,
          account_id: rule.account_id,
          credit_card_id: rule.credit_card_id,
          status: "pending",
          is_provisional: true,
          recurring_rule_id: rule.id,
          is_corporate_expense: false,
          is_refund: false,
          is_reimbursable: false,
          is_card_payment: false,
          refunded_transaction_id: null,
          installment_group_id: null,
          installment_number: null,
          total_installments: null,
          silent: true,
          skipInvoiceCheck: true,
        });
      }
    } catch (err) {
      console.error("Error generating provisional transactions:", err);
    } finally {
      generatingRef.current = false;
    }
  }, [user?.id, rules, month, year, createTransaction]);

  return { generateProvisionalTransactions, rulesCount: rules.length };
}

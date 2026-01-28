import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useCallback } from "react";

export type InvoiceStatus = "open" | "closed" | "paid";

export interface InvoiceCycle {
  id: string;
  user_id: string;
  credit_card_id: string;
  month: number;
  year: number;
  status: InvoiceStatus;
  closed_amount: number | null;
  due_date: string | null;
  closing_date: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UseInvoiceCyclesOptions {
  creditCardId?: string;
  month?: number;
  year?: number;
}

export function useInvoiceCycles(options: UseInvoiceCyclesOptions = {}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { creditCardId, month, year } = options;

  // Query invoice cycles for a specific card or all cards
  const { data: invoiceCycles = [], isLoading } = useQuery({
    queryKey: ["invoice-cycles", user?.id, creditCardId, month, year],
    queryFn: async () => {
      let query = supabase
        .from("credit_card_invoices")
        .select("*");

      if (creditCardId) {
        query = query.eq("credit_card_id", creditCardId);
      }

      if (month && year) {
        query = query.eq("month", month).eq("year", year);
      }

      const { data, error } = await query.order("year", { ascending: false }).order("month", { ascending: false });

      if (error) throw error;
      return data as InvoiceCycle[];
    },
    enabled: !!user,
  });

  // Get status for a specific card/month/year
  const getInvoiceStatus = useCallback(
    (cardId: string, m: number, y: number): InvoiceStatus => {
      const cycle = invoiceCycles.find(
        (c) => c.credit_card_id === cardId && c.month === m && c.year === y
      );
      return cycle?.status || "open";
    },
    [invoiceCycles]
  );

  // Check if a specific invoice is closed
  const isInvoiceClosed = useCallback(
    (cardId: string, m: number, y: number): boolean => {
      return getInvoiceStatus(cardId, m, y) === "closed";
    },
    [getInvoiceStatus]
  );

  // Get invoice cycle record
  const getInvoiceCycle = useCallback(
    (cardId: string, m: number, y: number): InvoiceCycle | undefined => {
      return invoiceCycles.find(
        (c) => c.credit_card_id === cardId && c.month === m && c.year === y
      );
    },
    [invoiceCycles]
  );

  // Close invoice mutation
  const closeInvoice = useMutation({
    mutationFn: async ({
      creditCardId: cardId,
      month: m,
      year: y,
      closedAmount,
      dueDate,
      closingDate,
    }: {
      creditCardId: string;
      month: number;
      year: number;
      closedAmount: number;
      dueDate?: string;
      closingDate?: string;
    }) => {
      if (!user?.id) {
        throw new Error("Usuário não autenticado");
      }

      const existingCycle = getInvoiceCycle(cardId, m, y);

      if (existingCycle) {
        // Update existing record
        const { data, error } = await supabase
          .from("credit_card_invoices")
          .update({
            status: "closed" as const,
            closed_amount: closedAmount,
            closed_at: new Date().toISOString(),
            due_date: dueDate || null,
            closing_date: closingDate || null,
          })
          .eq("id", existingCycle.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Create new record
        const { data, error } = await supabase
          .from("credit_card_invoices")
          .insert({
            user_id: user.id,
            credit_card_id: cardId,
            month: m,
            year: y,
            status: "closed" as const,
            closed_amount: closedAmount,
            closed_at: new Date().toISOString(),
            due_date: dueDate || null,
            closing_date: closingDate || null,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice-cycles"] });
      toast({ title: "Fatura fechada com sucesso!" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao fechar fatura",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Reopen invoice mutation
  const reopenInvoice = useMutation({
    mutationFn: async ({
      creditCardId: cardId,
      month: m,
      year: y,
    }: {
      creditCardId: string;
      month: number;
      year: number;
    }) => {
      const existingCycle = getInvoiceCycle(cardId, m, y);

      if (!existingCycle) {
        throw new Error("Ciclo de fatura não encontrado");
      }

      const { data, error } = await supabase
        .from("credit_card_invoices")
        .update({
          status: "open" as const,
          closed_at: null,
        })
        .eq("id", existingCycle.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice-cycles"] });
      toast({ title: "Fatura reaberta com sucesso!" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao reabrir fatura",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mark invoice as paid
  const markInvoicePaid = useMutation({
    mutationFn: async ({
      creditCardId: cardId,
      month: m,
      year: y,
    }: {
      creditCardId: string;
      month: number;
      year: number;
    }) => {
      if (!user?.id) {
        throw new Error("Usuário não autenticado");
      }

      const existingCycle = getInvoiceCycle(cardId, m, y);

      if (existingCycle) {
        const { data, error } = await supabase
          .from("credit_card_invoices")
          .update({ status: "paid" as const })
          .eq("id", existingCycle.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("credit_card_invoices")
          .insert({
            user_id: user.id,
            credit_card_id: cardId,
            month: m,
            year: y,
            status: "paid" as const,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice-cycles"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao marcar fatura como paga",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Validate if a transaction can be modified
  const validateTransactionModification = useCallback(
    async (
      creditCardId: string | null | undefined,
      dueDate: string | null | undefined
    ): Promise<{ allowed: boolean; message?: string }> => {
      if (!creditCardId || !dueDate) {
        return { allowed: true };
      }

      const dateObj = new Date(dueDate);
      const m = dateObj.getMonth() + 1;
      const y = dateObj.getFullYear();

      // Check local state first
      const status = getInvoiceStatus(creditCardId, m, y);

      if (status === "closed") {
        return {
          allowed: false,
          message:
            "Esta fatura está fechada. Por segurança, você precisa reabri-la antes de modificar lançamentos.",
        };
      }

      return { allowed: true };
    },
    [getInvoiceStatus]
  );

  // Check invoice status for import (async version that queries DB directly)
  const checkInvoiceStatusForImport = useCallback(
    async (
      cardId: string,
      dueDate: string
    ): Promise<{ status: InvoiceStatus; needsReopen: boolean }> => {
      const dateObj = new Date(dueDate);
      const m = dateObj.getMonth() + 1;
      const y = dateObj.getFullYear();

      const { data, error } = await supabase
        .from("credit_card_invoices")
        .select("status")
        .eq("credit_card_id", cardId)
        .eq("month", m)
        .eq("year", y)
        .maybeSingle();

      if (error) {
        console.error("Error checking invoice status:", error);
        return { status: "open", needsReopen: false };
      }

      const status = (data?.status as InvoiceStatus) || "open";
      return {
        status,
        needsReopen: status === "closed",
      };
    },
    []
  );

  return {
    invoiceCycles,
    isLoading,
    getInvoiceStatus,
    isInvoiceClosed,
    getInvoiceCycle,
    closeInvoice,
    reopenInvoice,
    markInvoicePaid,
    validateTransactionModification,
    checkInvoiceStatusForImport,
  };
}

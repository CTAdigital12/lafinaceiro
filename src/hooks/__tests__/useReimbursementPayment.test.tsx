import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * Mock do client Supabase com `rpc` mockada. Hoisted pra ficar acessível
 * dentro da factory do `vi.mock` e também nos testes abaixo.
 */
const supabaseMock = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

const toastMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

import { useReimbursementPayment } from "@/hooks/useReimbursementPayment";

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  vi.clearAllMocks();
  // default: chamada bem-sucedida
  supabaseMock.rpc.mockResolvedValue({ error: null });
});

describe("useReimbursementPayment — markAsReimbursed", () => {
  it("chama supabase.rpc('mark_reimbursed', { p_transaction_id }) exatamente uma vez", async () => {
    const { result } = renderHook(() => useReimbursementPayment(), { wrapper });

    await result.current.markAsReimbursed.mutateAsync({ transactionId: "abc" });

    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith("mark_reimbursed", {
      p_transaction_id: "abc",
    });
    await waitFor(() =>
      expect(result.current.markAsReimbursed.isSuccess).toBe(true),
    );
  });

  it("propaga erro do Supabase: mutation entra em estado de erro com mensagem", async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      error: new Error("rpc_failure_mark"),
    });

    const { result } = renderHook(() => useReimbursementPayment(), { wrapper });

    await expect(
      result.current.markAsReimbursed.mutateAsync({ transactionId: "abc" }),
    ).rejects.toThrow("rpc_failure_mark");

    await waitFor(() =>
      expect(result.current.markAsReimbursed.isError).toBe(true),
    );
    expect(result.current.markAsReimbursed.error?.message).toBe("rpc_failure_mark");
  });
});

describe("useReimbursementPayment — unmarkAsReimbursed", () => {
  it("chama supabase.rpc('unmark_reimbursed', { p_transaction_id, p_new_status: 'pending' })", async () => {
    const { result } = renderHook(() => useReimbursementPayment(), { wrapper });

    await result.current.unmarkAsReimbursed.mutateAsync({
      transactionId: "tx-1",
      newStatus: "pending",
    });

    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith("unmark_reimbursed", {
      p_transaction_id: "tx-1",
      p_new_status: "pending",
    });
    await waitFor(() =>
      expect(result.current.unmarkAsReimbursed.isSuccess).toBe(true),
    );
  });

  it("chama supabase.rpc('unmark_reimbursed', ...) com p_new_status='requested'", async () => {
    const { result } = renderHook(() => useReimbursementPayment(), { wrapper });

    await result.current.unmarkAsReimbursed.mutateAsync({
      transactionId: "tx-2",
      newStatus: "requested",
    });

    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith("unmark_reimbursed", {
      p_transaction_id: "tx-2",
      p_new_status: "requested",
    });
    await waitFor(() =>
      expect(result.current.unmarkAsReimbursed.isSuccess).toBe(true),
    );
  });
});

type T = {
  type: string;
  is_corporate_expense?: boolean | null;
  is_refund?: boolean | null;
  is_reimbursable?: boolean | null;
  is_card_payment?: boolean | null;
  is_provisional?: boolean | null;
  status?: string | null;
};

export function isMonthlyExpense(t: T): boolean {
  return (
    t.type === 'expense' &&
    !t.is_corporate_expense &&
    !t.is_refund &&
    !t.is_reimbursable &&
    !t.is_card_payment &&
    !t.is_provisional &&
    t.status !== 'pending'
  );
}

export function isMonthlyExpenseRefund(t: T): boolean {
  return (
    t.type === 'expense' &&
    t.is_refund === true &&
    !t.is_corporate_expense &&
    !t.is_reimbursable &&
    !t.is_provisional &&
    t.status !== 'pending'
  );
}

export function isMonthlyIncome(t: T): boolean {
  return (
    t.type === 'income' &&
    !t.is_corporate_expense &&
    !t.is_refund &&
    !t.is_card_payment &&
    !t.is_provisional &&
    t.status !== 'pending'
  );
}

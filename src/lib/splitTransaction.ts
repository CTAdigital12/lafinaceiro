/**
 * Regras puras da divisão de uma transação em várias partes (rateio por
 * categoria). Mantidas fora do hook para poderem ser testadas sem Supabase.
 *
 * Contrato com a RPC `split_transaction`: a soma das partes precisa bater
 * EXATAMENTE com o valor da transação (2 casas), e nenhuma parte pode ser zero
 * ou negativa. Todo arredondamento é resolvido aqui, no cliente.
 */

export interface SplitPart {
  amount: number;
  category_id: string | null;
  /** Sufixo opcional da descrição ("- João"), não a descrição inteira. */
  label: string | null;
  is_reimbursable: boolean;
  is_corporate_expense: boolean;
}

/** Arredonda para 2 casas evitando o erro de ponto flutuante do JS (1.005). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function sumParts(parts: Pick<SplitPart, "amount">[]): number {
  return round2(parts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
}

/**
 * Reaplica a mesma proporção das partes a outro valor total — usado para
 * dividir as demais parcelas de um parcelamento com o mesmo rateio.
 *
 * A sobra de centavos do arredondamento cai na MAIOR parte (nunca na menor,
 * que poderia ir a zero e ser rejeitada pela RPC).
 */
export function prorateParts(
  parts: SplitPart[],
  originalTotal: number,
  targetTotal: number,
): SplitPart[] {
  const total = round2(targetTotal);
  if (parts.length === 0) return [];
  if (originalTotal <= 0) return parts;

  const scaled = parts.map((p) => ({
    ...p,
    amount: round2((Number(p.amount) / originalTotal) * total),
  }));

  const diff = round2(total - sumParts(scaled));
  if (diff !== 0) {
    let largest = 0;
    scaled.forEach((p, i) => {
      if (p.amount > scaled[largest].amount) largest = i;
    });
    scaled[largest] = { ...scaled[largest], amount: round2(scaled[largest].amount + diff) };
  }

  return scaled;
}

export interface SplitAwareRow {
  id: string;
  amount: number;
  split_group_id?: string | null;
  split_parent_id?: string | null;
}

export type CollapsedRow<T> = T & {
  /** Ids de TODAS as partes representadas por esta linha (só o próprio id
   *  quando a transação não foi dividida). */
  splitMemberIds: string[];
  isSplitGroup: boolean;
};

/**
 * Colapsa as partes de uma divisão numa linha só, com o valor somado — ou
 * seja, reconstrói o lançamento como ele aparece na fatura do banco.
 *
 * Necessário em todo matching item-a-item (dedup de importação, conciliação
 * por planilha): a fatura traz "Airbnb R$ 800,00" e o sistema tem R$ 500,00 +
 * R$ 300,00. Sem colapsar, nada casa — a importação recriaria a despesa e a
 * conciliação acusaria divergência em toda transação dividida.
 *
 * A linha representante é a parte primária (`split_parent_id` nulo), que
 * conserva a descrição e a numeração de parcela originais usadas na
 * comparação. A ordem da lista de entrada é preservada.
 */
export function collapseSplitGroups<T extends SplitAwareRow>(rows: T[]): CollapsedRow<T>[] {
  const positionByGroup = new Map<string, number>();
  const result: CollapsedRow<T>[] = [];

  for (const row of rows) {
    const groupId = row.split_group_id;

    if (!groupId) {
      result.push({ ...row, splitMemberIds: [row.id], isSplitGroup: false });
      continue;
    }

    const position = positionByGroup.get(groupId);
    if (position === undefined) {
      positionByGroup.set(groupId, result.length);
      result.push({ ...row, splitMemberIds: [row.id], isSplitGroup: true });
      continue;
    }

    const current = result[position];
    const incomingIsPrimary = !row.split_parent_id && !!current.split_parent_id;

    result[position] = {
      ...(incomingIsPrimary ? row : current),
      amount: round2(Number(current.amount) + Number(row.amount)),
      splitMemberIds: [...current.splitMemberIds, row.id],
      isSplitGroup: true,
    };
  }

  return result;
}

/**
 * Valida o formulário antes de chamar a RPC. Retorna a mensagem de erro ou
 * null quando as partes estão prontas para enviar.
 */
export function validateParts(parts: SplitPart[], transactionAmount: number): string | null {
  if (parts.length < 2) {
    return "Informe pelo menos duas partes.";
  }
  if (parts.some((p) => !Number.isFinite(p.amount) || round2(p.amount) <= 0)) {
    return "Cada parte precisa ter valor maior que zero.";
  }
  const diff = round2(sumParts(parts) - round2(transactionAmount));
  if (diff !== 0) {
    return diff > 0
      ? `A soma das partes excede o valor da transação em R$ ${diff.toFixed(2)}.`
      : `Faltam R$ ${Math.abs(diff).toFixed(2)} para completar o valor da transação.`;
  }
  return null;
}

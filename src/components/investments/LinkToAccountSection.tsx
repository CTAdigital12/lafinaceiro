import { useEffect } from "react";
import { UseFormReturn } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useUnlinkedTransactions } from "@/hooks/useUnlinkedIncomes";

/**
 * Shape mínimo do form esperado pelo componente. Forms reais (ex: OperationModal)
 * podem ter campos extras — só o subset abaixo é manipulado aqui.
 */
export interface LinkSectionFormShape {
  createExpense: boolean;
  accountId?: string;
  categoryId?: string;
  /** Usado em compra e venda: vincular lançamento existente ou criar um novo. */
  linkMode?: "existing" | "new";
  existingTransactionId?: string;
}

interface Props {
  mode: "buy" | "sell";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  refDate: string | undefined;
  /**
   * Lançamento extra a injetar na lista do dropdown "… a vincular".
   * Usado em edit mode: o lançamento atualmente vinculado não aparece em
   * `useUnlinkedTransactions` (porque está linkado), mas precisa estar
   * selecionável para o usuário re-salvar sem mexer na vinculação.
   */
  additionalTransaction?: {
    id: string;
    date: string;
    amount: number;
    description: string | null;
  } | null;
}

const COPY = {
  buy: {
    checkboxLabel: "Lançar/vincular saída na conta corrente",
    checkboxHint:
      "Vincula esta aplicação a um débito já lançado na conta (ex.: o do extrato) ou cria uma nova saída equivalente",
    existingTitle: "Vincular a um débito já existente",
    existingHint: "Use quando o débito já está na conta — veio do extrato ou foi lançado à mão",
    newTitle: "Criar nova saída",
    newHint: "Lança uma saída nova na conta com o valor da aplicação",
    pickLabel: "Débito a vincular",
    pickPlaceholder: "Selecione o débito",
    emptyPlaceholder: "Nenhum débito elegível nos últimos ±30 dias",
    pickHint:
      "Lista débitos da conta ±30 dias da data da aplicação que ainda não estão vinculados a outra operação. Vinculado, ele passa a contar como aporte, fora da despesa do mês.",
    newCategoryLabel: "Categoria",
  },
  sell: {
    checkboxLabel: "Lançar/vincular receita na conta corrente",
    checkboxHint:
      "Vincula este resgate a uma receita já lançada na conta ou cria uma nova entrada equivalente",
    existingTitle: "Vincular a uma receita já existente",
    existingHint: "Use quando você já lançou esta entrada na conta corrente manualmente",
    newTitle: "Criar nova receita",
    newHint: "Lança uma entrada nova na conta com o valor do resgate",
    pickLabel: "Receita a vincular",
    pickPlaceholder: "Selecione a receita",
    emptyPlaceholder: "Nenhuma receita elegível nos últimos ±30 dias",
    pickHint:
      "Lista filtra receitas da conta ±30 dias da data do resgate que ainda não estão vinculadas a outra operação.",
    newCategoryLabel: "Categoria da receita",
  },
} as const;

function formatIsoToBr(iso: string): string {
  // "yyyy-mm-dd" → "DD/MM"
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function formatBRL(amount: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

export function LinkToAccountSection({ mode, form, refDate, additionalTransaction }: Props) {
  const { accounts } = useAccounts();
  const { categories } = useCategories();

  const createExpense = form.watch("createExpense");
  const accountId = form.watch("accountId") as string | undefined;
  const linkMode = form.watch("linkMode") as "existing" | "new" | undefined;

  const filteredCategories =
    mode === "buy"
      ? categories.filter((c) => c.type === "expense")
      : categories.filter((c) => c.type === "income");

  const { transactions: candidates, isFetching } = useUnlinkedTransactions(
    mode === "buy" ? "expense" : "income",
    accountId,
    refDate,
    !!createExpense && linkMode === "existing",
  );

  const options =
    additionalTransaction && !candidates.some((i) => i.id === additionalTransaction.id)
      ? [additionalTransaction, ...candidates]
      : candidates;

  // Default `linkMode` para "existing" quando o checkbox é ativado: nos dois
  // lados, o caso comum é o lançamento já estar na conta (extrato).
  useEffect(() => {
    if (createExpense && !linkMode) {
      form.setValue("linkMode", "existing", { shouldValidate: false });
    }
  }, [createExpense, linkMode, form]);

  // Limpa campos dependentes quando o usuário muda de modo/desmarca.
  useEffect(() => {
    if (!createExpense) {
      form.setValue("existingTransactionId", undefined, { shouldValidate: false });
      form.setValue("categoryId", undefined, { shouldValidate: false });
      return;
    }
    if (linkMode === "existing") {
      form.setValue("categoryId", undefined, { shouldValidate: false });
    }
    if (linkMode === "new") {
      form.setValue("existingTransactionId", undefined, { shouldValidate: false });
    }
  }, [createExpense, linkMode, form]);

  const copy = COPY[mode];

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="createExpense"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center space-x-3 space-y-0 p-3 border rounded-lg">
            <FormControl>
              <Checkbox
                checked={!!field.value}
                onCheckedChange={field.onChange}
              />
            </FormControl>
            <div className="space-y-1 leading-none">
              <FormLabel className="font-normal">{copy.checkboxLabel}</FormLabel>
              <p className="text-xs text-muted-foreground">{copy.checkboxHint}</p>
            </div>
          </FormItem>
        )}
      />

      {createExpense && (
        <div className="space-y-4 pl-1">
          <FormField
            control={form.control}
            name="accountId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Conta</FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? ""}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a conta" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {accountId && (
            <>
              <FormField
                control={form.control}
                name="linkMode"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel>Como vincular</FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value ?? "existing"}
                        onValueChange={field.onChange}
                        className="grid gap-2"
                      >
                        <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/30">
                          <RadioGroupItem value="existing" className="mt-1" />
                          <div className="space-y-0.5 leading-tight">
                            <div className="text-sm">{copy.existingTitle}</div>
                            <div className="text-xs text-muted-foreground">{copy.existingHint}</div>
                          </div>
                        </label>
                        <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/30">
                          <RadioGroupItem value="new" className="mt-1" />
                          <div className="space-y-0.5 leading-tight">
                            <div className="text-sm">{copy.newTitle}</div>
                            <div className="text-xs text-muted-foreground">{copy.newHint}</div>
                          </div>
                        </label>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {linkMode === "existing" && (
                <FormField
                  control={form.control}
                  name="existingTransactionId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{copy.pickLabel}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                isFetching
                                  ? "Carregando..."
                                  : options.length === 0
                                    ? copy.emptyPlaceholder
                                    : copy.pickPlaceholder
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {options.map((tx) => (
                            <SelectItem key={tx.id} value={tx.id}>
                              {formatIsoToBr(tx.date)} • {formatBRL(tx.amount)} •{" "}
                              {tx.description || "sem descrição"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">{copy.pickHint}</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {linkMode === "new" && (
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{copy.newCategoryLabel}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredCategories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.icon} {cat.fullName || cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

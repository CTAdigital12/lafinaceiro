import * as z from "zod";
import { tickerIsRequired } from "./assetTicker";

/**
 * Validação do formulário de ativo (AssetModal). Mora fora do componente para
 * ser testável sem o cliente Supabase — o defeito do código obrigatório estava
 * justamente aqui, e não na geração do código.
 */
export const assetFormSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  // Obrigatório só para ativo por cotação — ver tickerIsRequired (superRefine abaixo).
  ticker: z.string().default(""),
  asset_type: z.string().min(1, "Tipo é obrigatório"),
  institution_id: z.string().optional(),
  current_price: z.coerce.number().min(0).default(0),
  maturity_date: z.string().optional(),
  yield_info: z.string().optional(),
  liquidity: z.string().optional(),
  // Variable income fields
  initial_quantity: z.coerce.number().min(0).optional(),
  initial_value: z.coerce.number().min(0).optional(),
  // Fixed income fields
  applied_value: z.coerce.number().min(0).optional(),
  current_balance: z.coerce.number().min(0).optional(),
}).superRefine((values, ctx) => {
  if (tickerIsRequired(values.asset_type) && !values.ticker.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ticker"], message: "Ticker é obrigatório" });
  }
});

export type AssetFormValues = z.infer<typeof assetFormSchema>;

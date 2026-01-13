import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Transaction {
  id: string;
  description: string;
  amount: number;
  credit_card_id: string | null;
  user_id: string;
  installment_group_id: string | null;
  installment_number: number | null;
  total_installments: number | null;
}

interface GroupInfo {
  transactions: Transaction[];
  baseDescription: string;
  totalInstallments: number;
}

// Extract installment info from description like "AMAZON BR 02/10" or "Compra 3/12"
function extractInstallmentInfo(description: string): { baseDescription: string; current: number; total: number } | null {
  // Match patterns like "X/Y" where X and Y are numbers
  const match = description.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  
  const current = parseInt(match[1], 10);
  const total = parseInt(match[2], 10);
  
  // Validate: current should be <= total and total should be reasonable (2-48)
  if (current <= 0 || total <= 1 || current > total || total > 48) return null;
  
  // Extract base description by removing the installment pattern and trailing spaces
  const baseDescription = description
    .replace(/\s*\d+\s*\/\s*\d+.*$/, '')
    .trim()
    .toUpperCase();
  
  return { baseDescription, current, total };
}

// Create a grouping key for identifying related installments
function createGroupKey(baseDescription: string, amount: number, creditCardId: string | null, total: number): string {
  return `${baseDescription}|${amount.toFixed(2)}|${creditCardId || 'null'}|${total}`;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { dryRun = false } = body;

    console.log(`[migrate-installments] Starting migration for user ${user.id}, dryRun: ${dryRun}`);

    // Fetch all transactions without installment_group_id that might be installments
    const { data: transactions, error: fetchError } = await supabase
      .from('transactions')
      .select('id, description, amount, credit_card_id, user_id, installment_group_id, installment_number, total_installments')
      .eq('user_id', user.id)
      .is('installment_group_id', null)
      .not('credit_card_id', 'is', null);

    if (fetchError) {
      console.error('[migrate-installments] Error fetching transactions:', fetchError);
      throw fetchError;
    }

    console.log(`[migrate-installments] Found ${transactions?.length || 0} candidate transactions`);

    // Group transactions by pattern
    const groups = new Map<string, GroupInfo>();
    const installmentTransactions: Array<Transaction & { extractedCurrent: number; extractedTotal: number }> = [];

    for (const t of transactions || []) {
      const info = extractInstallmentInfo(t.description);
      if (info) {
        const key = createGroupKey(info.baseDescription, t.amount, t.credit_card_id, info.total);
        
        if (!groups.has(key)) {
          groups.set(key, {
            transactions: [],
            baseDescription: info.baseDescription,
            totalInstallments: info.total,
          });
        }
        
        groups.get(key)!.transactions.push(t);
        installmentTransactions.push({
          ...t,
          extractedCurrent: info.current,
          extractedTotal: info.total,
        });
      }
    }

    console.log(`[migrate-installments] Identified ${groups.size} installment groups`);

    // Prepare results
    const groupsSummary: Array<{
      baseDescription: string;
      amount: number;
      creditCardId: string | null;
      totalInstallments: number;
      foundInstallments: number;
      transactionIds: string[];
    }> = [];

    let updatedCount = 0;

    for (const [key, group] of groups) {
      // Only process groups with more than one transaction (actual groups)
      if (group.transactions.length >= 1) {
        const firstTransaction = group.transactions[0];
        
        groupsSummary.push({
          baseDescription: group.baseDescription,
          amount: firstTransaction.amount,
          creditCardId: firstTransaction.credit_card_id,
          totalInstallments: group.totalInstallments,
          foundInstallments: group.transactions.length,
          transactionIds: group.transactions.map(t => t.id),
        });

        if (!dryRun) {
          // Generate a new group ID
          const groupId = crypto.randomUUID();
          
          // Update each transaction in the group
          for (const t of group.transactions) {
            const info = extractInstallmentInfo(t.description);
            if (info) {
              const { error: updateError } = await supabase
                .from('transactions')
                .update({
                  installment_group_id: groupId,
                  installment_number: info.current,
                  total_installments: info.total,
                })
                .eq('id', t.id);

              if (updateError) {
                console.error(`[migrate-installments] Error updating transaction ${t.id}:`, updateError);
              } else {
                updatedCount++;
              }
            }
          }
        }
      }
    }

    const result = {
      success: true,
      dryRun,
      summary: {
        totalCandidates: transactions?.length || 0,
        groupsFound: groups.size,
        transactionsUpdated: dryRun ? 0 : updatedCount,
      },
      groups: groupsSummary,
    };

    console.log(`[migrate-installments] Migration complete:`, result.summary);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[migrate-installments] Error:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

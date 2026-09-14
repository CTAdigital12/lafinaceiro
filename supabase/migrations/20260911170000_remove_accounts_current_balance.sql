-- Remove `accounts.current_balance`, a coluna de saldo do desenho ANTIGO.
--
-- Ela era a fonte de verdade antes de `initial_balance`. Em março/2026 as
-- migrations `20260311154145` e `20260311160249` derivaram `initial_balance`
-- dela, de uma vez (`initial_balance = current_balance - soma(realizados)`), e
-- desde então o saldo é `initial_balance + lançamentos`. A coluna passou a ser
-- escrita por hábito e lida por engano.
--
-- Lida por engano UMA vez, e caro: o seletor de conta do `PayInvoiceModal`
-- mostrava `current_balance` no lugar do saldo real. Medido na conta real em
-- 11/09/2026, exibia R$ 5.761,13 onde o saldo era R$ 4.289,86 — R$ 1.471,27 a
-- mais, na tela onde se decide quanto pagar de fatura. O valor não era lixo:
-- era um retrato exato do dia da última edição da conta, e por isso plausível
-- demais para alguém estranhar. (achado M9, PR #99)
--
-- O PR #100 tirou a coluna do tipo `Account` e parou de escrevê-la; esta
-- migration tira do banco, que é o que impede de vez qualquer leitura nova.
--
-- PRÉ-REQUISITO, conferir ANTES de rodar: as edge functions `pluggy-connect` e
-- `pluggy-webhook` escreviam nesta coluna. O código-fonte das duas foi
-- corrigido junto com esta migration, mas **fonte corrigida não é função
-- deployada**. Se alguma das duas estiver publicada, REDEPLOYE (ou apague)
-- antes de aplicar isto — senão a versão antiga, ainda no ar, quebra ao tentar
-- escrever numa coluna que não existe mais. O `pluggy-webhook` é o caso que
-- importa: quem o chama é a Pluggy, de fora, não o app.

-- Guarda o valor antes de apagar. `DROP COLUMN` não tem volta, e apesar de
-- nada ler a coluna, jogar fora um número financeiro sem cópia é o tipo de
-- coisa da qual só se descobre a falta depois. A tabela é pequena e pode ser
-- descartada quando você quiser.
create table if not exists public.accounts_current_balance_backup as
select id, current_balance, now() as arquivado_em
  from public.accounts;

comment on table public.accounts_current_balance_backup is
  'Último valor de accounts.current_balance antes de a coluna ser removida, em '
  'setembro/2026. Só arquivo: nada lê esta tabela. Pode ser descartada.';

alter table public.accounts
  drop column if exists current_balance;

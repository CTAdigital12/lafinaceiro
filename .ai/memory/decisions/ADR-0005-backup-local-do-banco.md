---
id: ADR-0005
type: decision
title: Backup do banco de produção fica só no computador local (pg_dump + launchd)
status: proposed
created_at: 2026-11-21
reviewed_at: null
owner: responsável a confirmar no PR
scope: project
files:
  - scripts/backup/backup-db.sh
  - scripts/backup/restore-to-local.sh
  - scripts/backup/setup.sh
  - scripts/backup/common.sh
  - scripts/backup/README.md
deps: []
related_prs: []
supersedes: []
review_required: false
---

## Contexto
O banco de produção (Supabase, plano gratuito) não tinha backup nenhum: o plano gratuito não oferece
cópia restaurável, nenhum workflow fazia cópia e o app não exporta os dados. Em 21/11/2026 houve dois
quase-acidentes com SQL colado no SQL Editor: um script de teste de `supabase/tests/` (que começa com
`truncate public.transactions`) só não rodou porque o `\set` do psql deu erro de sintaxe antes.
Restrição: o repositório no GitHub é **público**.

## Decisão
Cópia completa diária (`pg_dump -Fc` do schema `public` + `auth.users`/`auth.identities`) gravada **só no
computador do responsável**, em `~/Backups/lafinaceiro` (fora do Git e do iCloud, disco com FileVault).
Senha no Keychain do macOS; host/usuário em `backup.conf` fora do repositório. Agendamento por `launchd`
(12h e no login, uma cópia automática por dia) e `npm run backup` manual antes de SQL que altera dados.
Retenção: todas as cópias dos últimos 30 dias com backup + 1 por mês por 12 meses. Cada cópia guarda
contagem de linhas por tabela e SHA256; `npm run backup:testar` restaura num Postgres descartável e
compara as contagens. Alarme por notificação se a cópia falha ou se as transações caem mais de 20%
(nesse caso a poda é suspensa).

## Alternativas consideradas
- **GitHub Actions noturno com cópia criptografada** (artefato de 90 dias): automático e fora da máquina,
  mas exige a senha do banco nos segredos de um repositório público e a guarda de uma chave de
  descriptografia. Recusada pelo usuário em favor da cópia local.
- **Botão "Baixar backup" no app**: sem segredo novo, mas só existe cópia quando alguém lembra de clicar.
- **Plano Pro do Supabase** (~US$ 25/mês, backup diário gerenciado): sem código, mas custo recorrente.

## Consequências
- Cópia existe sem custo e sem segredo fora da máquina.
- **Ponto único de falha:** se o Mac quebrar ou for roubado, as cópias vão junto. Cópia para disco
  externo não está automatizada.
- Sem cópia nos dias em que o Mac fica desligado.
- O agendamento roda a cópia dos scripts em `~/Backups/lafinaceiro/bin/`; mudar os scripts exige
  `setup.sh --so-agendamento`, senão o agendamento continua com a versão antiga.
- O `pg_dump` local precisa ser de versão >= a do servidor; o script detecta e diz o que instalar.

## Evidências
Testes executados em 21/11/2026 contra um Postgres local fazendo papel de produção (não contra o
Supabase real): cópia com 1.571 transações; `--se-preciso` não repete no mesmo dia; restauração com
contagem idêntica em todas as tabelas (único aviso do pg_restore: `schema "public" already exists`);
alarme dispara ao apagar 1.000 transações e suspende a poda; poda com 700 cópias falsas deixa 45
(30 dias com 33 pastas + 12 mensais). `setup.sh` não foi executado (interativo, grava no Keychain e
instala o agendamento); o plist gerado passou no `plutil -lint`. Conexão com o Supabase real: **não
verificada** até o primeiro `npm run backup`.

## Revisão / obsolescência
Revisar se o projeto migrar para o plano Pro, se o repositório ficar privado (reabre a opção do
GitHub Actions), se o responsável trocar de computador, ou se surgir um segundo responsável que
também precise das cópias.

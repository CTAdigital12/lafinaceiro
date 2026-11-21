# Backup local do banco

Cópia completa do banco de produção (Supabase) **no seu computador**, fora do Git
e fora do iCloud. O plano gratuito do Supabase não guarda backup restaurável,
então esta é a única cópia que existe.

| Comando | O que faz |
|---|---|
| `npm run backup:setup` | Uma vez por computador: conexão, senha no Keychain e agendamento diário |
| `npm run backup` | Cópia **agora**. Rode antes de qualquer SQL que altere dados |
| `npm run backup:testar` | Restaura a última cópia num Postgres descartável e confere tabela por tabela |

## Onde fica

```
~/Backups/lafinaceiro/
  backup.conf                        host/porta/usuário (sem senha)
  backup.log                         histórico de todas as execuções
  bin/                               cópia dos scripts usada pelo agendamento
  lafinaceiro-2026-11-21-1200/
    public.dump   schema public inteiro (transações, categorias, contas, metas...)
    auth.dump     auth.users e auth.identities
    counts.tsv    linhas por tabela no momento da cópia
    SHA256SUMS    integridade dos arquivos
```

- A senha do banco fica no **Keychain** (serviço `lafinaceiro-db-backup`), nunca em arquivo.
- Pasta e arquivos só são legíveis pelo seu usuário (700/600). O disco está com FileVault.
- `~/Backups` fica fora de `~/Documents`, então **não** vai para o iCloud.

## Quando roda

Todo dia às 12h e ao entrar na conta (se o Mac estava desligado ao meio-dia).
No máximo uma cópia automática por dia; as manuais (`npm run backup`) são extras.
Se o Mac ficar desligado vários dias, ficam esses dias sem cópia.

**Depois de mudar qualquer script desta pasta**, rode `bash scripts/backup/setup.sh --so-agendamento`:
o agendamento usa a cópia em `~/Backups/lafinaceiro/bin/`, não o repositório (o macOS
restringe tarefas em segundo plano dentro de `~/Documents`).

## Quanto guarda

Todas as cópias dos últimos **30 dias** com backup, e antes disso **uma por mês por 12 meses**.
O resto é apagado automaticamente, só dentro de `~/Backups/lafinaceiro`.

## Alarmes

Notificação na tela quando:
- a cópia **falha** (sem rede, senha errada, projeto pausado, `pg_dump` velho);
- o número de **transações cai mais de 20%** desde a cópia anterior. Nesse caso a poda é
  suspensa naquela execução, para as cópias boas não serem apagadas. O alarme compara só
  com a cópia anterior: se ele aparecer, investigue no mesmo dia.

## Restaurar em produção (manual, nunca automático)

1. **Antes de tudo, `npm run backup`**: guarda o estado atual, mesmo quebrado.
2. Suba a cópia boa localmente para consultar:
   `bash scripts/backup/restore-to-local.sh ~/Backups/lafinaceiro/lafinaceiro-AAAA-MM-DD-HHMM --manter`
3. Compare com produção e extraia **só o que se perdeu** (ex.: as transações apagadas), como
   `insert` gerado a partir do Postgres local. Nunca restaure o banco inteiro por cima: apagaria
   o que foi lançado depois da cópia.
4. Para perda total, `pg_restore --data-only` de `public.dump` num projeto novo, depois de criar o
   schema pelas migrations. Faça isso com calma e acompanhado.

## Requisitos

- `pg_dump` do Homebrew **de versão igual ou maior** que a do Postgres do Supabase
  (`select version();` no SQL Editor). O script avisa e diz qual instalar
  (`brew install postgresql@17`).
- Conexão pelo **Session pooler** (porta 5432). A conexão direta do plano gratuito é só IPv6.

## Testes

Os scripts foram testados contra um Postgres local fazendo papel de produção (as variáveis
`PG*` e `LAFIN_BACKUP_DIR` no ambiente têm precedência sobre `backup.conf`;
`LAFIN_NO_NOTIFY=1` silencia as notificações):
cópia + `--se-preciso`, restauração com contagem idêntica, alarme de queda de transações e
poda com 700 cópias falsas (sobram 30 dias + 12 meses).

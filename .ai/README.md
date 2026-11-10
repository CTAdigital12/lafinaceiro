# Dev Memory — guia da equipe

Memória técnica do projeto: decisões, soluções e problemas conhecidos, em Markdown versionado
e revisado via PR. Funciona só com Git e arquivos locais, sem serviço central.

> **A conversa pertence ao desenvolvedor; o conhecimento revisado pertence ao projeto.**
> Nenhum histórico de chat entra aqui, só conhecimento técnico sanitizado e aprovado.

## Estrutura

```text
.ai/
├── README.md                 # este guia (parte do kit)
├── templates/                # modelos de registro (parte do kit)
│   ├── adr.md
│   ├── solution.md
│   └── known-issue.md
├── skills/close-task/        # procedimento de encerramento de tarefa (parte do kit)
└── memory/                   # conhecimento DESTE projeto
    ├── PROJECT.md            # propósito, escopo e limites
    ├── CURRENT_STATE.md      # estado verificável, atualizado em PR
    ├── INDEX.md              # índice: comece por aqui
    ├── decisions/            # ADR-NNNN-titulo-curto.md
    ├── solutions/            # SOL-NNNN-titulo-curto.md
    └── known-issues/         # ISSUE-NNNN-titulo-curto.md
```

## Tipos de registro

| Tipo | Prefixo | Quando criar | Status permitidos |
|---|---|---|---|
| Decisão arquitetural | `ADR-` | Escolha técnica com alternativas e trade-offs | `proposed`, `approved`, `superseded`, `rejected` |
| Solução reutilizável | `SOL-` | Bug/diagnóstico com causa raiz e correção verificadas | `proposed`, `verified`, `approved`, `superseded`, `rejected` |
| Problema conhecido | `ISSUE-` | Falha ainda não resolvida, com workaround ou risco | `open`, `mitigated`, `resolved`, `wontfix` |

Convenções:
- IDs únicos por tipo, com 4 dígitos (`SOL-NNNN`: próximo número livre do tipo). Nome do arquivo: `<ID>-<titulo-curto-ascii>.md`.
- Datas em ISO 8601 (`YYYY-MM-DD`).
- `files:` contém caminhos relativos à raiz do repositório. Alterar um desses arquivos fará o detector
  de obsolescência (`check-staleness`) pedir revisão, mas o registro **não** é invalidado automaticamente.
- `deps:` contém pacotes e faixas de versão relevantes, com o mesmo efeito.
- Substituiu um registro? Use `supersedes: [ID]` no novo e `status: superseded` no antigo. Não apague.

## Como criar um registro

1. Copie o template: `cp .ai/templates/solution.md .ai/memory/solutions/SOL-NNNN-titulo-curto.md`
2. Preencha **todas** as seções com fatos verificáveis (comandos, resultados, PR, commit).
3. Hipótese não confirmada: `status: proposed` + `confidence: low`.
4. Regenere o índice com `npm run memory:index` (nunca edite `INDEX.md` à mão) e rode `npm run memory:check`.
5. Inclua o registro **no mesmo PR** da tarefa que o originou.

Não registre: tarefas banais, conteúdo genérico ("verificar permissões"), trechos de chat, nem
nada que não passaria numa revisão de código. Poucos registros concretos valem mais que muitos vagos.

## Como consultar

Comece pelo [INDEX.md](memory/INDEX.md). Para busca direta (funciona sem instalar nada):

```bash
# Palavra-chave ou mensagem de erro (em todos os registros)
grep -rli "401" .ai/memory/

# Registros que referenciam um arquivo
grep -rl "src/lib/auth.ts" .ai/memory/

# Por stack ou tag (campo do front matter)
grep -rlE "^(stack|tags):.*supabase" .ai/memory/

# Por sintoma (título e seção de sintoma)
grep -rli -A3 "## Sintoma" .ai/memory/solutions/ | grep -i "timeout"

# Só registros aprovados
grep -rl "^status: approved" .ai/memory/
```

Se o `rg` (ripgrep) estiver disponível, os mesmos padrões funcionam com `rg -l`.

**Conhecimento de outros projetos:** o repositório privado `organization-knowledge`, clonado ao lado deste
(`../organization-knowledge`), tem soluções generalizadas (`ORG-NNNN`) com índice próprio:

```bash
grep -i "<sintoma ou erro>" ../organization-knowledge/INDEX.md
```

Ali só entra conteúdo revisado e sanitizado. Como promover uma solução daqui: README daquele repositório e
passo 6 do `close-task`.

**Antes de aplicar uma solução encontrada:** confira se as versões em `deps:`, os arquivos em `files:`
e as condições de "Quando NÃO reutilizar" ainda valem no código atual.

## Política de publicação

| Conteúdo | Destino |
|---|---|
| Conversas brutas, tentativas, notas pessoais | Ficam com o desenvolvedor. **Nunca** versionar. |
| Conhecimento específico deste projeto | `.ai/memory/`, via PR revisado |
| Solução genérica, aplicável a outros sistemas | Versão **generalizada e sanitizada** proposta ao `organization-knowledge`, em PR próprio e com aprovação de um responsável |

Antes de publicar, remova: segredos, tokens, `.env`, credenciais, dados pessoais (CPF, e-mail),
nomes de clientes, domínios internos, paths sensíveis e trechos proprietários. Remover nomes não basta:
revise também URLs, tabelas e dados que permitam identificar o cliente ou o projeto de origem.

## Encerramento de tarefa (`close-task`)

Ao terminar uma tarefa, rode o procedimento [skills/close-task/SKILL.md](skills/close-task/SKILL.md).
Ele examina o diff real e **propõe** registros, ou responde `no-memory-change`. Não faz commit nem publica nada.

| Agente | Como invocar | Lembrete automático |
|---|---|---|
| Claude Code | `/close-task` (`.claude/skills/close-task/`) | Sim: hook `Stop` |
| Gemini CLI | `/close-task` (`.gemini/commands/close-task.toml`), **não verificado** | Não |
| Codex / outros | "execute `.ai/skills/close-task/SKILL.md`" | Não |

**Hook `Stop` (Claude Code):** ao fim de cada resposta, `scripts/dev-memory/hooks/stop-reminder.mjs` verifica
o `git status`. Se há arquivos alterados fora de `.ai/memory/` e nenhum dentro, exibe um aviso sugerindo
`/close-task`, uma vez por conjunto de mudanças. O estado fica em `.git/dev-memory/`, fora da árvore versionada.
O hook nunca bloqueia, nunca escreve no repositório e, em caso de erro, termina em silêncio. Limitações:
qualquer mudança em `.ai/memory/` o silencia, e ele não existe em Codex e Gemini CLI. Para esses casos,
a cobertura é o check de PR (`check-staleness`). Decisão completa: ADR-0003 do kit (repositório `gestor-de-ia`).

**Ativar o hook:** acrescente o bloco `hooks.Stop` (ver `.claude/settings.json` do kit) ao `.claude/settings.json`
do projeto, se ele for versionado e compartilhado, **mesclando** com o que já existe. Se o `settings.json` do
projeto for pessoal ou estiver no `.gitignore`, use `.claude/settings.local.json`; aí o hook vale só na sua máquina.

Testes do kit: `npm run memory:test` (Node.js >= 22, sem dependências).

## Validação, índice e obsolescência

Ferramentas em `scripts/dev-memory/cli.mjs`. Usam só Node.js >= 22 e git, sem `npm install`. Rodam localmente e no CI
(`.github/workflows/dev-memory.yml`).

| Comando | O que faz | No CI |
|---|---|---|
| `npm run memory:validate` | Front matter e campos por tipo, IDs únicos, status, datas, `files:` existentes (registros ativos), `supersedes`, seções obrigatórias de soluções `verified`/`approved`, segredos e dados pessoais em `.ai/memory/`, links relativos em `.ai/` | **Bloqueia** |
| `npm run memory:index` | Gera `INDEX.md` de forma determinística, ordenado por ID e sem `rejected`. `build-index --check` só confere | **Bloqueia** se desatualizado |
| `npm run memory:stale` | Compara o diff (`--base main`, `--head REF`; sem `--head` usa a árvore de trabalho) com `files:` e `deps:` dos registros ativos e avisa sobre arquivo alterado, removido ou renomeado, dependência alterada em manifest/lockfile e mudança sem memória | **Só avisa** (`--strict` falha) |
| `npm run memory:check` | Os três acima em sequência | — |

**Respondendo a avisos do `check-staleness`.** O aviso nunca invalida a memória; ele pede uma decisão humana registrada:
- **Registro afetado:** revise-o no mesmo PR (conteúdo, `reviewed_at`, `status` ou `review_required: true`).
  Alterar o registro no diff já conta como reconhecimento.
- **Continua válido:** acrescente a um commit da branch o trailer
  `Memory-Reviewed: <ID> mudança só de formatação` (com o ID do registro afetado). Fica auditável no histórico.
- **Tarefa sem memória:** use o trailer `No-Memory-Change: <motivo>`, o mesmo resultado do `close-task`.

**Falso positivo de segredo:** acrescente `dev-memory:allow-secret` na mesma linha, por exemplo dentro de um
comentário `<!-- -->`. A exceção fica visível no diff e precisa ser aprovada na revisão. Os detectores procuram
**valores** (tokens, chaves, strings de conexão com senha, CPF), não menções: escrever "nunca commite a
service_role" é permitido.

## Integração com agentes

| Agente | Arquivo de instrução | Mecanismo |
|---|---|---|
| Codex | `AGENTS.md` | Leitura nativa |
| Claude Code | `CLAUDE.md` → `@AGENTS.md` | Import do Claude Code |
| Gemini CLI | `GEMINI.md` → `@AGENTS.md` (só se o projeto usar Gemini) | Import do Gemini CLI |

Quais integrações foram **verificadas neste projeto** (versão e data) fica registrado em `memory/CURRENT_STATE.md`.

`AGENTS.md` é a fonte canônica. Os outros arquivos só importam esse e acrescentam particularidades
da ferramenta. Usamos import em vez de symlink porque as ferramentas tratam symlinks de formas diferentes.

## Instalar o kit em outro projeto (após validação do MVP)

Se o `.gitignore` do projeto ignora `.claude/` inteiro (comum quando há backups ou settings pessoais ali),
troque por `.claude/*` + `!.claude/skills/` e confirme com `git check-ignore` que o resto continua ignorado.

Copie `.ai/README.md`, `.ai/templates/`, `.ai/skills/`, `scripts/dev-memory/`, os atalhos
`.claude/skills/close-task/`, `.gemini/commands/close-task.toml` e `.github/workflows/dev-memory.yml`
(ajuste ao CI do projeto, se não for GitHub Actions). Os scripts `memory:*` e `test` do `package.json`
também vão; em projeto que não é Node, chame `node scripts/dev-memory/cli.mjs ...` direto.
Acrescente o hook `Stop` ao `.claude/settings.json` do projeto, **mesclando** com hooks existentes.
Não sobrescreva o arquivo. Crie `.ai/memory/` **vazio** (com `PROJECT.md`, `CURRENT_STATE.md` e `INDEX.md`
próprios) e acrescente a seção "Memória técnica do projeto" ao `AGENTS.md` existente, **sem remover
nenhuma instrução anterior**. Não copie a memória deste repositório.

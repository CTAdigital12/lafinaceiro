---
id: SOL-0000                 # próximo número livre em .ai/memory/solutions/
type: solution
title: <Título descritivo: sintoma + contexto>
status: proposed             # proposed | verified | approved | superseded | rejected
created_at: YYYY-MM-DD
reviewed_at: null
scope: project               # project | organization
stack: []                    # ex.: [typescript, supabase]
tags: []                     # ex.: [rls, auth, error-401]
files: []
deps: []                     # - name: <pacote>
                             #   version: "<faixa>"
related_prs: []
related_commits: []
supersedes: []
review_required: false
confidence: low              # low | medium | high
---

<!--
Regras de qualidade:
- Nada genérico ("verificar permissões") sem falha, causa, diagnóstico e correção específicos.
- Separe o erro observado de explicações especulativas.
- Causa raiz não comprovada => status: proposed, confidence: low.
- Sem segredos, tokens, .env, dados pessoais, nomes de clientes ou trechos de chat.
-->

## Sintoma reproduzível
<O que falhava, onde, em quais versões e condições.>

## Erro exato
<Mensagem / código HTTP / log sanitizado. Se não houver, declare explicitamente: "sem mensagem de erro".>

## Causa raiz confirmada
<A causa efetivamente comprovada. Hipóteses não confirmadas vão em "Diagnóstico executado".>

## Diagnóstico executado
<Comandos e verificações reproduzíveis, com os resultados relevantes, sem segredos.>

## Correção aplicada
<Arquivo/símbolo alterado, link para diff/PR ou trecho sanitizado.>

## Validação
<Testes e comandos executados, resultado observado e limitações.>

## Quando reutilizar
<Pré-condições, stacks e sintomas comparáveis.>

## Quando NÃO reutilizar
<Exceções e riscos de aplicação indevida.>

## Evidências
<PR / commit / issue / documentação autorizada e revisão.>

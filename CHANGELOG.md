# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

---

## [2025.01.18] - Genesis

### Adicionado
- Sistema de autenticação com email/senha
- Dashboard com gráficos de categorias e evolução do orçamento
- Módulo de Contas Bancárias (CRUD completo)
- Módulo de Cartões de Crédito com importação de faturas
- Parser inteligente de PDF via Google Gemini
- Sistema de parcelamentos com agrupamento automático
- Categorização automática com regras de aprendizado
- Módulo de Investimentos (Renda Fixa, Variável, FIIs, Crypto)
- Cálculo automático de preço médio
- Despesas Corporativas (isoladas dos relatórios pessoais)
- Despesas Reembolsáveis com seleção em lote
- Relatório de Estornos (despesas líquidas)
- Compartilhamento de dados entre usuários
- Sistema de convites por email
- Suporte a OFX e CSV para importação bancária
- Interface mobile-first com navegação lateral
- Tema claro/escuro
- Sistema de versionamento automático baseado em data de build

### Segurança
- RLS (Row Level Security) ativado em todas as tabelas
- Storage privado para documentos
- Edge Functions protegidas via JWT
- Políticas de acesso compartilhado

---

## Como funciona o versionamento

A versão é gerada automaticamente no formato `YYYY.MM.DD-HHMM`:
- **YYYY.MM.DD**: Data do build (ano, mês, dia)
- **HHMM**: Hora do build (para diferenciar múltiplos deploys no mesmo dia)

Exemplo: `2025.01.18-1423` = Build de 18/01/2025 às 14:23



# Corrigir dados de parcelas sem categoria (fix de dados)

## Problema
As parcelas de março em diante perderam a categoria e a descrição detalhada. Em fevereiro, as mesmas compras estão categorizadas e com descrições como "AMAZON BR TV sala - Parcela 7/12". Já em março, aparecem como "AMAZON BR 8/12 - Parcela 8/12" sem categoria.

Isso aconteceu porque as parcelas futuras foram criadas sem copiar a categoria e descrição da parcela original. O vínculo entre as parcelas de fevereiro (sem `installment_group_id`) e as de março+ (com `installment_group_id`) foi perdido.

## Mapeamento identificado

Cruzando valores e números de parcela, identifiquei todas as correspondências:

| Grupo (março+) | Valor | Descrição original (fev) | Categoria |
|---|---|---|---|
| cece2faa | - | AMAZON BR - Triturador | Reformas e melhorias |
| 79064ce3 | - | AMAZON BR TV sala | Móveis e equipamentos |
| b472bccd | - | AMAZON BR tico tico | Compras variadas |
| 99858b48 | - | DIGIPIX album casamento | Compras variadas |
| eab1c815 | 91.89 | ELECTROLUX electro cokietop | Reformas e melhorias |
| 459de388 | 333.89 | ELECTROLUX electro lava-louças | Reformas e melhorias |
| 47eb0443 | 56.99 | ELECTROLUX electro - filtro | Reformas e melhorias |
| 191e060c | - | Porta3Acessorios - óculos | Mais despesas com saúde |

## Solução

Executar 8 comandos SQL UPDATE para corrigir tanto a `category_id` quanto a `description` de cada grupo, restaurando a descrição original com o número da parcela correto.

### Dados a corrigir por grupo

**1. AMAZON BR - Triturador (grupo cece2faa)**
- category_id: `653a87f5` (Reformas e melhorias)
- Descrição: "AMAZON BR - Triturador- Parcela N/10"

**2. AMAZON BR TV sala (grupo 79064ce3)**
- category_id: `572cfcad` (Móveis e equipamentos)
- Descrição: "AMAZON BR TV sala - Parcela N/12"

**3. AMAZON BR tico tico (grupo b472bccd)**
- category_id: `721d1f7f` (Compras variadas)
- Descrição: "AMAZON BR tico tico- Parcela N/6"

**4. DIGIPIX album casamento (grupo 99858b48)**
- category_id: `721d1f7f` (Compras variadas)
- Descrição: "DIGIPIX album casamento - Parcela N/6"

**5. ELECTROLUX electro cokietop (grupo eab1c815)**
- category_id: `653a87f5` (Reformas e melhorias)
- Descrição: "ELECTROLUX electro cokietop - Parcela N/10"

**6. ELECTROLUX electro lava-louças (grupo 459de388)**
- category_id: `653a87f5` (Reformas e melhorias)
- Descrição: "ELECTROLUX electro lava-louças - Parcela N/10"

**7. ELECTROLUX electro - filtro (grupo 47eb0443)**
- category_id: `653a87f5` (Reformas e melhorias)
- Descrição: "ELECTROLUX electro - filtro - Parcela N/10"

**8. Porta3Acessorios - óculos (grupo 191e060c)**
- category_id: `ae44b038` (Mais despesas com saúde)
- Descrição: "Porta3Acessorios - óculos - Parcela N/10"

## Secao tecnica

Para cada grupo, será executado um UPDATE que:
1. Define a `category_id` correta
2. Reconstroi a `description` usando `installment_number || '/' || total_installments`

Exemplo de um UPDATE:
```text
UPDATE transactions
SET category_id = '653a87f5-...',
    description = 'AMAZON BR - Triturador- Parcela ' || installment_number || '/' || total_installments
WHERE installment_group_id = 'cece2faa-...'
```

Serão 8 updates, um por grupo. Nenhuma alteração de código necessária — a correção anterior já impede que isso aconteça novamente.

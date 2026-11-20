/**
 * Quando uma regra de categorização casa com a descrição de um lançamento.
 *
 * Maiúsculas/minúsculas e ESPAÇOS REPETIDOS não contam. O extrato do Itaú
 * mudou de formato em 09/2026: o débito do título de capitalização vinha
 * `CAP     PIC        40 60` e passou a vir `CAP PIC 41 60`. Comparando o
 * texto cru, a regra "CAP PIC" casava com um formato e não com o outro — e uma
 * regra que falha em silêncio devolve o aporte à despesa do mês.
 *
 * A normalização só faz casar o que antes falhava por espaço; nada que casava
 * deixa de casar.
 */
export function normalizeRuleText(text: string): string {
  return text.toUpperCase().replace(/\s+/g, " ").trim();
}

export function ruleMatches(description: string, keyword: string): boolean {
  const k = normalizeRuleText(keyword);
  return k.length > 0 && normalizeRuleText(description).includes(k);
}

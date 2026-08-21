/**
 * Descrição-base de um parcelamento: o texto sem os marcadores de parcela.
 *
 * Serve para reconstruir a descrição de cada parcela (`base 2/3`) sem que os
 * marcadores se acumulem a cada operação sobre o grupo.
 *
 * Existiam duas versões desta limpeza, com regras diferentes: uma em
 * `useInstallmentGroup` e outra em `InvoiceReviewModal`. Nenhuma reconhecia o
 * formato "Parcela 1 de 3" que aparece nas faturas, e a primeira ainda
 * apagava tudo depois de " - " — o que descartava justamente a parte escrita
 * à mão ("Clinica Progiante Parcela 1 de 3 - Placa bruxismo" virava
 * "Clinica Progiante Parcela 1 de 3": perdia a observação e mantinha o
 * marcador, exatamente ao contrário do pretendido).
 */
export function stripInstallmentMarkers(description: string): string {
  return (
    description
      // "Parcela 1 de 3", "Parcela 2/3", "PARC 2/3", "parc. 2/3"
      .replace(/\s*\bparc(?:ela)?\.?\s*\d+\s*(?:\/|\s+de\s+)\s*\d+/gi, " ")
      // "(2/3)"
      .replace(/\s*\(\s*\d{1,2}\s*\/\s*\d{1,2}\s*\)/g, " ")
      // "02/04" solto — inclusive colado no texto, como em "EC *SALLV02/02".
      // Limitado a 1–2 dígitos dos dois lados para não comer "01/2026".
      .replace(/\s*\d{1,2}\s*\/\s*\d{1,2}(?=\s|$)/g, " ")
      // Sobras: espaço duplicado e separador " - " que ficou órfão na ponta.
      .replace(/\s{2,}/g, " ")
      .replace(/\s*-\s*$/, "")
      .replace(/^\s*-\s*/, "")
      .trim()
  );
}

/**
 * Descrição da parcela `numero` de `total`, sem duplicar marcador.
 *
 * `numero` e `total` aceitam `null` porque é isso que as colunas
 * `installment_number` e `total_installments` devolvem — elas são nullable no
 * schema, ainda que toda linha de um grupo de parcelamento as tenha na
 * prática. O comportamento com `null` é o que sempre foi (o template literal
 * imprime "null"); não é guardado aqui de propósito, para não trocar
 * silenciosamente a descrição de uma linha malformada por uma inventada.
 */
export function buildInstallmentDescription(
  description: string,
  numero: number | null,
  total: number | null,
): string {
  return `${stripInstallmentMarkers(description)} ${numero}/${total}`;
}

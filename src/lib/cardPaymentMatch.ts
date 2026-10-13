/**
 * Qual cartão um pagamento de fatura do extrato pagou, pelo nome.
 *
 * A importação reconhece o pagamento pela descrição ("FATURA PAGA …") mas o
 * gravava sem cartão. Sem cartão, o pagamento não existe para a fatura: o
 * ciclo nunca vira "Paga" e o limite disponível fica subestimado. Foi o que
 * aconteceu com a fatura de 09/2026 do Itaú (R$ 9.568,59).
 *
 * É SUGESTÃO, confirmada na revisão da importação — nunca vínculo às cegas.
 * Ligar ao cartão errado abate em silêncio a fatura de outro. O caso real que
 * proíbe adivinhar: "FATURA PAGA UNICLASS BLA" é de um cartão que pode nem
 * estar cadastrado, e não pode cair no Personnalité só por ser o único.
 *
 * Regra: palavra da descrição (4+ letras, fora o vocabulário de pagamento)
 * que seja começo de palavra do nome do cartão, ou vice-versa — o banco
 * trunca ("PERSON" → "Personnalité", "UNICLASS BLA" → "Uniclass Black").
 * Exatamente UM cartão casando → sugere; nenhum ou vários → não sugere.
 */

const PAYMENT_WORDS = new Set([
  "fatura",
  "paga",
  "pago",
  "pagamento",
  "pgto",
  "cartao",
  "credito",
]);

function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !PAYMENT_WORDS.has(w));
}

export function suggestCardForPayment(
  description: string,
  cards: readonly { id: string; name: string }[],
): string | null {
  const descWords = words(description);
  if (descWords.length === 0) return null;

  const matches = cards.filter((card) => {
    const cardWords = words(card.name);
    return descWords.some((d) => cardWords.some((c) => c.startsWith(d) || d.startsWith(c)));
  });

  return matches.length === 1 ? matches[0].id : null;
}

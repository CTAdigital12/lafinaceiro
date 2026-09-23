// Guarda do arquivo que vai para a IA: tamanho e tipo, decididos no SERVIDOR.
//
// O `InvoiceImportModal` e o `AccountImportModal` já recusam arquivo acima de
// 10MB e fora da lista de formatos, mas isso é validação de CLIENTE: quem
// chamar a função direto passa por cima. E o `parse-invoice` mandava ao Gemini
// o que chegasse, com `mimeType = file.type || 'application/pdf'` — ou seja, o
// rótulo vinha do próprio cliente, e um arquivo SEM rótulo era declarado PDF
// por conta própria.
//
// Aqui quem decide o tipo é o CONTEÚDO, não o que o cliente diz. É o mesmo
// espírito do resto do repositório: a regra mora num lugar só e é fail-closed —
// assinatura que não reconhecemos é recusa, não chute.

/** Os formatos que os dois modais oferecem e que o Gemini lê como anexo. */
export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

/** O mesmo teto que as duas telas anunciam ("Máximo 10MB"). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Folga para o envelope do multipart no teste de `Content-Length`.
 *
 * O corpo carrega as fronteiras e os campos de texto além do arquivo, então
 * `Content-Length` é sempre MAIOR que o arquivo. Sem folga, um PDF de 10MB
 * exatos seria recusado por causa do envelope. A checagem exata acontece
 * depois, sobre `file.size`; esta aqui só existe para não deixar um corpo
 * absurdo ser materializado na memória pelo `req.formData()`.
 */
export const MULTIPART_SLACK_BYTES = 1024 * 1024;

/** Quantos bytes do início bastam para reconhecer a assinatura. */
export const SNIFF_BYTES = 1024;

export interface UploadRejection {
  status: 413 | 415;
  error: string;
  message: string;
}

export type UploadCheck =
  | { ok: true; mimeType: SupportedMimeType }
  | { ok: false; rejection: UploadRejection };

const tooLarge = (bytes: number | null): UploadRejection => ({
  status: 413,
  error: "file_too_large",
  message: bytes === null
    ? `Arquivo muito grande. Máximo ${formatMegabytes(MAX_UPLOAD_BYTES)}.`
    : `Arquivo de ${formatMegabytes(bytes)} excede o máximo de ${formatMegabytes(MAX_UPLOAD_BYTES)}.`,
});

function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  // Sem casa decimal quando é redondo: "10MB", não "10.0MB".
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)}MB`;
}

/**
 * Recusa um corpo grande demais ANTES de `req.formData()` materializá-lo.
 *
 * Cabeçalho ausente ou ilegível devolve `null` (segue em frente): com
 * `Transfer-Encoding: chunked` não existe `Content-Length`, e recusar por
 * ausência quebraria clientes legítimos. Quem garante o limite de verdade é
 * `checkUpload`, sobre o tamanho real do arquivo.
 */
export function checkContentLength(contentLength: string | null): UploadRejection | null {
  if (!contentLength) return null;

  const bytes = Number(contentLength);
  if (!Number.isFinite(bytes) || bytes <= 0) return null;

  return bytes > MAX_UPLOAD_BYTES + MULTIPART_SLACK_BYTES ? tooLarge(null) : null;
}

/**
 * O tipo do arquivo pelos BYTES dele, ignorando o que o cliente declarou.
 *
 * PNG e JPEG têm assinatura no byte 0. PDF, não necessariamente: o formato
 * admite lixo antes do `%PDF-`, e leitores procuram a marca no começo do
 * arquivo — por isso a busca varre o trecho recebido em vez de olhar só o
 * offset 0.
 */
export function sniffMimeType(head: Uint8Array): SupportedMimeType | null {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (indexOfBytes(head, [0x25, 0x50, 0x44, 0x46, 0x2d]) !== -1) return "application/pdf";
  return null;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, i) => bytes[i] === byte);
}

function indexOfBytes(bytes: Uint8Array, needle: number[]): number {
  const limit = bytes.length - needle.length;
  for (let i = 0; i <= limit; i++) {
    if (needle.every((byte, j) => bytes[i + j] === byte)) return i;
  }
  return -1;
}

/**
 * Decide se o arquivo entra e com que `mime_type` ele será anexado ao Gemini.
 *
 * `head` são os primeiros bytes do arquivo (ver `SNIFF_BYTES`). Arquivo vazio,
 * truncado ou de formato que não reconhecemos é recusado: mandar assim mesmo
 * gastaria uma chamada paga para receber de volta um JSON vazio, e era esse o
 * caminho quando o rótulo do cliente era aceito sem conferência.
 */
export function checkUpload(file: { size: number; head: Uint8Array }): UploadCheck {
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, rejection: tooLarge(file.size) };
  }

  if (file.size === 0) {
    return {
      ok: false,
      rejection: {
        status: 415,
        error: "empty_file",
        message: "O arquivo enviado está vazio.",
      },
    };
  }

  const mimeType = sniffMimeType(file.head);
  if (!mimeType) {
    return {
      ok: false,
      rejection: {
        status: 415,
        error: "unsupported_file_type",
        message: "Formato não suportado. Envie o arquivo em PDF, PNG ou JPG.",
      },
    };
  }

  return { ok: true, mimeType };
}

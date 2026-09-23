import { describe, it, expect } from "vitest";
import {
  checkContentLength,
  checkUpload,
  sniffMimeType,
  MAX_UPLOAD_BYTES,
  MULTIPART_SLACK_BYTES,
} from "../uploadGuard.ts";

const bytes = (...values: number[]) => new Uint8Array(values);

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]; // "%PDF-1.7"
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];

const arquivo = (head: number[], size = 1024) => ({ size, head: bytes(...head) });

describe("sniffMimeType", () => {
  it.each([
    ["PDF", PDF, "application/pdf"],
    ["PNG", PNG, "image/png"],
    ["JPEG", JPEG, "image/jpeg"],
  ])("reconhece %s pela assinatura", (_caso, assinatura, esperado) => {
    expect(sniffMimeType(bytes(...assinatura))).toBe(esperado);
  });

  // O formato admite lixo antes do `%PDF-`, e é assim que leitores de verdade
  // procuram a marca. Olhar só o offset 0 recusaria PDFs válidos.
  it("acha o %PDF- mesmo com bytes antes dele", () => {
    expect(sniffMimeType(bytes(0x0a, 0x0d, 0x20, ...PDF))).toBe("application/pdf");
  });

  it.each([
    ["assinatura desconhecida", [0x50, 0x4b, 0x03, 0x04]], // ZIP/XLSX
    ["texto puro", [0x64, 0x61, 0x74, 0x61]],
    ["vazio", []],
    ["truncado no meio da assinatura", [0x89, 0x50, 0x4e]],
  ])("devolve null para %s", (_caso, conteudo) => {
    expect(sniffMimeType(bytes(...conteudo))).toBeNull();
  });

  // Fail-closed: PNG com um byte trocado não pode passar como PNG.
  it("não aceita assinatura parecida mas errada", () => {
    expect(sniffMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x00))).toBeNull();
  });
});

describe("checkUpload", () => {
  it("aceita um PDF dentro do limite e devolve o tipo pelo conteúdo", () => {
    expect(checkUpload(arquivo(PDF))).toEqual({ ok: true, mimeType: "application/pdf" });
  });

  it("aceita o arquivo de tamanho exatamente igual ao limite", () => {
    expect(checkUpload(arquivo(PNG, MAX_UPLOAD_BYTES))).toEqual({
      ok: true,
      mimeType: "image/png",
    });
  });

  it("recusa com 413 um byte acima do limite, dizendo os dois tamanhos", () => {
    const resultado = checkUpload(arquivo(PDF, MAX_UPLOAD_BYTES + 1));

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.rejection.status).toBe(413);
    expect(resultado.rejection.error).toBe("file_too_large");
    expect(resultado.rejection.message).toContain("10MB");
  });

  it("recusa arquivo vazio, que só gastaria uma chamada paga", () => {
    const resultado = checkUpload(arquivo([], 0));

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.rejection.error).toBe("empty_file");
  });

  it("recusa com 415 o formato que não reconhecemos", () => {
    const resultado = checkUpload(arquivo([0x50, 0x4b, 0x03, 0x04])); // XLSX

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.rejection.status).toBe(415);
    expect(resultado.rejection.error).toBe("unsupported_file_type");
    expect(resultado.rejection.message).toMatch(/PDF, PNG ou JPG/);
  });

  // O ponto do módulo: o `mimeType` que vai para o Gemini vinha de
  // `file.type || 'application/pdf'` — rótulo do cliente, com um chute quando
  // ele não mandava nada. Agora o conteúdo manda, e o rótulo não é consultado.
  it("ignora o que o cliente declarou: o conteúdo é que decide", () => {
    expect(checkUpload(arquivo(PNG))).toEqual({ ok: true, mimeType: "image/png" });
    expect(checkUpload(arquivo([0x50, 0x4b, 0x03, 0x04])).ok).toBe(false);
  });

  it("checa o tamanho antes do tipo: arquivo enorme não vira 415", () => {
    const resultado = checkUpload(arquivo([0x50, 0x4b], MAX_UPLOAD_BYTES + 1));

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.rejection.status).toBe(413);
  });
});

describe("checkContentLength", () => {
  it("deixa passar um corpo dentro do limite mais a folga do envelope", () => {
    expect(checkContentLength(String(MAX_UPLOAD_BYTES + MULTIPART_SLACK_BYTES))).toBeNull();
  });

  it("recusa o corpo que passa do limite com folga", () => {
    const rejeicao = checkContentLength(String(MAX_UPLOAD_BYTES + MULTIPART_SLACK_BYTES + 1));

    expect(rejeicao?.status).toBe(413);
    expect(rejeicao?.error).toBe("file_too_large");
  });

  // A folga existe para o envelope do multipart (fronteiras e campos de texto).
  // Sem ela, um arquivo de 10MB exatos — que o limite ACEITA — seria recusado
  // antes de ser lido, porque o corpo que o carrega é maior que ele.
  it("não recusa um arquivo no limite por causa do envelope", () => {
    expect(checkContentLength(String(MAX_UPLOAD_BYTES + 2048))).toBeNull();
  });

  it.each([
    ["ausente", null],
    ["vazio", ""],
    ["não numérico", "muitos"],
    ["zero", "0"],
    ["negativo", "-5"],
  ])("segue em frente quando o cabeçalho é %s, porque a checagem real é depois", (_caso, valor) => {
    expect(checkContentLength(valor)).toBeNull();
  });
});

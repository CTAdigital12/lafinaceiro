import { test, after } from "node:test";
import assert from "node:assert/strict";
import { validate } from "../lib/validate.mjs";
import { repo, cli, adr, sol, adrPath, solPath, cleanupAll } from "./helpers.mjs";

after(cleanupAll);

const msgs = (r) => r.errors.map((e) => e.msg).join("\n");

test("§7 caso 1 — registros válidos passam", () => {
  const { dir, write } = repo();
  write("src/app.ts", "x");
  write(adrPath("ADR-0001"), adr("ADR-0001", { files: ["src/app.ts"], deps: [{ name: "zod", version: "^3" }] }));
  write(solPath("SOL-0001"), sol("SOL-0001", { files: ["src/app.ts"] }));
  const r = validate(dir);
  assert.deepEqual(r.errors, []);
  assert.equal(r.records.length, 2);
  assert.equal(cli(dir, "validate").status, 0);
});

test("§7 caso 2 — ID duplicado falha", () => {
  const { dir, write } = repo();
  write(adrPath("ADR-0001"), adr("ADR-0001"));
  write(".ai/memory/decisions/ADR-0001-outro.md", adr("ADR-0001", { title: "Outra" }));
  assert.match(msgs(validate(dir)), /ID duplicado: ADR-0001/);
  assert.equal(cli(dir, "validate").status, 1);
});

test("§7 caso 3 — solução verified/approved sem causa raiz falha; proposed pode", () => {
  const { dir, write } = repo();
  write(solPath("SOL-0001"), sol("SOL-0001", { status: "approved", omit: ["Causa raiz confirmada"] }));
  write(solPath("SOL-0002"), sol("SOL-0002", { status: "verified", replace: { "Causa raiz confirmada": "<A causa efetivamente comprovada.>" } }));
  write(solPath("SOL-0003"), sol("SOL-0003", { status: "proposed", confidence: "low", omit: ["Causa raiz confirmada"] }));
  const out = validate(dir).errors;
  assert.ok(out.some((e) => e.file.includes("SOL-0001") && /Causa raiz confirmada/.test(e.msg)), "seção ausente");
  assert.ok(out.some((e) => e.file.includes("SOL-0002") && /Causa raiz confirmada/.test(e.msg)), "só placeholder do template");
  assert.ok(!out.some((e) => e.file.includes("SOL-0003")), "proposed sem causa é permitido");
});

test("solução verified com confidence: low falha", () => {
  const { dir, write } = repo();
  write(solPath("SOL-0001"), sol("SOL-0001", { status: "verified", confidence: "low" }));
  assert.match(msgs(validate(dir)), /não pode ter confidence: low/);
});

test("§7 caso 8 — token de teste na memória é bloqueado; menção sem valor e exceção explícita não", () => {
  const { dir, write } = repo();
  const fakeToken = "ghp_" + "A1b2C3d4".repeat(5); // montado em tempo de execução
  write(solPath("SOL-0001"), sol("SOL-0001", { replace: { "Erro exato": `Header: ${fakeToken}` } }));
  write(solPath("SOL-0002"), sol("SOL-0002", { replace: { "Erro exato": "Nunca commite a service_role; use secrets do provedor." } }));
  write(solPath("SOL-0003"), sol("SOL-0003", { replace: { "Erro exato": `Exemplo público ${fakeToken} <!-- dev-memory:allow-secret -->` } }));
  const out = validate(dir).errors;
  assert.ok(out.some((e) => e.file.startsWith(solPath("SOL-0001")) && /token GitHub/.test(e.msg)));
  assert.ok(!out.some((e) => e.file.startsWith(solPath("SOL-0002"))), "menção sem valor não é segredo");
  assert.ok(!out.some((e) => e.file.startsWith(solPath("SOL-0003"))), "exceção explícita na linha");
});

test("CPF bloqueia; e-mail só avisa", () => {
  const { dir, write } = repo();
  // 000.000.000-00 é inválido pelos dígitos verificadores: não pertence a ninguém, mas tem o formato.
  write(".ai/memory/CURRENT_STATE.md", "Contato: alguem@exemplo.invalid\nCPF 000.000.000-00\n");
  const r = validate(dir);
  assert.ok(r.errors.some((e) => /CPF/.test(e.msg)));
  assert.ok(r.warnings.some((w) => /e-mail/.test(w.msg)));
});

test("§7 caso 9 (validate) — caminho removido/renomeado falha em registro ativo, não em superseded", () => {
  const { dir, write } = repo();
  write(adrPath("ADR-0001"), adr("ADR-0001", { files: ["src/sumiu.ts"] }));
  write(adrPath("ADR-0002"), adr("ADR-0002", { status: "superseded", files: ["src/sumiu.ts"] }));
  const out = validate(dir).errors;
  assert.ok(out.some((e) => e.file.includes("ADR-0001") && /não existe: src\/sumiu\.ts/.test(e.msg)));
  assert.ok(!out.some((e) => e.file.includes("ADR-0002")));
});

test("supersedes inválido, link quebrado, status, data e pasta errada falham", () => {
  const { dir, write } = repo();
  write(adrPath("ADR-0001"), adr("ADR-0001", { supersedes: ["ADR-0099"] }));
  write(adrPath("ADR-0002"), adr("ADR-0002", { status: "aprovado", reviewed: "09/11/2026" }));
  write(".ai/memory/solutions/ADR-0003-teste.md", adr("ADR-0003"));
  write(".ai/memory/CURRENT_STATE.md", "Veja [ADR](decisions/ADR-0404-x.md).\n");
  const m = msgs(validate(dir));
  assert.match(m, /supersedes aponta para ID inexistente: ADR-0099/);
  assert.match(m, /status inválido "aprovado"/);
  assert.match(m, /reviewed_at inválido/);
  assert.match(m, /deve ficar em \.ai\/memory\/decisions\//);
  assert.match(m, /link quebrado: decisions\/ADR-0404-x\.md/);
});

test("substituir sem marcar o antigo como superseded gera aviso", () => {
  const { dir, write } = repo();
  write(adrPath("ADR-0001"), adr("ADR-0001"));
  write(adrPath("ADR-0002"), adr("ADR-0002", { supersedes: ["ADR-0001"] }));
  const r = validate(dir);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => /ainda está com status "approved"/.test(w.msg)));
});

test("front matter inválido é erro do arquivo, não exceção do validador", () => {
  const { dir, write } = repo();
  write(adrPath("ADR-0001"), "---\nid: ADR-0001\ndeps: {a: 1}\n---\n");
  assert.match(msgs(validate(dir)), /mapa inline não é suportado/);
});

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "../hooks/stop-reminder.mjs";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "../hooks/stop-reminder.mjs");

const created = [];
after(() => created.forEach((d) => rmSync(d, { recursive: true, force: true })));

function makeRepo() {
  // Caminho com espaço de propósito (regressão: pastas de usuário com espaço).
  const dir = mkdtempSync(join(tmpdir(), "dev memory test "));
  created.push(dir);
  const git = (...args) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  write(dir, "src/app.js", "export const a = 1;\n");
  write(dir, ".ai/memory/INDEX.md", "# Índice\n");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  return { dir, git };
}

function write(dir, rel, content) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), content);
}

test("fora de um repositório Git: silêncio", () => {
  const dir = mkdtempSync(join(tmpdir(), "dev-memory-nogit-"));
  assert.equal(evaluate(dir), null);
  rmSync(dir, { recursive: true, force: true });
});

test("árvore limpa: silêncio", () => {
  const { dir } = makeRepo();
  assert.equal(evaluate(dir), null);
});

test("código alterado sem memória: avisa uma única vez", () => {
  const { dir } = makeRepo();
  write(dir, "src/app.js", "export const a = 2;\n");
  const msg = evaluate(dir);
  assert.match(msg, /Dev Memory: 1 arquivo\(s\) alterado\(s\)/);
  assert.match(msg, /src\/app\.js/);
  assert.match(msg, /\/close-task/);
  assert.equal(evaluate(dir), null, "mesmo conjunto de mudanças não deve avisar de novo");
});

test("novo conjunto de mudanças depois do aviso: avisa de novo", () => {
  const { dir } = makeRepo();
  write(dir, "src/app.js", "export const a = 2;\n");
  assert.ok(evaluate(dir));
  write(dir, "src/novo.js", "export const b = 1;\n");
  assert.match(evaluate(dir), /2 arquivo\(s\)/);
});

test("código e memória alterados juntos: silêncio", () => {
  const { dir } = makeRepo();
  write(dir, "src/app.js", "export const a = 2;\n");
  write(dir, ".ai/memory/decisions/ADR-0001-x.md", "---\nid: ADR-0001\n---\n");
  assert.equal(evaluate(dir), null);
});

test("estado do aviso fica dentro de .git, sem sujar a árvore de trabalho", () => {
  const { dir, git } = makeRepo();
  write(dir, "src/app.js", "export const a = 2;\n");
  const before = git("status", "--porcelain");
  evaluate(dir);
  assert.equal(git("status", "--porcelain"), before);
});

test("CLI: caminho com espaço emite JSON com systemMessage e sai com 0", () => {
  const { dir } = makeRepo();
  write(dir, "src/app.js", "export const a = 2;\n");
  const r = spawnSync("node", [HOOK], { input: "{}", env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(JSON.parse(r.stdout).systemMessage, /Dev Memory/);
});

test("CLI: entrada inválida e diretório inexistente não quebram o hook", () => {
  const r = spawnSync("node", [HOOK], {
    input: "isto não é json",
    env: { ...process.env, CLAUDE_PROJECT_DIR: join(tmpdir(), "nao-existe-dev-memory") },
    encoding: "utf8",
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

// Regressão: os pontos de entrada não podem sair 0 em silêncio por causa do caminho de execução
// (espaço no caminho e symlink; ver ORG-0001 em organization-knowledge).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { repo, adr, adrPath, cleanupAll } from "./helpers.mjs";

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..");
const links = [];
after(() => {
  links.forEach((d) => rmSync(d, { recursive: true, force: true }));
  cleanupAll();
});

function viaSymlink() {
  const d = mkdtempSync(join(tmpdir(), "dev memory link "));
  links.push(d);
  const link = join(d, "kit com espaco");
  symlinkSync(SCRIPTS, link, "dir");
  return link;
}

test("CLI chamada por symlink executa de verdade (não sai 0 em silêncio)", () => {
  const { dir, write } = repo();
  write(adrPath("ADR-0001"), adr("ADR-0001"));
  const r = spawnSync("node", [join(viaSymlink(), "cli.mjs"), "validate", "--root", dir], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /validate: 1 registro\(s\), 0 erro\(s\)/);
});

test("CLI chamada por symlink propaga falha (validate com erro → exit 1)", () => {
  const { dir, write } = repo();
  write(adrPath("ADR-0001"), adr("ADR-0001", { status: "invalido" }));
  const r = spawnSync("node", [join(viaSymlink(), "cli.mjs"), "validate", "--root", dir], { encoding: "utf8" });
  assert.equal(r.status, 1);
});

test("hook chamado por symlink emite o aviso", () => {
  const { dir, write, commit } = repo();
  commit("base"); // memória commitada: só a mudança de código abaixo fica pendente
  write("src/app.js", "x\n");
  const r = spawnSync("node", [join(viaSymlink(), "hooks/stop-reminder.mjs")], {
    input: "{}",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    encoding: "utf8",
  });
  assert.equal(r.status, 0);
  assert.match(JSON.parse(r.stdout).systemMessage, /Dev Memory/);
});

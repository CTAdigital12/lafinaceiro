import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkStaleness } from "../lib/staleness.mjs";
import { repo, cli, adr, sol, adrPath, solPath, cleanupAll } from "./helpers.mjs";

after(cleanupAll);

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "../hooks/stop-reminder.mjs");

// main: código + registros; branch "feat" recebe as mudanças de cada teste.
function setup() {
  const r = repo();
  r.write("src/auth.ts", "export const a = 1;\n");
  r.write("src/outro.ts", "export const b = 1;\n");
  r.write("package.json", JSON.stringify({ dependencies: { "@supabase/supabase-js": "^2.40.0", zod: "^3.0.0" } }, null, 2) + "\n");
  r.write(adrPath("ADR-0001"), adr("ADR-0001", { files: ["src/auth.ts"], deps: [{ name: "supabase-js", version: "^2" }] }));
  r.write(solPath("SOL-0001"), sol("SOL-0001", { files: ["src/"] }));
  r.commit("base");
  r.git("checkout", "-q", "-b", "feat");
  return r;
}

const run = (dir) => checkStaleness(dir, { base: "main", head: "HEAD" });
const of = (res, kind, id) => res.findings.filter((f) => f.kind === kind && (id === undefined || f.id === id));

test("§7 caso 5 — mudança em arquivo de files: gera aviso de revisão", () => {
  const { dir, write, commit } = setup();
  write("src/auth.ts", "export const a = 2;\n");
  commit("muda auth");
  const res = run(dir);
  const f = of(res, "file", "ADR-0001");
  assert.equal(f.length, 1);
  assert.equal(f[0].detail, "alterado");
  assert.equal(f[0].ack, null);
  assert.equal(of(res, "file", "SOL-0001").length, 1, "entrada de diretório (src/) cobre arquivos dentro dela");
});

test("§7 caso 6 — mudança não relacionada não gera aviso sobre registros", () => {
  const { dir, write, commit } = setup();
  write("docs/guia.md", "texto\n");
  commit("docs");
  const res = run(dir);
  assert.equal(of(res, "file").length, 0);
  assert.equal(of(res, "dep").length, 0);
});

test("§7 caso 7 — mudança em dependência referenciada gera aviso; outra dependência não", () => {
  const { dir, write, commit } = setup();
  write("package.json", JSON.stringify({ dependencies: { "@supabase/supabase-js": "^2.45.0", zod: "^3.0.0" } }, null, 2) + "\n");
  commit("bump supabase");
  const dep = of(run(dir), "dep", "ADR-0001");
  assert.equal(dep.length, 1);
  assert.equal(dep[0].dep, "supabase-js");
  assert.equal(dep[0].path, "package.json");

  write("package.json", JSON.stringify({ dependencies: { "@supabase/supabase-js": "^2.45.0", zod: "^3.1.0" } }, null, 2) + "\n");
  commit("bump zod");
  const res = checkStaleness(dir, { base: "HEAD~1", head: "HEAD" });
  assert.equal(of(res, "dep").length, 0, "zod não é referenciado por nenhum registro");
});

test("§7 caso 9 — renomeação e remoção de caminho referenciado são sinalizadas", () => {
  const { dir, git, commit } = setup();
  git("mv", "src/auth.ts", "src/autenticacao.ts");
  commit("renomeia");
  const ren = of(run(dir), "file", "ADR-0001");
  assert.equal(ren.length, 1);
  assert.match(ren[0].detail, /renomeado para src\/autenticacao\.ts/);

  git("rm", "-q", "src/outro.ts");
  commit("remove");
  const rem = of(checkStaleness(dir, { base: "HEAD~1", head: "HEAD" }), "file", "SOL-0001");
  assert.equal(rem.length, 1);
  assert.equal(rem[0].detail, "removido");
});

test("§7 caso 10 — falha no hook não impede o CI de sinalizar ausência de memória", () => {
  const { dir, write, commit } = setup();
  write("src/novo.ts", "export const n = 1;\n");
  // Hook "quebrado": diretório inválido e entrada inválida. Ele sai 0 em silêncio...
  const hook = spawnSync("node", [HOOK], { input: "lixo", env: { ...process.env, CLAUDE_PROJECT_DIR: join(dir, "nao-existe") }, encoding: "utf8" });
  assert.equal(hook.status, 0);
  assert.equal(hook.stdout, "");
  commit("código sem memória");
  // ...e o check do PR continua sinalizando.
  const nm = of(run(dir), "no-memory");
  assert.equal(nm.length, 1);
  assert.equal(nm[0].ack, null);
  const out = cli(dir, "check-staleness", "--base", "main", "--head", "HEAD");
  assert.equal(out.status, 0, "aviso não bloqueia por padrão");
  assert.match(out.stdout, /sem memória/);
  assert.equal(cli(dir, "check-staleness", "--base", "main", "--head", "HEAD", "--strict").status, 1);
});

test("reconhecimento: registro atualizado no mesmo diff e trailers de commit", () => {
  const { dir, write, commit } = setup();
  write("src/auth.ts", "export const a = 3;\n");
  write(adrPath("ADR-0001"), adr("ADR-0001", { files: ["src/auth.ts"], deps: [{ name: "supabase-js" }], reviewed: "2026-11-10" }));
  commit("muda auth e revisa ADR");
  assert.equal(of(run(dir), "file", "ADR-0001")[0].ack, "registro atualizado neste diff");
  assert.equal(of(run(dir), "no-memory").length, 0);
  // SOL-0001 (src/) também foi tocada e não foi revisada: continua pendente.
  assert.equal(of(run(dir), "file", "SOL-0001")[0].ack, null);

  write("src/auth.ts", "export const a = 4;\n");
  commit("ajuste\n\nMemory-Reviewed: SOL-0001 mudança só de valor, solução segue válida");
  assert.equal(of(run(dir), "file", "SOL-0001")[0].ack, "trailer Memory-Reviewed");
});

test("trailer No-Memory-Change reconhece mudança sem memória", () => {
  const { dir, write, commit } = setup();
  write("docs/x.md", "y\n");
  commit("docs\n\nNo-Memory-Change: só documentação");
  assert.equal(of(run(dir), "no-memory")[0].ack, "trailer No-Memory-Change");
});

test("sem --head, considera a árvore de trabalho (mudanças não commitadas e arquivos novos)", () => {
  const { dir, write } = setup();
  write("src/auth.ts", "export const a = 9;\n");
  const res = checkStaleness(dir, { base: "main" });
  assert.equal(of(res, "file", "ADR-0001").length, 1);
  assert.equal(res.head, "árvore de trabalho");
});

test("base inexistente: erro claro com código 2", () => {
  const { dir } = setup();
  const out = cli(dir, "check-staleness", "--base", "nao-existe");
  assert.equal(out.status, 2);
  assert.match(out.stderr, /merge-base/);
});

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildIndex, INDEX_PATH } from "../lib/build-index.mjs";
import { repo, cli, adr, sol, adrPath, solPath, cleanupAll } from "./helpers.mjs";

after(cleanupAll);

test("§7 caso 4 — índice determinístico, ordenado por ID e sem rejected", () => {
  const a = repo();
  const b = repo();
  // Mesma memória escrita em ordens diferentes, em repositórios diferentes.
  a.write(adrPath("ADR-0010"), adr("ADR-0010", { title: "Dez" }));
  a.write(adrPath("ADR-0002"), adr("ADR-0002", { title: "Dois | com barra" }));
  a.write(adrPath("ADR-0003"), adr("ADR-0003", { title: "Rejeitada", status: "rejected" }));
  a.write(solPath("SOL-0001"), sol("SOL-0001"));
  b.write(solPath("SOL-0001"), sol("SOL-0001"));
  b.write(adrPath("ADR-0003"), adr("ADR-0003", { title: "Rejeitada", status: "rejected" }));
  b.write(adrPath("ADR-0002"), adr("ADR-0002", { title: "Dois | com barra" }));
  b.write(adrPath("ADR-0010"), adr("ADR-0010", { title: "Dez" }));

  assert.equal(buildIndex(a.dir).written, true);
  buildIndex(b.dir);
  const ia = readFileSync(join(a.dir, INDEX_PATH), "utf8");
  assert.equal(ia, readFileSync(join(b.dir, INDEX_PATH), "utf8"), "mesma memória => mesmo índice");

  assert.ok(ia.indexOf("ADR-0002") < ia.indexOf("ADR-0010"), "ordem numérica, não alfabética de arquivo");
  assert.ok(!ia.includes("Rejeitada"), "rejected não é indexado");
  assert.ok(ia.includes("Dois \\| com barra"), "barra vertical escapada na tabela");
  assert.ok(ia.includes("_Nenhum problema conhecido registrado._"));

  const again = buildIndex(a.dir);
  assert.equal(again.written, false, "segunda execução não reescreve");
  assert.equal(readFileSync(join(a.dir, INDEX_PATH), "utf8"), ia);
});

test("build-index --check falha quando o índice está desatualizado", () => {
  const { dir, write } = repo();
  write(adrPath("ADR-0001"), adr("ADR-0001"));
  assert.equal(cli(dir, "build-index", "--check").status, 1, "índice inexistente");
  assert.equal(cli(dir, "build-index").status, 0);
  assert.equal(cli(dir, "build-index", "--check").status, 0);
  write(adrPath("ADR-0002"), adr("ADR-0002"));
  assert.equal(cli(dir, "build-index", "--check").status, 1, "registro novo sem regenerar");
});

test("índice gerado passa no validate (links válidos)", () => {
  const { dir, write } = repo();
  write(adrPath("ADR-0001"), adr("ADR-0001"));
  write(solPath("SOL-0001"), sol("SOL-0001"));
  buildIndex(dir);
  assert.equal(cli(dir, "validate").status, 0);
});

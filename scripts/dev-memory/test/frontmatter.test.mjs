import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRecordText, parseYamlSubset, FrontMatterError } from "../lib/frontmatter.mjs";
import { KIT_ROOT } from "./helpers.mjs";

test("lê escalares, listas inline, listas em bloco e lista de mapas", () => {
  const d = parseYamlSubset(`id: SOL-0001
title: "Título: com dois-pontos"   # comentário
reviewed_at: null
review_required: false
stack: [typescript, "supabase"]
files:
  - src/a.ts
  - "src/b c.ts"
deps:
  - name: supabase-js
    version: "^2"
  - name: zod
url: https://exemplo.invalid/a#ancora
vazio: []`);
  assert.deepEqual(d, {
    id: "SOL-0001",
    title: "Título: com dois-pontos",
    reviewed_at: null,
    review_required: false,
    stack: ["typescript", "supabase"],
    files: ["src/a.ts", "src/b c.ts"],
    deps: [{ name: "supabase-js", version: "^2" }, { name: "zod" }],
    url: "https://exemplo.invalid/a#ancora",
    vazio: [],
  });
});

test("os três templates do kit são lidos sem erro", () => {
  for (const t of ["adr.md", "solution.md", "known-issue.md"]) {
    const { data } = parseRecordText(readFileSync(join(KIT_ROOT, ".ai/templates", t), "utf8"));
    assert.ok(data.id && data.type && Array.isArray(data.files) && Array.isArray(data.deps), t);
  }
});

test("rejeita construções fora do subconjunto, em vez de ler errado", () => {
  assert.throws(() => parseYamlSubset("a: {x: 1}"), FrontMatterError);
  assert.throws(() => parseYamlSubset("a: 1\na: 2"), /chave repetida/);
  assert.throws(() => parseYamlSubset("a: |\n  texto"), FrontMatterError);
  assert.throws(() => parseYamlSubset("sem dois pontos"), FrontMatterError);
  assert.throws(() => parseRecordText("sem front matter"), /front matter ausente/);
});

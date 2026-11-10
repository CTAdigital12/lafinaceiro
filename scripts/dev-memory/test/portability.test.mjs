// Os arquivos do kit são copiados para outros projetos: não podem citar registros, fases ou versões
// verificadas de UM projeto (lá esses IDs não existem ou são outra coisa). Referência a registro do
// próprio kit é permitida quando qualificada com "do kit"; ORG-NNNN é global e pode ser citado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { KIT_ROOT } from "./helpers.mjs";

const PORTABLE = [
  ".ai/README.md", ".ai/templates", ".ai/skills", ".claude/skills",
  "scripts/dev-memory/cli.mjs", "scripts/dev-memory/lib", "scripts/dev-memory/hooks",
  ".github/workflows/dev-memory.yml",
];

const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => walk(join(p, f))) : [p]);

const RULES = [
  [/\b(?:ADR|SOL|ISSUE)-(?!0000\b)\d{4}\b(?! do kit)/, "cita registro de projeto (use <ID>, NNNN, ou qualifique com \"do kit\")"],
  [/\bFase [0-9]\b/, "cita fase do MVP do kit"],
  [/\bv\d+\.\d+\.\d+\b.*\b20\d\d-\d\d-\d\d\b/, "cita versão verificada com data (vai em CURRENT_STATE.md do projeto)"],
];

test("arquivos portáveis do kit não citam fatos de um projeto específico", () => {
  const problems = [];
  for (const entry of PORTABLE) {
    const abs = join(KIT_ROOT, entry);
    if (!existsSync(abs)) continue; // ex.: projeto que não usa .claude/skills
    for (const f of walk(abs)) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        for (const [re, why] of RULES) if (re.test(line)) problems.push(`${relative(KIT_ROOT, f)}:${i + 1}: ${why}\n    ${line.trim().slice(0, 120)}`);
      });
    }
  }
  assert.deepEqual(problems, [], "\n" + problems.join("\n"));
});

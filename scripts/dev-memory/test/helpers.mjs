// Utilitários de teste: repositórios Git temporários e geradores de registros.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const CLI = join(dirname(fileURLToPath(import.meta.url)), "../cli.mjs");
export const KIT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const created = [];
export const cleanupAll = () => created.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));

export function repo() {
  const dir = mkdtempSync(join(tmpdir(), "dev memory test ")); // espaço de propósito
  created.push(dir);
  const git = (...a) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...a], {
      cwd: dir,
      encoding: "utf8",
    });
  const write = (rel, content) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  };
  const commit = (msg = "c") => {
    git("add", "-A");
    git("commit", "-q", "--allow-empty", "-m", msg);
  };
  git("init", "-q", "-b", "main");
  write(".ai/memory/PROJECT.md", "# Projeto\n");
  write(".ai/memory/CURRENT_STATE.md", "# Estado\n");
  return { dir, git, write, commit };
}

export const cli = (dir, ...args) => spawnSync("node", [CLI, ...args, "--root", dir], { encoding: "utf8" });

const list = (key, arr) =>
  !arr.length
    ? `${key}: []`
    : `${key}:\n` +
      arr.map((v) => (typeof v === "object" ? `  - name: ${v.name}\n    version: "${v.version ?? "*"}"` : `  - ${v}`)).join("\n");

export const adrPath = (id) => `.ai/memory/decisions/${id}-teste.md`;
export const solPath = (id) => `.ai/memory/solutions/${id}-teste.md`;

export function adr(id, o = {}) {
  const { status = "approved", title = "Decisão de teste", files = [], deps = [], supersedes = [], reviewed = "null" } = o;
  return `---
id: ${id}
type: decision
title: ${title}
status: ${status}
created_at: 2026-11-09
reviewed_at: ${reviewed}
owner: equipe
scope: project
${list("files", files)}
${list("deps", deps)}
related_prs: []
${list("supersedes", supersedes)}
review_required: false
---

## Contexto
Contexto concreto.

## Decisão
Decisão concreta.
`;
}

export const SOL_SECTIONS = [
  "Sintoma reproduzível", "Erro exato", "Causa raiz confirmada", "Diagnóstico executado",
  "Correção aplicada", "Validação", "Quando reutilizar", "Quando NÃO reutilizar", "Evidências",
];

export function sol(id, o = {}) {
  const { status = "verified", confidence = "high", files = [], deps = [], omit = [], replace = {}, title = "Solução de teste" } = o;
  const body = SOL_SECTIONS.filter((s) => !omit.includes(s))
    .map((s) => `## ${s}\n${replace[s] ?? `Conteúdo concreto de ${s}.`}\n`)
    .join("\n");
  return `---
id: ${id}
type: solution
title: ${title}
status: ${status}
created_at: 2026-11-09
reviewed_at: null
scope: project
stack: [node]
tags: [teste]
${list("files", files)}
${list("deps", deps)}
related_prs: []
related_commits: []
supersedes: []
review_required: false
confidence: ${confidence}
---

${body}`;
}

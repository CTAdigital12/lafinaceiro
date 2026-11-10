#!/usr/bin/env node
// Dev Memory — lembrete leve de encerramento de tarefa (hook "Stop" do Claude Code).
//
// Comportamento:
// - Se há arquivos alterados fora de .ai/memory/ e nenhuma alteração em .ai/memory/,
//   emite um aviso ao usuário sugerindo /close-task.
// - Avisa uma única vez por conjunto de mudanças: guarda uma impressão digital em
//   <git-dir>/dev-memory/last-reminder (fora da árvore versionada).
// - Nunca bloqueia, nunca escreve na árvore de trabalho, nunca publica nada.
//   Qualquer erro termina em silêncio com código 0.
//
// Sem dependências: apenas Node.js (stdlib).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MEMORY_PREFIX = ".ai/memory/";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

// Exportada para testes. Retorna a mensagem a exibir, ou null.
export function evaluate(cwd) {
  let status;
  try {
    status = git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  } catch {
    return null; // não é repositório Git
  }

  const paths = [];
  const entries = status.split("\0").filter(Boolean);
  for (let i = 0; i < entries.length; i++) {
    const code = entries[i].slice(0, 2);
    paths.push(entries[i].slice(3));
    if (code.includes("R") || code.includes("C")) i++; // pula o caminho de origem do rename/cópia
  }
  if (paths.length === 0) return null;

  if (paths.some((p) => p.startsWith(MEMORY_PREFIX))) return null; // memória já está sendo tratada
  const relevant = paths.sort();

  const fingerprint = createHash("sha256").update(status).digest("hex");
  const stateFile = resolve(cwd, git(cwd, ["rev-parse", "--git-path", "dev-memory/last-reminder"]).trim());
  try {
    if (readFileSync(stateFile, "utf8").trim() === fingerprint) return null; // já avisado
  } catch {
    /* primeiro aviso */
  }
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, fingerprint + "\n");

  const sample = relevant.slice(0, 3).join(", ") + (relevant.length > 3 ? ", …" : "");
  return (
    `Dev Memory: ${relevant.length} arquivo(s) alterado(s) sem mudança em .ai/memory/ (${sample}). ` +
    `Se a tarefa terminou, rode /close-task — ele propõe registros ou declara no-memory-change.`
  );
}

// Executado direto? pathToFileURL: espaço vira %20 em import.meta.url (ORG-0001 em organization-knowledge).
// realpathSync: o Node resolve symlinks do script principal (ex.: /tmp -> /private/tmp no macOS).
function isMain() {
  try {
    return !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    const input = readStdin();
    const cwd = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
    const message = evaluate(cwd);
    if (message) process.stdout.write(JSON.stringify({ systemMessage: message }) + "\n");
  } catch {
    /* nunca falhar o hook */
  }
  process.exit(0);
}

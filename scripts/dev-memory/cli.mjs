#!/usr/bin/env node
// Dev Memory — CLI. Sem dependências: apenas Node.js (stdlib) e git.
//
//   node scripts/dev-memory/cli.mjs validate
//   node scripts/dev-memory/cli.mjs build-index [--check]
//   node scripts/dev-memory/cli.mjs check-staleness [--base main] [--head REF] [--strict]
//
// Opção comum: --root DIR (padrão: raiz do repositório Git atual).
// Códigos de saída: 0 ok | 1 falha de validação / índice desatualizado / avisos com --strict | 2 erro de uso.

import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { validate } from "./lib/validate.mjs";
import { buildIndex, INDEX_PATH } from "./lib/build-index.mjs";
import { checkStaleness } from "./lib/staleness.mjs";

const GH = process.env.GITHUB_ACTIONS === "true";
// Anotação do GitHub Actions. "arquivo:linha" vira file=,line=; sem linha, aponta para a linha 1 do arquivo.
function annotate(level, file, msg) {
  if (!GH) return;
  const [path, line] = (file ?? "").split(":");
  const where = path ? ` file=${path},line=${line || 1}` : "";
  console.log(`::${level}${where}::${msg}`);
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) throw new Error(`argumento inesperado: ${a}`);
    const key = a.slice(2);
    if (["check", "strict"].includes(key)) opts[key] = true;
    else if (["root", "base", "head"].includes(key)) {
      if (rest[i + 1] === undefined) throw new Error(`--${key} exige um valor`);
      opts[key] = rest[++i];
    } else throw new Error(`opção desconhecida: ${a}`);
  }
  return { cmd, opts };
}

function repoRoot(dir) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return resolve(dir);
  }
}

function cmdValidate(root) {
  const { errors, warnings, records } = validate(root);
  for (const e of errors) {
    console.log(`✗ ${e.file}: ${e.msg}`);
    annotate("error", e.file, e.msg);
  }
  for (const w of warnings) {
    console.log(`⚠ ${w.file}: ${w.msg}`);
    annotate("warning", w.file, w.msg);
  }
  console.log(`\nvalidate: ${records.length} registro(s), ${errors.length} erro(s), ${warnings.length} aviso(s).`);
  console.log("Lembrete: o detector de segredos não substitui revisão humana.");
  return errors.length ? 1 : 0;
}

function cmdBuildIndex(root, { check }) {
  const r = buildIndex(root, { check });
  if (!r.ok) {
    for (const p of r.problems) console.log(`✗ ${p.file}: ${p.msg}`);
    console.log("\nbuild-index: corrija os registros acima (rode validate).");
    return 1;
  }
  if (check) {
    if (r.upToDate) console.log(`build-index --check: ${INDEX_PATH} em dia (${r.count} registro(s)).`);
    else {
      console.log(`✗ ${INDEX_PATH} desatualizado. Rode: node scripts/dev-memory/cli.mjs build-index`);
      annotate("error", INDEX_PATH, "INDEX.md desatualizado: rode build-index");
    }
    return r.upToDate ? 0 : 1;
  }
  console.log(r.written ? `build-index: ${INDEX_PATH} atualizado (${r.count} registro(s)).` : `build-index: ${INDEX_PATH} já estava em dia.`);
  return 0;
}

function cmdStaleness(root, { base, head, strict }) {
  const r = checkStaleness(root, { base, head });
  console.log(`check-staleness: ${r.base} (merge-base ${r.mergeBase.slice(0, 7)}) → ${r.head}; ${r.changes.length} arquivo(s) alterado(s).\n`);
  const pending = r.findings.filter((f) => !f.ack);
  for (const f of r.findings) {
    const mark = f.ack ? "✓" : "⚠";
    let msg;
    if (f.kind === "file") msg = `${f.id}: arquivo referenciado ${f.path} ${f.detail}`;
    else if (f.kind === "dep") msg = `${f.id}: dependência referenciada "${f.dep}" mudou em ${f.path} (${f.detail})`;
    else msg = `sem memória: ${f.detail}`;
    console.log(`${mark} ${msg}${f.ack ? ` — reconhecido: ${f.ack}` : ""}`);
    if (!f.ack) annotate("warning", f.record ?? null, msg);
  }
  if (pending.length) {
    console.log(`
Como resolver cada aviso (escolha um):
  • registro afetado: revise-o no mesmo PR (atualize conteúdo, reviewed_at, status ou review_required: true);
  • ainda válido: acrescente a um commit o trailer  Memory-Reviewed: <ID> <motivo>;
  • sem memória: rode close-task, ou declare no commit  No-Memory-Change: <motivo>.`);
  }
  console.log(`\ncheck-staleness: ${pending.length} aviso(s), ${r.findings.length - pending.length} reconhecido(s).${pending.length && !strict ? " Avisos não bloqueiam (use --strict para falhar)." : ""}`);
  return strict && pending.length ? 1 : 0;
}

export function main(argv, cwd = process.cwd()) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (e) {
    console.error(`erro: ${e.message}`);
    return 2;
  }
  const { cmd, opts } = parsed;
  const root = opts.root ? resolve(opts.root) : repoRoot(cwd);
  try {
    if (cmd === "validate") return cmdValidate(root);
    if (cmd === "build-index") return cmdBuildIndex(root, opts);
    if (cmd === "check-staleness") return cmdStaleness(root, opts);
  } catch (e) {
    console.error(`erro: ${e.message}`);
    return 2;
  }
  console.error("uso: cli.mjs <validate | build-index [--check] | check-staleness [--base REF] [--head REF] [--strict]> [--root DIR]");
  return 2;
}

// Executado direto? Espaço no caminho e symlink (ex.: /tmp -> /private/tmp) precisam de
// pathToFileURL + realpathSync (ORG-0001 em organization-knowledge); sem isso a CLI sairia 0 em
// silêncio e o CI "passaria" sem validar.
function isMain() {
  try {
    return !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isMain()) process.exitCode = main(process.argv.slice(2));
